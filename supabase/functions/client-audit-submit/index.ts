// =============================================================================
// S@FE — Soumission d'un audit par le client (figé + PDF + e-mail)
// POST /functions/v1/client-audit-submit   { type_audit: 'cyber'|'seo'|'rgpd', domaine_id? }
// =============================================================================
// C'est le pivot du lot 1. Tout se fait ici, côté serveur, parce que rien de ce
// qui vient du navigateur ne doit être cru :
//   1. relecture des réponses du client depuis SA table (jamais depuis le corps
//      de la requête) ;
//   2. recalcul du score depuis le référentiel EN BASE (audit_referentiel_items),
//      donc non falsifiable ;
//   3. instantané figé dans client_audits_soumis (table immuable) ;
//   4. génération du PDF, dépôt dans le bucket privé client-audits-pdf ;
//   5. recommandations priorisées écrites dans le plan d'action, que le client
//      pourra cocher au fur et à mesure ;
//   6. mise à jour du score de profil (lu par le CRM comme par l'espace client) ;
//   7. envoi du rapport par e-mail (Brevo), PDF en pièce jointe ;
//   8. avancement de l'onboarding à l'étape « résultats ».

import { corsHeaders } from "../_shared/cors.ts";
import { authentifierClient } from "../_shared/client-auth.ts";
import { ipAppelant } from "../_shared/turnstile.ts";
import { consommerQuotas } from "../_shared/ratelimit.ts";
import {
  calculerScore, niveauRisque, LIBELLE_RISQUE, recommandations,
  type ItemReferentiel,
} from "../_shared/scoring-audit.ts";
import { genererRapportPdf, base64 } from "../_shared/pdf-audit.ts";

const BUCKET = "client-audits-pdf";

/** Où sont stockées les réponses, et où est stocké le score, par type d'audit. */
const CONFIG = {
  cyber: {
    reponses: "cyber_client_audits",
    profil: "cyber_client_profiles",
    colonneStatut: "statut",
    colonneItem: "item_key",
    titre: "Audit Cybersecurite",
  },
  seo: {
    reponses: "seo_client_audits",
    profil: "seo_client_profiles",
    colonneStatut: "statut",
    colonneItem: "item_key",
    titre: "Audit Visibilite (SEO)",
  },
  rgpd: {
    reponses: "dpo_client_audit_items",
    profil: "dpo_client_profiles",
    colonneStatut: "statut",
    colonneItem: "item_key",
    titre: "Audit Conformite RGPD",
  },
} as const;

type TypeAudit = keyof typeof CONFIG;

Deno.serve(async (req) => {
  const CORS = corsHeaders(req, {
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });
  const json = (d: unknown, s = 200) =>
    new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "bad_method" }, 405);

  const auth = await authentifierClient(req, { exigerPin: true });
  if (!auth.ok) return json({ error: auth.erreur }, auth.status);
  const { sb, client } = auth;

  const ip = ipAppelant(req);
  const quota = await consommerQuotas(sb, [
    { cle: `submit_user:${client.userId}`, max: 12, fenetreSecondes: 3600 },
    { cle: `submit_ip:${ip}`, max: 30, fenetreSecondes: 3600 },
  ]);
  if (!quota.ok) return json({ error: "rate_limit" }, 429);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "json_invalide" }, 400); }

  const type = body.type_audit as TypeAudit;
  if (!type || !(type in CONFIG)) return json({ error: "type_audit_invalide" }, 400);
  const cfg = CONFIG[type];

  const domaineId = typeof body.domaine_id === "string" ? body.domaine_id : null;

  try {
    // ── 1. Référentiel (version courante) ───────────────────────────────────
    const { data: ref } = await sb
      .from("audit_referentiels")
      .select("code, version, titre, titre_client")
      .eq("code", type)
      .single();

    if (!ref) return json({ error: "referentiel_absent" }, 500);

    const { data: items } = await sb
      .from("audit_referentiel_items")
      .select("*")
      .eq("referentiel_code", type)
      .eq("version", ref.version)
      .order("categorie")
      .order("ordre");

    if (!items?.length) return json({ error: "referentiel_vide" }, 500);
    const itemsRef = items as ItemReferentiel[];

    // ── 2. Réponses du client ───────────────────────────────────────────────
    let q = sb.from(cfg.reponses).select("*").eq("contact_id", client.contactId);
    if (type === "seo" && domaineId) q = q.or(`domaine_id.eq.${domaineId},domaine_id.is.null`);
    const { data: lignes } = await q;

    const reponses: Record<string, string> = {};
    for (const r of (lignes ?? []) as Record<string, string>[]) {
      const cle = r[cfg.colonneItem];
      if (cle) reponses[cle] = r[cfg.colonneStatut] ?? "non_verifie";
    }

    const repondus = itemsRef.filter((i) => (reponses[i.item_key] ?? "non_verifie") !== "non_verifie").length;
    if (repondus === 0) return json({ error: "aucune_reponse" }, 400);

    // ── 3. Score recalculé côté serveur ─────────────────────────────────────
    const { score, catScores, poids } = calculerScore(itemsRef, reponses);
    const niveau = niveauRisque(score);
    const recos = recommandations(itemsRef, reponses);

    const labelsCat: Record<string, string> = {};
    for (const i of itemsRef) labelsCat[i.categorie] = i.categorie_label_client || i.categorie_label;

    // ── 4. Contexte client ──────────────────────────────────────────────────
    const { data: contact } = await sb
      .from("contacts")
      .select("nom, prenom, entreprise, email")
      .eq("id", client.contactId)
      .single();

    const clientNom = contact?.entreprise
      || [contact?.prenom, contact?.nom].filter(Boolean).join(" ")
      || client.email;

    let domaine: string | null = null;
    if (type === "seo" && domaineId) {
      const { data: d } = await sb.from("seo_domaines")
        .select("domaine").eq("id", domaineId).eq("contact_id", client.contactId).maybeSingle();
      domaine = d?.domaine ?? null;
    }

    // ── 5. Instantané figé ──────────────────────────────────────────────────
    const { data: soumission, error: errSoumission } = await sb
      .from("client_audits_soumis")
      .insert({
        contact_id: client.contactId,
        type_audit: type,
        referentiel_version: ref.version,
        score_global: score,
        scores_categories: { scores: catScores, poids, labels: labelsCat },
        niveau_risque: niveau,
        domaine,
        soumis_par: client.userId,
        snapshot: {
          reponses,
          items: itemsRef.map((i) => ({
            item_key: i.item_key, categorie: i.categorie,
            libelle_technique: i.libelle_technique, libelle_client: i.libelle_client,
            criticite: i.criticite, statut: reponses[i.item_key] ?? "non_verifie",
          })),
          recommandations: recos,
          points_repondus: repondus,
          points_total: itemsRef.length,
        },
      })
      .select("id, soumis_at")
      .single();

    if (errSoumission) throw new Error("soumission:" + errSoumission.message);

    // ── 6. PDF ──────────────────────────────────────────────────────────────
    const dateRapport = new Date(soumission.soumis_at).toLocaleDateString("fr-FR");
    const pdf = await genererRapportPdf({
      titreAudit: cfg.titre,
      clientNom,
      domaine,
      score,
      libelleRisque: LIBELLE_RISQUE[niveau],
      catScores, poids, labelsCat,
      items: itemsRef,
      reponses,
      recommandations: recos,
      dateRapport,
    });

    const chemin = `${client.contactId}/${type}/${soumission.id}.pdf`;
    const { error: errUpload } = await sb.storage.from(BUCKET)
      .upload(chemin, pdf, { contentType: "application/pdf", upsert: true });

    if (errUpload) console.error("upload pdf:", errUpload.message);
    else await sb.from("client_audits_soumis").update({ pdf_path: chemin }).eq("id", soumission.id);

    // ── 7. Recommandations dans le plan d'action ─────────────────────────────
    // L'index partiel (contact_id, type_audit, item_key) évite la duplication à
    // chaque nouvelle soumission : une action déjà présente est mise à jour,
    // mais son avancement (statut, fait_at) n'est jamais écrasé.
    if (recos.length) {
      const { data: existantes } = await sb
        .from("cyber_client_plan")
        .select("item_key")
        .eq("contact_id", client.contactId)
        .eq("type_audit", type)
        .not("item_key", "is", null);

      const deja = new Set((existantes ?? []).map((r: { item_key: string }) => r.item_key));
      const aCreer = recos.filter((r) => !deja.has(r.item_key)).map((r) => ({
        contact_id: client.contactId,
        titre: r.titre,
        description: r.description,
        priorite: r.priorite,
        statut: "a_faire",
        categorie: r.categorie,
        type_audit: type,
        item_key: r.item_key,
        source: "auto",
        created_by: null,
      }));

      if (aCreer.length) {
        const { error } = await sb.from("cyber_client_plan").insert(aCreer);
        if (error) console.error("plan:", error.message);
      }
    }

    // ── 8. Score de profil lu par le CRM ─────────────────────────────────────
    // Cyber et SEO : le CRM calcule son score à partir des MÊMES réponses
    // (cyber_client_audits / seo_client_audits) avec le MÊME barème — écrire le
    // score recalculé ici est donc cohérent.
    //
    // RGPD : surtout pas. dpo_client_profiles.score_global porte le score
    // DÉDUIT par le consultant à partir des modules DPO (registre, documents,
    // consentements...), et last_audit_at y vaut « audit validé par le DPO »
    // (10 % de ce score). Y écrire le score DÉCLARÉ par le client écraserait le
    // constat du consultant et lui ferait gagner 10 points sans validation. Le
    // score déclaré vit dans client_audits_soumis ; les deux coexistent.
    if (type !== "rgpd") {
      const { error: errProfil } = await sb.from(cfg.profil).upsert({
        contact_id: client.contactId,
        score_global: score,
        updated_at: new Date().toISOString(),
      }, { onConflict: "contact_id" });
      if (errProfil) console.error("profil score:", errProfil.message);
    }

    // ── 9. Onboarding ───────────────────────────────────────────────────────
    const { data: onboarding } = await sb
      .from("client_onboarding").select("etapes_faites")
      .eq("contact_id", client.contactId).maybeSingle();

    const faites = new Set<string>([...(onboarding?.etapes_faites ?? []), `audit_${type}`]);
    await sb.from("client_onboarding").upsert({
      contact_id: client.contactId,
      etape: "resultats",
      etapes_faites: [...faites],
      updated_at: new Date().toISOString(),
    }, { onConflict: "contact_id" });

    // ── 10. E-mail avec le PDF ──────────────────────────────────────────────
    const BREVO = Deno.env.get("BREVO");
    let emailEnvoye = false;

    if (BREVO && contact?.email) {
      const critiques = recos.filter((r) => r.priorite === "critique").length;
      const html = `
        <p>Bonjour${contact.prenom ? " " + contact.prenom : ""},</p>
        <p>Votre ${cfg.titre.toLowerCase()} est terminé. Votre résultat :
           <strong>${score} / 100 — ${LIBELLE_RISQUE[niveau]}</strong>.</p>
        <p>Vous avez répondu à ${repondus} des ${itemsRef.length} points de contrôle.
           ${recos.length
             ? `Nous avons préparé <strong>${recos.length} action${recos.length > 1 ? "s" : ""}</strong> à mener` +
               (critiques ? `, dont ${critiques} à traiter tout de suite` : "") + "."
             : "Aucune action corrective n'est nécessaire : félicitations."}</p>
        <p>Le rapport complet est en pièce jointe. Vous le retrouverez à tout moment dans votre espace,
           où vous pourrez cocher les actions au fur et à mesure :<br>
           <a href="https://client.safe-digitalisation.fr/tableau-de-bord.html">Ouvrir mon espace S@FE</a></p>
        <p style="color:#64748b;font-size:12px">Ce rapport reprend vos déclarations au jour de l'audit.
           Un consultant S@FE peut compléter et valider chaque point avec vous.</p>
        <p>— L'équipe S@FE</p>`;

      const envoi = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": BREVO, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: { name: "S@FE", email: "noreply@safe-digitalisation.fr" },
          to: [{ email: contact.email, name: clientNom }],
          subject: `Votre ${cfg.titre.toLowerCase()} — ${score}/100`,
          htmlContent: html,
          attachment: [{
            name: `${cfg.titre.replace(/[^a-z0-9]+/gi, "-")}-${dateRapport.replace(/\//g, "-")}.pdf`,
            content: base64(pdf),
          }],
        }),
      });

      emailEnvoye = envoi.ok;
      if (!envoi.ok) console.error("Brevo:", envoi.status, await envoi.text());
      else await sb.from("client_audits_soumis")
        .update({ email_envoye_at: new Date().toISOString() }).eq("id", soumission.id);
    }

    // ── 11. Journal RGPD ────────────────────────────────────────────────────
    await sb.from("audit_logs").insert({
      user_id: null,
      user_role: "Client",
      action: "audit_client_soumis",
      module: "Espace client",
      entity_type: "contact",
      entity_id: client.contactId,
      donnees_concernees: "réponses d'audit, score, recommandations, rapport PDF",
      criticite: "Info",
      resultat: "Succès",
      details: {
        user_nom: `Espace client — ${clientNom}`,
        type_audit: type, score, niveau_risque: niveau,
        soumission_id: soumission.id, email_envoye: emailEnvoye,
      },
    });

    return json({
      ok: true,
      soumission_id: soumission.id,
      score,
      niveau_risque: niveau,
      libelle_risque: LIBELLE_RISQUE[niveau],
      scores_categories: catScores,
      points_repondus: repondus,
      points_total: itemsRef.length,
      recommandations: recos.length,
      email_envoye: emailEnvoye,
    }, 201);
  } catch (e) {
    console.error("client-audit-submit:", (e as Error).message);
    return json({ error: "soumission_impossible" }, 500);
  }
});
