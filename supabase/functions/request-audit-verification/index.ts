import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import {
  empreinteAudit,
  normaliserEmailAudit,
} from "../_shared/public-audit.ts";
import { consommerQuotas } from "../_shared/ratelimit.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(
  data: Record<string, unknown>,
  status: number,
  cors: HeadersInit,
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function codeAleatoire(): string {
  const valeur = new Uint32Array(1);
  const borne = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  do crypto.getRandomValues(valeur); while (valeur[0] >= borne);
  return (valeur[0] % 1_000_000).toString().padStart(6, "0");
}

Deno.serve(async (req) => {
  const CORS = corsHeaders(req, {
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, CORS);
  }

  const BREVO = Deno.env.get("BREVO");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!BREVO || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error(
      "Audit verification function is missing a required environment variable",
    );
    return json({ error: "service_unavailable" }, 500, CORS);
  }

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "json_invalide" }, 400, CORS);
  }

  if (typeof body.email !== "string") {
    return json({ error: "email_invalide" }, 400, CORS);
  }
  const email = normaliserEmailAudit(body.email);
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return json({ error: "email_invalide" }, 400, CORS);
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const emailHash = await empreinteAudit(SERVICE_ROLE_KEY, `email:${email}`);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const quota = await consommerQuotas(sb, [
    { cle: `audit_otp_request_ip:${ip}`, max: 10 },
    {
      cle: `audit_otp_request_email_minute:${emailHash}`,
      max: 1,
      fenetreSecondes: 60,
    },
    { cle: `audit_otp_request_email:${emailHash}`, max: 5 },
  ]);
  if (!quota.ok) return json({ error: "rate_limit" }, 429, CORS);

  const { error: cleanupError } = await sb
    .from("public_audit_email_challenges")
    .delete()
    .lt("created_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString());
  if (cleanupError) {
    console.error(
      "Could not clean up expired public audit challenges:",
      cleanupError.message,
    );
    return json({ error: "service_unavailable" }, 500, CORS);
  }
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { error: submissionsCleanupError } = await sb
    .from("public_audit_submissions")
    .delete()
    .lt("month_start", monthStart.toISOString().slice(0, 10));
  if (submissionsCleanupError) {
    console.error(
      "Could not clean up expired public audit submissions:",
      submissionsCleanupError.message,
    );
    return json({ error: "service_unavailable" }, 500, CORS);
  }

  const code = codeAleatoire();
  const codeHash = await empreinteAudit(
    SERVICE_ROLE_KEY,
    `code:${emailHash}:${code}`,
  );
  const { error: saveError } = await sb.from("public_audit_email_challenges")
    .upsert({
      email_hash: emailHash,
      code_hash: codeHash,
      code_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      attempts: 0,
      verification_token_hash: null,
      verified_until: null,
      created_at: new Date().toISOString(),
    }, { onConflict: "email_hash" });

  if (saveError) {
    console.error(
      "Could not store public audit email challenge:",
      saveError.message,
    );
    return json({ error: "service_unavailable" }, 500, CORS);
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      to: [{ email }],
      sender: {
        email: "contact@safe-digitalisation.fr",
        name: "S@FE Safe Digitalisation",
      },
      replyTo: {
        email: "contact@safe-digitalisation.fr",
        name: "S@FE Safe Digitalisation",
      },
      subject: "Votre code de confirmation — audit S@FE",
      htmlContent:
        `<p>Voici votre code de confirmation pour recevoir et enregistrer votre rapport d'audit S@FE :</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:.2em;font-family:monospace">${code}</p>
        <p>Ce code est valable 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Brevo audit verification error:", response.status, detail);
    return json({ error: "email_envoi_impossible" }, 502, CORS);
  }

  return json({ ok: true }, 200, CORS);
});
