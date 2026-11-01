// Edge Function publique — Créer un prospect depuis un formulaire de contact ou de devis
// (safe-assurances.fr / safe-digitalisation.fr → CRM safecrm)
// POST /functions/v1/create-lead
// Body contact              : { site, form_type: 'contact', nom, email, telephone?, sujet?, message, rgpd, consent_telephone?, honeypot? }
// Body devis professionnel  : { site: 'assurances', form_type: 'devis_professionnel', raison_sociale, secteur, chiffre_affaires, effectif,
//                               garanties?, contact_nom, email, telephone, message?, rgpd, honeypot? }
// Body devis particulier    : { site: 'assurances', form_type: 'devis_particulier', contact_nom, code_postal?, produits?,
//                               email, telephone, message?, rgpd, honeypot? }

import { createClient } from "@supabase/supabase-js";
import { corsHeaders as sharedCorsHeaders } from "../_shared/cors.ts";
import { verifierTurnstile } from "../_shared/turnstile.ts";
import { autoriserSoumissionAudit, normaliserEmailAudit } from "../_shared/public-audit.ts";

const MARQUES: Record<string, { label: string; email: string }> = {
  assurances:     { label: "S@FE Assurances",     email: "contact@safe-assurances.fr" },
  digitalisation: { label: "S@FE Digitalisation", email: "contact@safe-digitalisation.fr" },
};

// Un audit gratuit par form_type — mission.html envoie l'un des types déclarés
// ici, cohérent avec MISSION_DATA (core/audit/mission-data.js).
const AUDIT_INFO: Record<string, { label: string }> = {
  audit_rgpd:   { label: "RGPD" },
  audit_seo:    { label: "SEO / Visibilité" },
  audit_geo:    { label: "GEO / Référencement IA" },
  audit_ia:     { label: "Usages de l'IA" },
  audit_cyber:  { label: "Cybersécurité" },
  audit_social: { label: "Réseaux sociaux" },
};

// Texte de consentement exact affiché sur chaque formulaire — codé en dur ici
// (preuve juridique non falsifiable depuis le front) plutôt que reçu du client.
const RGPD_TEXTE: Record<string, string> = {
  "digitalisation:contact":      "J'ai pris connaissance de la politique de protection des données et j'accepte que mes informations soient utilisées pour traiter ma demande.",
  "assurances:contact":          "J'accepte que mes données soient traitées pour répondre à ma demande.",
  "assurances:devis":            "J'accepte que S@FE Assurances traite mes données dans le cadre de cette demande de devis.",
  "digitalisation:audit_rgpd":   "J'autorise S@FE à conserver mes coordonnées dans le cadre du suivi de ce diagnostic RGPD. Données non transmises à des tiers (Art. 13 RGPD).",
  "digitalisation:audit_seo":    "J'autorise S@FE à conserver mes coordonnées dans le cadre du suivi de ce diagnostic. Données non transmises à des tiers (Art. 13 RGPD).",
  "digitalisation:audit_geo":    "J'autorise S@FE à conserver mes coordonnées dans le cadre du suivi de ce diagnostic GEO. Données non transmises à des tiers (Art. 13 RGPD).",
  "digitalisation:audit_ia":     "J'autorise S@FE à conserver mes coordonnées dans le cadre du suivi de ce diagnostic des usages de l'IA. Données non transmises à des tiers (Art. 13 RGPD).",
  "digitalisation:audit_cyber":  "J'autorise S@FE à conserver mes coordonnées dans le cadre du suivi de ce diagnostic. Données non transmises à des tiers (Art. 13 RGPD).",
  "digitalisation:audit_social": "J'autorise S@FE à conserver mes coordonnées dans le cadre du suivi de ce diagnostic. Données non transmises à des tiers (Art. 13 RGPD).",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RATE_LIMIT_MAX_PER_HOUR = 20;

// Historiquement propre à create-lead (n'autorisait que content-type, pas
// d'Authorization — endpoint anonyme) : on garde ce même en-tête restreint
// en s'appuyant désormais sur la liste blanche partagée _shared/cors.ts
// (qui inclut vente/rgpd/media, absents de l'ancienne liste locale).
function corsHeaders(req: Request): HeadersInit {
  return sharedCorsHeaders(req, {
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });
}

function jsonResponse(body: Record<string, unknown>, status: number, cors: HeadersInit) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

Deno.serve(async (req) => {
  const CORS = corsHeaders(req);

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("not allowed", { status: 405, headers: CORS });

  const BREVO = Deno.env.get("BREVO");
  const sb    = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: "JSON invalide" }, 400, CORS); }

  // ── Rate limit par IP (anti-abus, avant tout traitement) ──
  const ip       = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rlKey    = `formintake_ip:${ip}`;
  const rlWindow = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000).toISOString();

  const { data: rl } = await sb.from("rate_limits")
    .select("count, window_at").eq("action", rlKey).maybeSingle();

  if (rl && rl.window_at?.slice(0, 13) === rlWindow.slice(0, 13)) {
    if (rl.count >= RATE_LIMIT_MAX_PER_HOUR) return jsonResponse({ error: "rate_limit" }, 429, CORS);
    await sb.from("rate_limits").update({ count: rl.count + 1, updated_at: new Date().toISOString() }).eq("action", rlKey);
  } else {
    await sb.from("rate_limits").upsert({ action: rlKey, count: 1, window_at: rlWindow }, { onConflict: "action" });
  }

  const { site, form_type, honeypot } = body as Record<string, string | undefined>;

  // Piège à spam : champ caché qui doit rester vide pour un humain — rejet silencieux
  if (honeypot) return jsonResponse({ ok: true }, 201, CORS);

  const marque = typeof site === "string" ? MARQUES[site] : undefined;
  const type   = (form_type === "devis_particulier" || form_type === "devis_professionnel") ? "devis"
    : (typeof form_type === "string" && form_type in AUDIT_INFO) ? "audit"
    : "contact";
  if (!marque) return jsonResponse({ error: "Site inconnu" }, 400, CORS);

  // ── Captcha Turnstile ──
  // Le jeton était déjà envoyé par les formulaires de safe-digitalisation.fr
  // (contact.html, diagnostic.html) mais n'était jamais vérifié : le captcha ne
  // protégeait rien. Il est désormais contrôlé côté serveur.
  //
  // Il n'est EXIGÉ que là où le widget est effectivement déployé — les
  // formulaires du site Assurances et les diagnostics de mission.html ne l'ont
  // pas encore. Partout ailleurs, un jeton absent est toléré, mais un jeton
  // présent doit être valide : ajouter le widget à un formulaire suffit donc à
  // le protéger, sans nouvelle modification ici. Une fois tous les formulaires
  // équipés, remplacer la condition par `true`.
  const turnstileExige = site === "digitalisation" && type === "contact";
  const turnstile = await verifierTurnstile(body.turnstile_token, ip, turnstileExige);
  if (!turnstile.ok) {
    return jsonResponse(
      { error: "captcha_invalide", detail: turnstile.raison },
      turnstile.raison === "non_configure" ? 500 : 403,
      CORS,
    );
  }

  const rgpd = body.rgpd === true;
  if (!rgpd) {
    return jsonResponse({ error: "Consentement RGPD requis" }, 400, CORS);
  }

  let nom: string, email: string, telephone: string | null, entreprise: string | null, notes: string;
  let canalAcquisition: string, donneesConcernees: string, tacheTitre: string, tacheDescription: string;
  let emailSubject: string, emailBodyHtml: string;
  let codePostal: string | null = null;

  if (type === "devis") {
    if (marque.label !== "S@FE Assurances") return jsonResponse({ error: "Formulaire devis non disponible pour ce site" }, 400, CORS);

    if (form_type === "devis_particulier") {
      const {
        contact_nom, code_postal: cp, telephone: tel, email: mail, message, produits,
      } = body as Record<string, string | string[] | undefined>;

      if (!contact_nom || !tel || !mail) {
        return jsonResponse({ error: "Champs obligatoires manquants" }, 400, CORS);
      }
      if (typeof mail !== "string" || !EMAIL_RE.test(mail)) return jsonResponse({ error: "Email invalide" }, 400, CORS);

      const produitsListe = Array.isArray(produits) && produits.length ? produits.join(", ") : "non précisé";

      nom        = String(contact_nom);
      email      = mail;
      telephone  = String(tel);
      entreprise = null;
      codePostal = cp ? String(cp) : null;
      notes      = `Demande de devis particulier — produit(s) souhaité(s) : ${produitsListe}${codePostal ? `, code postal : ${codePostal}` : ""}${message ? `\n\n${message}` : ""}`;

      canalAcquisition  = "site_assurances_devis_particulier";
      donneesConcernees = "nom, code postal, produit(s) souhaité(s), contact, email, téléphone, message, consentement RGPD";
      tacheTitre        = `Qualifier cette demande de devis — ${nom}`;
      tacheDescription  = `Reçu via le formulaire de devis particulier ${marque.label}.\nEmail : ${email}\nTél : ${telephone}${codePostal ? `\nCode postal : ${codePostal}` : ""}\nProduit(s) souhaité(s) : ${produitsListe}${message ? `\n\nMessage :\n${message}` : ""}`;

      emailSubject  = `📋 Nouvelle demande de devis particulier — ${nom}`;
      emailBodyHtml = `
        <h2 style="color:#0a1628">Nouvelle demande de devis particulier</h2>
        <p><strong>Contact :</strong> ${escapeHtml(nom)}</p>
        <p><strong>Email :</strong> ${escapeHtml(email)}</p>
        <p><strong>Téléphone :</strong> ${escapeHtml(telephone)}</p>
        ${codePostal ? `<p><strong>Code postal :</strong> ${escapeHtml(codePostal)}</p>` : ""}
        <p><strong>Produit(s) souhaité(s) :</strong> ${escapeHtml(produitsListe)}</p>
        ${message ? `<p><strong>Précisions :</strong><br>${escapeHtml(String(message)).replace(/\n/g, "<br>")}</p>` : ""}
        <hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb">
        <p style="font-size:12px;color:#9ca3af">S@FE — Fiche créée automatiquement dans la CRM.</p>
      `;
    } else {
      const {
        raison_sociale, secteur, chiffre_affaires, effectif,
        contact_nom, telephone: tel, email: mail, message, garanties,
      } = body as Record<string, string | string[] | undefined>;

      if (!raison_sociale || !secteur || !chiffre_affaires || !effectif || !contact_nom || !tel || !mail) {
        return jsonResponse({ error: "Champs obligatoires manquants" }, 400, CORS);
      }
      if (typeof mail !== "string" || !EMAIL_RE.test(mail)) return jsonResponse({ error: "Email invalide" }, 400, CORS);

      const garantiesListe = Array.isArray(garanties) && garanties.length ? garanties.join(", ") : "non précisé";

      nom        = String(contact_nom);
      email      = mail;
      telephone  = String(tel);
      entreprise = String(raison_sociale);
      notes      = `Demande de devis — secteur : ${secteur}, CA : ${chiffre_affaires}, effectif : ${effectif}\nGaranties souhaitées : ${garantiesListe}${message ? `\n\n${message}` : ""}`;

      canalAcquisition  = "site_assurances_devis";
      donneesConcernees = "raison sociale, secteur, CA, effectif, garanties souhaitées, contact, email, téléphone, message, consentement RGPD";
      tacheTitre        = `Qualifier cette demande de devis — ${nom}`;
      tacheDescription  = `Reçu via le formulaire de devis ${marque.label}.\nEntreprise : ${entreprise}\nEmail : ${email}\nTél : ${telephone}\nSecteur : ${secteur}, CA : ${chiffre_affaires}, effectif : ${effectif}\nGaranties souhaitées : ${garantiesListe}${message ? `\n\nMessage :\n${message}` : ""}`;

      emailSubject  = `📋 Nouvelle demande de devis — ${nom}`;
      emailBodyHtml = `
        <h2 style="color:#0a1628">Nouvelle demande de devis</h2>
        <p><strong>Entreprise :</strong> ${escapeHtml(entreprise)}</p>
        <p><strong>Contact :</strong> ${escapeHtml(nom)}</p>
        <p><strong>Email :</strong> ${escapeHtml(email)}</p>
        <p><strong>Téléphone :</strong> ${escapeHtml(telephone)}</p>
        <p><strong>Secteur :</strong> ${escapeHtml(String(secteur))}</p>
        <p><strong>Chiffre d'affaires :</strong> ${escapeHtml(String(chiffre_affaires))}</p>
        <p><strong>Effectif :</strong> ${escapeHtml(String(effectif))}</p>
        <p><strong>Garanties souhaitées :</strong> ${escapeHtml(garantiesListe)}</p>
        ${message ? `<p><strong>Précisions :</strong><br>${escapeHtml(String(message)).replace(/\n/g, "<br>")}</p>` : ""}
        <hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb">
        <p style="font-size:12px;color:#9ca3af">S@FE — Fiche créée automatiquement dans la CRM.</p>
      `;
    }
  } else if (type === "audit") {
    if (marque.label !== "S@FE Digitalisation") return jsonResponse({ error: "Audits disponibles uniquement pour S@FE Digitalisation" }, 400, CORS);
    const info = AUDIT_INFO[form_type as string];

    const {
      nom: n, email: mail, telephone: tel, entreprise: ent, score, niveau,
    } = body as Record<string, string | number | undefined>;

    if (!n || !mail) return jsonResponse({ error: "Champs obligatoires manquants" }, 400, CORS);
    if (typeof mail !== "string" || mail.length > 254 || !EMAIL_RE.test(normaliserEmailAudit(mail))) return jsonResponse({ error: "Email invalide" }, 400, CORS);

    const verificationToken = body.audit_verification_token;
    const submissionId = body.audit_submission_id;
    if (typeof verificationToken !== "string" || typeof submissionId !== "string" || !UUID_RE.test(submissionId)) {
      return jsonResponse({ error: "email_verification_required" }, 401, CORS);
    }
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceRoleKey) {
      console.error("SUPABASE_SERVICE_ROLE_KEY is not configured");
      return jsonResponse({ error: "service_unavailable" }, 500, CORS);
    }
    const authorization = await autoriserSoumissionAudit(
      sb,
      serviceRoleKey,
      mail,
      verificationToken,
      submissionId,
      "lead",
    );
    if (authorization.error) {
      console.error("Could not authorize public audit lead:", authorization.error);
      return jsonResponse({ error: "service_unavailable" }, 500, CORS);
    }
    if (authorization.status === "unverified") return jsonResponse({ error: "email_verification_required" }, 401, CORS);
    if (authorization.status === "quota") return jsonResponse({ error: "monthly_audit_limit" }, 429, CORS);
    if (authorization.status === "duplicate") return jsonResponse({ error: "audit_already_submitted" }, 409, CORS);
    if (authorization.status !== "ok") return jsonResponse({ error: "invalid_audit_submission" }, 400, CORS);

    nom        = String(n);
    email      = normaliserEmailAudit(mail);
    telephone  = tel ? String(tel) : null;
    entreprise = ent ? String(ent) : null;

    const scoreTxt  = (typeof score === "number" || typeof score === "string") ? `${score}%` : "n/c";
    const niveauTxt = typeof niveau === "string" ? niveau : "n/c";
    notes = `Audit gratuit ${info.label} — score ${scoreTxt} (${niveauTxt})`;

    canalAcquisition  = `site_${form_type}`;
    donneesConcernees = "nom, email, téléphone, entreprise, réponses à l'audit, score, consentement RGPD";
    tacheTitre        = `Qualifier ce lead audit ${info.label} — ${nom}`;
    tacheDescription  = `Audit gratuit ${info.label} complété en autonomie sur le site.\nEmail : ${email}${telephone ? "\nTél : " + telephone : ""}${entreprise ? "\nEntreprise : " + entreprise : ""}\nScore : ${scoreTxt} (${niveauTxt})`;

    emailSubject  = `🔍 Nouvel audit gratuit ${info.label} — ${nom}`;
    emailBodyHtml = `
      <h2 style="color:#0a1628">Nouvel audit gratuit — ${escapeHtml(info.label)}</h2>
      <p><strong>Contact :</strong> ${escapeHtml(nom)}</p>
      <p><strong>Email :</strong> ${escapeHtml(email)}</p>
      ${telephone ? `<p><strong>Téléphone :</strong> ${escapeHtml(telephone)}</p>` : ""}
      ${entreprise ? `<p><strong>Entreprise :</strong> ${escapeHtml(entreprise)}</p>` : ""}
      <p><strong>Score :</strong> ${escapeHtml(scoreTxt)} — ${escapeHtml(niveauTxt)}</p>
      <hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb">
      <p style="font-size:12px;color:#9ca3af">S@FE — Fiche créée automatiquement dans la CRM depuis un audit gratuit public.</p>
    `;
  } else {
    const { nom: n, email: mail, telephone: tel, sujet, message, consent_telephone } = body as Record<string, string | boolean | undefined>;

    if (!n || !mail || !message) return jsonResponse({ error: "Champs obligatoires manquants" }, 400, CORS);
    if (typeof mail !== "string" || !EMAIL_RE.test(mail)) return jsonResponse({ error: "Email invalide" }, 400, CORS);

    nom        = String(n);
    email      = mail;
    telephone  = tel ? String(tel) : null;
    entreprise = null;
    notes      = sujet ? `${sujet}\n\n${message}` : String(message);

    canalAcquisition  = marque.label === "S@FE Assurances" ? "site_assurances_contact" : `Site web — ${marque.label}`;
    donneesConcernees = "nom, email, téléphone, message, consentement RGPD, consentement démarchage téléphonique";
    tacheTitre        = `Qualifier ce prospect web — ${nom}`;
    tacheDescription  = `Reçu via le formulaire de contact ${marque.label}.\nEmail : ${email}${telephone ? "\nTél : " + telephone : ""}${sujet ? "\nSujet : " + sujet : ""}\n\nMessage :\n${message}`;

    emailSubject  = `🌐 Nouveau prospect web — ${nom}`;
    emailBodyHtml = `
      <h2 style="color:#0a1628">Nouveau prospect via le formulaire de contact</h2>
      <p><strong>Marque :</strong> ${marque.label}</p>
      <p><strong>Nom :</strong> ${escapeHtml(nom)}</p>
      <p><strong>Email :</strong> ${escapeHtml(email)}</p>
      ${telephone ? `<p><strong>Téléphone :</strong> ${escapeHtml(telephone)}</p>` : ""}
      ${sujet ? `<p><strong>Sujet :</strong> ${escapeHtml(String(sujet))}</p>` : ""}
      <p><strong>Message :</strong><br>${escapeHtml(String(message)).replace(/\n/g, "<br>")}</p>
      <p><strong>Consentement démarchage téléphonique :</strong> ${consent_telephone ? "Oui" : "Non"}</p>
      <hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb">
      <p style="font-size:12px;color:#9ca3af">S@FE — Fiche créée automatiquement dans la CRM.</p>
    `;
  }

  const nowIso = new Date().toISOString();

  // Créer le prospect (non affecté — visible de tous, récupérable via transfert)
  const { data: contact, error: cErr } = await sb
    .from("contacts")
    .insert({
      nom, email, telephone, entreprise, notes,
      code_postal:         codePostal,
      statut:              "Prospect",
      kanban_col:          "prospect",
      canal_acquisition:   canalAcquisition,
      qualification:       "non_qualifié",
      consent_telephone:   type === "contact" ? !!(body as Record<string, unknown>).consent_telephone : false,
      consent_rgpd:        rgpd,
      consent_rgpd_at:     rgpd ? nowIso : null,
      consent_rgpd_texte:  rgpd ? RGPD_TEXTE[`${site}:${type === "audit" ? form_type : type}`] : null,
      created_by:          null,
    })
    .select("id")
    .single();

  if (cErr) return jsonResponse({ error: "Erreur création prospect", detail: cErr.message }, 500, CORS);

  // Tâche de suivi pour qu'un commercial qualifie le prospect
  await sb.from("tasks").insert({
    contact_id:  contact.id,
    titre:       tacheTitre,
    description: tacheDescription,
    type_tache:  "Premier contact",
    statut:      "À faire",
    priorite:    "Normale",
    created_by:  null,
  });

  // Journal RGPD — apparaît automatiquement dans l'onglet Journal RGPD (audit_logs)
  await sb.from("audit_logs").insert({
    user_id:            null,
    user_role:          "Système",
    action:             type === "devis" ? "devis_cree_web" : type === "audit" ? "audit_cree_web" : "contact_cree_web",
    module:             "Contacts",
    entity_type:        "contact",
    entity_id:          contact.id,
    donnees_concernees: donneesConcernees,
    criticite:          "Info",
    resultat:           "Succès",
    details: {
      user_nom:     `Formulaire web — ${marque.label}`,
      site,
      form_type:    type,
      form_type_detail: form_type,
      consent_rgpd: rgpd,
      ...(type === "audit" ? { score: (body as Record<string, unknown>).score, niveau: (body as Record<string, unknown>).niveau, rows: (body as Record<string, unknown>).rows, recommandations: (body as Record<string, unknown>).recommandations } : {}),
    },
  });

  // Notification email à l'équipe (non bloquant — l'insertion CRM prime)
  if (BREVO) {
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": BREVO, "Content-Type": "application/json" },
      body: JSON.stringify({
        to: [{ email: marque.email }],
        subject: emailSubject,
        htmlContent: emailBodyHtml,
        replyTo: { email, name: nom },
      }),
    }).catch(() => {});
  }

  return jsonResponse({ ok: true }, 201, CORS);
});
