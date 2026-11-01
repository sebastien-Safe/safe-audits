// Généralise le pattern déjà correct de functions/create-lead/index.ts
// (liste d'origines autorisées, écho dynamique de l'Origin de la requête)
// à toutes les Edge Functions, au lieu du header CORS figé sur un seul
// domaine ("https://crm.safe-digitalisation.fr") dupliqué dans chaque
// fonction.
//
// À mettre à jour au fur et à mesure que de nouvelles apps/sous-domaines
// sont déployés (Phase 3 du plan de refonte safe-crm).

export const ALLOWED_ORIGINS = [
  "https://crm.safe-digitalisation.fr",
  // Espace client commun S@FE (Digitalisation + Assurances). Présent dans cette
  // liste, ce domaine est du même coup autorisé comme `redirectTo` du lien
  // magique (send-magic-link → isAllowedRedirect).
  "https://client.safe-digitalisation.fr",
  "https://rgpd.safe-digitalisation.fr",
  "https://media.safe-digitalisation.fr",
  "https://vente.safe-digitalisation.fr",
  // Audits gratuits publics (diagnostics RGPD, SEO, cyber, réseaux sociaux).
  "https://audits.safe-digitalisation.fr",
  "https://www.safe-assurances.fr",
  "https://safe-assurances.fr",
  "https://www.safe-digitalisation.fr",
  "https://safe-digitalisation.fr",
];

/**
 * En-têtes CORS pour la requête donnée : n'autorise Access-Control-Allow-Origin
 * que si l'Origin de la requête figure dans ALLOWED_ORIGINS (sinon l'en-tête
 * est simplement omis, comportement identique à create-lead/index.ts).
 * @param extraHeaders En-têtes supplémentaires à fusionner (ex: Authorization
 *   pour les fonctions qui exigent un JWT), et/ou Allow-Methods spécifique.
 */
export function corsHeaders(req: Request, extraHeaders: Record<string, string> = {}): HeadersInit {
  const origin = req.headers.get("Origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
    ...extraHeaders,
  };
  if (ALLOWED_ORIGINS.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
