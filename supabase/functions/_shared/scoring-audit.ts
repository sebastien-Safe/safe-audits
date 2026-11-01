// =============================================================================
// S@FE — Barème d'audit, version serveur
// =============================================================================
// Miroir EXACT de core/audit/referentiels/scoring.js. Les deux existent parce
// que le front est en JavaScript classique (pages du CRM chargées en
// <script src>, sans étape de build) et que les Edge Functions ne peuvent pas
// importer un fichier situé hors de supabase/functions/.
//
// Le garde-fou contre la dérive est un jeu d'essai commun : le même scénario est
// vérifié par tests/referentiels-scoring.test.js (vitest, côté front) et par
// _shared/scoring-audit.test.ts (Deno, ici). Si l'un des deux barèmes change
// sans l'autre, un des deux tests échoue.
//
// Le score renvoyé au client est TOUJOURS celui calculé ici : un score calculé
// dans le navigateur serait falsifiable.

export type Statut = "non_verifie" | "conforme" | "partiel" | "non_conforme" | "na";

export interface ItemReferentiel {
  item_key: string;
  categorie: string;
  categorie_label: string;
  categorie_label_client: string;
  poids_categorie: number;
  ordre: number;
  libelle_technique: string;
  libelle_client: string;
  aide_client: string;
  recommandation: string;
  criticite: "critique" | "haute" | "normale" | "basse";
  auto_source: string | null;
}

/** `na` est exclu du dénominateur (null) ; `non_verifie` et `non_conforme` valent 0. */
export function valeurStatut(statut: string): number | null {
  if (statut === "na") return null;
  if (statut === "conforme") return 1;
  if (statut === "partiel") return 0.5;
  return 0;
}

export interface ResultatScore {
  score: number;
  catScores: Record<string, number>;
  poids: Record<string, number>;
}

/**
 * Score global pondéré et scores par catégorie, à partir des items du
 * référentiel (lus dans audit_referentiel_items) et des réponses du client.
 */
export function calculerScore(
  items: ItemReferentiel[],
  parStatut: Record<string, string>,
): ResultatScore {
  const parCat = new Map<string, { poids: number; somme: number; total: number }>();

  for (const item of items) {
    if (!parCat.has(item.categorie)) {
      parCat.set(item.categorie, { poids: Number(item.poids_categorie), somme: 0, total: 0 });
    }
    const cat = parCat.get(item.categorie)!;
    const v = valeurStatut(parStatut[item.item_key] || "non_verifie");
    if (v === null) continue;
    cat.total += 1;
    cat.somme += v;
  }

  const catScores: Record<string, number> = {};
  const poids: Record<string, number> = {};
  let pondere = 0;

  for (const [cle, cat] of parCat) {
    const s = cat.total > 0 ? Math.round((cat.somme / cat.total) * 100) : 0;
    catScores[cle] = s;
    poids[cle] = cat.poids;
    pondere += s * cat.poids;
  }

  return { score: Math.round(pondere), catScores, poids };
}

export type NiveauRisque = "faible" | "modere" | "eleve" | "critique";

/** Mêmes seuils que scoreBadge() du CRM (80 / 50) : le client et son
 *  consultant lisent le même verdict. */
export function niveauRisque(score: number): NiveauRisque {
  if (score >= 80) return "faible";
  if (score >= 50) return "modere";
  if (score >= 25) return "eleve";
  return "critique";
}

export const LIBELLE_RISQUE: Record<NiveauRisque, string> = {
  faible: "Risque faible",
  modere: "Risque modéré",
  eleve: "Risque élevé",
  critique: "Risque critique",
};

export interface Recommandation {
  item_key: string;
  categorie: string;
  titre: string;
  description: string;
  priorite: "critique" | "haute" | "normale" | "basse";
  statut_audit: string;
}

/**
 * Recommandations priorisées. Reprend la règle de genererPlanDepuisAudit()
 * (non conforme → haute, partiel → normale), relevée à « critique » pour les
 * points dont le référentiel signale que l'absence est critique.
 */
export function recommandations(
  items: ItemReferentiel[],
  parStatut: Record<string, string>,
): Recommandation[] {
  const rang = { critique: 0, haute: 1, normale: 2, basse: 3 } as const;
  const out: Recommandation[] = [];

  for (const item of items) {
    const statut = parStatut[item.item_key] || "non_verifie";
    if (statut !== "non_conforme" && statut !== "partiel") continue;

    const priorite = item.criticite === "critique" && statut === "non_conforme"
      ? "critique"
      : statut === "non_conforme" ? "haute" : "normale";

    out.push({
      item_key: item.item_key,
      categorie: item.categorie,
      titre: item.recommandation,
      description: `Point « ${item.libelle_technique} » déclaré ` +
        (statut === "non_conforme" ? "non conforme" : "partiellement en place") +
        ` lors de l'audit réalisé en autonomie.`,
      priorite,
      statut_audit: statut,
    });
  }

  return out.sort((a, b) => rang[a.priorite] - rang[b.priorite]);
}
