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

function tokenAleatoire(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
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

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error(
      "Audit verification function is missing a required environment variable",
    );
    return json({ error: "service_unavailable" }, 500, CORS);
  }

  let body: { email?: unknown; code?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "json_invalide" }, 400, CORS);
  }

  if (typeof body.email !== "string" || typeof body.code !== "string") {
    return json({ error: "code_invalide_ou_expire" }, 400, CORS);
  }
  const email = normaliserEmailAudit(body.email);
  const code = body.code.trim();
  if (email.length > 254 || !EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) {
    return json({ error: "code_invalide_ou_expire" }, 400, CORS);
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const emailHash = await empreinteAudit(SERVICE_ROLE_KEY, `email:${email}`);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const quota = await consommerQuotas(sb, [
    { cle: `audit_otp_verify_ip:${ip}`, max: 30 },
    { cle: `audit_otp_verify_email:${emailHash}`, max: 10 },
  ]);
  if (!quota.ok) return json({ error: "rate_limit" }, 429, CORS);

  const token = tokenAleatoire();
  const [codeHash, tokenHash] = await Promise.all([
    empreinteAudit(SERVICE_ROLE_KEY, `code:${emailHash}:${code}`),
    empreinteAudit(SERVICE_ROLE_KEY, `token:${token}`),
  ]);
  const { data: verified, error: verifyError } = await sb.rpc(
    "verify_public_audit_email",
    {
      p_email_hash: emailHash,
      p_code_hash: codeHash,
      p_token_hash: tokenHash,
      p_token_expires_at: new Date(Date.now() + 20 * 60_000).toISOString(),
    },
  );

  if (verifyError) {
    console.error("Could not verify public audit email:", verifyError.message);
    return json({ error: "service_unavailable" }, 500, CORS);
  }
  if (verified !== "verified") {
    return json({ error: "code_invalide_ou_expire" }, 400, CORS);
  }

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { count, error: countError } = await sb
    .from("public_audit_submissions")
    .select("submission_id", { count: "exact", head: true })
    .eq("email_hash", emailHash)
    .eq("month_start", monthStart.toISOString().slice(0, 10));

  if (countError) {
    console.error("Could not read public audit quota:", countError.message);
    return json({ error: "service_unavailable" }, 500, CORS);
  }

  return json(
    {
      ok: true,
      verification_token: token,
      restant: Math.max(0, 5 - (count ?? 0)),
    },
    200,
    CORS,
  );
});
