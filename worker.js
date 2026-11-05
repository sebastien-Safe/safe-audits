/* ==========================================================================
   Audits gratuits S@FE — Worker Cloudflare (remplace les Edge Functions
   send-audit-email / create-lead de Supabase).

   POST /api/send-audit  { to_email, to_name, params }
     1. envoie le rapport au visiteur (Brevo) ;
     2. envoie une notification à l'équipe S@FE (Brevo), reply-to = visiteur.
   Aucune donnée n'est stockée : le seul enregistrement est l'e-mail reçu.

   Secrets / variables (wrangler) :
     BREVO           secret   clé API Brevo (wrangler secret put BREVO)
     NOTIFY_EMAIL    var      destinataire de la notification (défaut ci-dessous)
   Bindings facultatifs (anti-abus) : RL_IP, RL_EMAIL (Rate Limiting).
   ========================================================================== */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SENDER = { email: "contact@safe-digitalisation.fr", name: "S@FE Safe Digitalisation" };
const DEFAULT_NOTIFY = "contact@safe-digitalisation.fr";
const ALLOWED_ORIGINS = new Set(["https://audits.safe-digitalisation.fr"]);
const MAX_BODY = 64 * 1024;

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function buildHtml(p) {
  const rows   = (Array.isArray(p.rows) ? p.rows.slice(0, 60) : []);
  const recos  = (Array.isArray(p.recommandations) ? p.recommandations.slice(0, 30) : []);

  const rowsHtml = rows.map(r => {
    const bg    = r.is_ok ? "#d1fae5" : r.is_warn ? "#fef3c7" : "#fee2e2";
    const color = r.is_ok ? "#065f46" : r.is_warn ? "#92400e" : "#991b1b";
    return `<tr>
      <td style="padding:9px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;width:55%">${esc(r.question)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #f3f4f6;font-size:13px">${esc(r.reponse)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #f3f4f6;white-space:nowrap">
        <span style="background:${bg};color:${color};padding:2px 9px;border-radius:99px;font-size:11px">${esc(r.text)}</span>
      </td></tr>`;
  }).join("");

  const recoHtml = recos.length
    ? recos.map(r => `<li style="margin-bottom:6px;padding-left:4px">${esc(r)}</li>`).join("")
    : "<li>Maintenir le niveau de conformité actuel — bon travail !</li>";

  const mColor = esc(p.mission_color || "#0a1628");
  const nBg    = esc(p.niveau_bg || "#f8fafc");
  const nBd    = esc(p.niveau_border || "#e2e8f0");
  const nColor = esc(p.niveau_color || "#0a1628");

  return `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Votre diagnostic ${esc(p.mission)} — S@FE</title>
<style>
body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
img{border:0;outline:none;text-decoration:none}
body{margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif}
@media only screen and (max-width:600px){
  .em-w{width:100%!important}.em-p{padding:24px 16px!important}
  .score-n{font-size:44px!important}.col-h{display:block!important;width:100%!important}
  .hide-m{display:none!important}.cta{display:block!important;text-align:center!important}
}
</style>
</head>
<body>
<table role="presentation" class="em-w" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f4f6">
<tr><td align="center" style="padding:24px 16px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

<!-- HEADER -->
<tr><td style="background:#0a1628;padding:22px 28px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td style="vertical-align:middle">
  <span style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-1px">S<span style="color:#f59e0b">@</span>FE</span>
  <span style="display:block;font-size:10px;color:#94a3b8;letter-spacing:2px;text-transform:uppercase;margin-top:2px">Safe Digitalisation</span>
</td>
<td style="text-align:right;vertical-align:middle">
  <span style="font-size:15px;font-weight:700;color:${mColor}">Diagnostic ${esc(p.mission)}</span>
  <span style="display:block;font-size:11px;color:#94a3b8;margin-top:3px">${esc(p.date)}</span>
</td>
</tr></table>
</td></tr>

<!-- BODY -->
<tr><td class="em-p" style="padding:32px 28px">

<p style="margin:0 0 8px;font-size:17px;font-weight:700;color:#0a1628">Bonjour ${esc(p.nom)},</p>
<p style="margin:0 0 24px;font-size:14px;color:#4b5563;line-height:1.6">
  Voici les résultats de votre diagnostic <strong>${esc(p.mission)}</strong> réalisé par votre conseiller S@FE.
  Ce rapport confidentiel vous est adressé à titre personnel.
</p>

<!-- Score -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
       style="background:${nBg};border:2px solid ${nBd};border-radius:12px;margin-bottom:24px">
<tr><td style="padding:24px 20px;text-align:center">
  <span class="score-n" style="display:block;font-size:52px;font-weight:900;color:${nColor};line-height:1">${esc(p.score)}%</span>
  <span style="display:block;font-size:13px;color:#6b7280;margin-top:6px">Score ${esc(p.mission)} — <strong style="color:${nColor}">${esc(p.niveau)}</strong></span>
</td></tr>
</table>

<!-- Coordonnées -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
       style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px">
<tr><td style="padding:14px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
  <td class="col-h" width="50%" style="vertical-align:top;padding-bottom:8px">
    <span style="display:block;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700">Nom</span>
    <span style="display:block;font-size:13px;color:#0f172a;margin-top:2px">${esc(p.nom)}</span>
  </td>
  <td class="col-h" width="50%" style="vertical-align:top;padding-bottom:8px">
    <span style="display:block;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700">Entreprise</span>
    <span style="display:block;font-size:13px;color:#0f172a;margin-top:2px">${esc(p.entreprise)}</span>
  </td>
</tr>
<tr>
  <td class="col-h" width="50%" style="vertical-align:top">
    <span style="display:block;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700">E-mail</span>
    <span style="display:block;font-size:13px;color:#0f172a;margin-top:2px">${esc(p.email)}</span>
  </td>
  <td class="col-h" width="50%" style="vertical-align:top">
    <span style="display:block;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700">Téléphone</span>
    <span style="display:block;font-size:13px;color:#0f172a;margin-top:2px">${esc(p.telephone)}</span>
  </td>
</tr>
</table>
</td></tr>
</table>

<!-- Tableau résultats -->
<p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#0a1628">Détail des réponses</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
       style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;font-size:13px">
<thead>
<tr style="background:${mColor}">
  <th style="padding:9px 12px;text-align:left;color:#fff;font-size:11px;text-transform:uppercase;font-weight:700;width:55%">Question</th>
  <th class="hide-m" style="padding:9px 12px;text-align:left;color:#fff;font-size:11px;text-transform:uppercase;font-weight:700">Réponse</th>
  <th style="padding:9px 12px;text-align:left;color:#fff;font-size:11px;text-transform:uppercase;font-weight:700">Statut</th>
</tr>
</thead>
<tbody>${rowsHtml}</tbody>
</table>

<!-- Recommandations -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
       style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:24px">
<tr><td style="padding:16px 18px">
  <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#166534">&#10003; Recommandations prioritaires</p>
  <ul style="margin:0;padding-left:18px;color:#166534;font-size:13px;line-height:1.7">${recoHtml}</ul>
</td></tr>
</table>

<!-- CTA -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:28px">
<tr><td align="center">
  <a class="cta" href="${esc(p.rdv_url)}"
     style="display:inline-block;background:#f59e0b;color:#0a1628;font-weight:700;font-size:14px;padding:13px 28px;border-radius:8px;text-decoration:none">
    Prendre rendez-vous pour un accompagnement
  </a>
</td></tr>
</table>

<!-- Conseiller -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
       style="background:#f8fafc;border-left:3px solid ${mColor};border-radius:0 8px 8px 0;margin-bottom:24px">
<tr><td style="padding:14px 16px">
  <p style="margin:0 0 2px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px">Votre conseiller S@FE</p>
  <p style="margin:0;font-size:14px;color:#0f172a;font-weight:600">${esc(p.conseiller)}</p>
  <p style="margin:4px 0 0;font-size:13px;color:#4b5563">contact@safe-digitalisation.fr</p>
</td></tr>
</table>

<!-- RGPD -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 14px">
  <p style="margin:0;font-size:11px;color:#1e40af;line-height:1.5">
    &#10003; Consentement RGPD recueilli le ${esc(p.date)}. ${esc(p.nom)} (${esc(p.email)}) autorise S@FE
    à conserver ses coordonnées pour le suivi de ce diagnostic.
    Données non transmises à des tiers — Art. 13 RGPD.
  </p>
</td></tr>
</table>

</td></tr>

<!-- FOOTER -->
<tr><td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:18px 28px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
  <td><span style="font-size:11px;color:#9ca3af">S@FE · Safe Digitalisation<br>contact@safe-digitalisation.fr</span></td>
  <td style="text-align:right"><span style="font-size:11px;color:#9ca3af">Rapport généré le ${esc(p.date)}</span></td>
</tr></table>
<p style="margin:10px 0 0;font-size:10px;color:#d1d5db;text-align:center">
  Vous recevez cet email car vous avez participé à un diagnostic S@FE.
  Ce rapport est confidentiel et destiné uniquement à son destinataire.
</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const clean = (v, max) => String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);

async function brevo(env, payload) {
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) console.error("Brevo", r.status, (await r.text()).slice(0, 300));
  return r.ok;
}

async function limited(binding, key) {
  if (!binding) return false; // binding absent (dev local) : pas de limite
  const { success } = await binding.limit({ key });
  return !success;
}

async function sendAudit(request, env) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const origin = request.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.has(origin) && !/^http:\/\/localhost(:\d+)?$/.test(origin)) {
    return json({ error: "forbidden" }, 403);
  }
  if (!env.BREVO) return json({ error: "service_unavailable" }, 500);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: "payload_too_large" }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }

  const email = clean(body.to_email, 254).toLowerCase();
  const nom = clean(body.to_name, 120);
  const p = body.params;
  if (!nom || !EMAIL_RE.test(email) || !p || typeof p !== "object") return json({ error: "invalid_params" }, 400);

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (await limited(env.RL_IP, ip) || await limited(env.RL_EMAIL, email)) return json({ error: "rate_limit" }, 429);

  const params = {
    ...p,
    nom,
    email,
    entreprise: clean(p.entreprise, 160) || "—",
    telephone: clean(p.telephone, 40) || "—",
    mission: clean(p.mission, 60),
    date: clean(p.date, 40),
    niveau: clean(p.niveau, 60),
    score: clean(p.score, 6),
    conseiller: "Safe Digitalisation",
    rdv_url: "mailto:contact@safe-digitalisation.fr?subject=" + encodeURIComponent("Accompagnement suite à mon diagnostic " + clean(p.mission, 60)),
  };

  const sujet = clean(params.mission || "S@FE", 60);
  const ok = await brevo(env, {
    to: [{ email, name: nom }],
    subject: `Votre diagnostic ${sujet} — résultats & recommandations`,
    htmlContent: buildHtml(params),
    sender: SENDER,
    replyTo: SENDER,
  });
  if (!ok) return json({ error: "mail_failed" }, 502);

  // Notification à l'équipe : non bloquante.
  const notif = `<p><strong>Nouveau diagnostic ${esc(sujet)}</strong> — score ${esc(params.score)}% (${esc(params.niveau)})</p>
<ul><li>Nom : ${esc(nom)}</li><li>E-mail : ${esc(email)}</li><li>Téléphone : ${esc(params.telephone)}</li><li>Entreprise : ${esc(params.entreprise)}</li></ul>
<p>Consentement RGPD recueilli le ${esc(params.date)}. Le rapport complet a été envoyé au visiteur ; répondre à ce message écrit directement à ${esc(nom)}.</p>`;
  await brevo(env, {
    to: [{ email: env.NOTIFY_EMAIL || DEFAULT_NOTIFY }],
    subject: `[Audit ${sujet}] ${clean(nom, 80)} — ${clean(params.score, 6)}%`,
    htmlContent: notif,
    sender: SENDER,
    replyTo: { email, name: nom },
  }).catch(() => {});

  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/send-audit") return sendAudit(request, env);
    return env.ASSETS.fetch(request);
  },
};
