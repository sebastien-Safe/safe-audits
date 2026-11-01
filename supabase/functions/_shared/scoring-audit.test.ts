import { assertEquals } from "@std/assert";
import {
  calculerScore, niveauRisque, recommandations, valeurStatut,
  type ItemReferentiel,
} from "./scoring-audit.ts";

// =============================================================================
// Jeu d'essai PARTAGÉ avec le barème du front.
// Copie exacte du scénario de tests/referentiels-scoring.test.js (vitest). Les
// deux implémentations du barème existent pour une raison technique (le front
// est en JavaScript classique, les Edge Functions ne peuvent pas l'importer) :
// ce scénario commun est le garde-fou. Si l'un des deux barèmes change sans
// l'autre, l'un des deux tests tombe.
// Toute modification ici doit être reportée à l'identique côté vitest.
// =============================================================================

function item(
  cle: string, cat: string, poids: number, ordre: number,
  criticite: ItemReferentiel["criticite"],
): ItemReferentiel {
  return {
    item_key: cle, categorie: cat, categorie_label: cat.toUpperCase(),
    categorie_label_client: cat.toUpperCase(), poids_categorie: poids, ordre,
    libelle_technique: cle, libelle_client: "q", aide_client: "h",
    recommandation: "r " + cle, criticite, auto_source: null,
  };
}

const ITEMS: ItemReferentiel[] = [
  item("a1", "a", 0.6, 1, "critique"),
  item("a2", "a", 0.6, 2, "normale"),
  item("a3", "a", 0.6, 3, "basse"),
  item("b1", "b", 0.4, 1, "haute"),
  item("b2", "b", 0.4, 2, "normale"),
];

const REPONSES: Record<string, string> = {
  a1: "conforme",      // 1
  a2: "partiel",       // 0,5
  a3: "na",            // exclu du dénominateur
  b1: "non_conforme",  // 0
  // b2 absent → non_verifie → 0
};

// a : (1 + 0,5) / 2 = 75 % ; b : 0 % ; global : 75 × 0,6 = 45
const ATTENDU = { score: 45, catScores: { a: 75, b: 0 } };

Deno.test("valeurStatut — conforme 1, partiel 0,5, le reste 0", () => {
  assertEquals(valeurStatut("conforme"), 1);
  assertEquals(valeurStatut("partiel"), 0.5);
  assertEquals(valeurStatut("non_conforme"), 0);
  assertEquals(valeurStatut("non_verifie"), 0);
});

Deno.test("valeurStatut — « na » est exclu du dénominateur", () => {
  assertEquals(valeurStatut("na"), null);
});

Deno.test("calculerScore — reproduit le scénario partagé avec le front", () => {
  const r = calculerScore(ITEMS, REPONSES);
  assertEquals(r.score, ATTENDU.score);
  assertEquals(r.catScores, ATTENDU.catScores);
});

Deno.test("calculerScore — une catégorie entièrement « non concernée » vaut 0, pas NaN", () => {
  const r = calculerScore([item("x1", "x", 1, 1, "normale")], { x1: "na" });
  assertEquals(r.catScores.x, 0);
  assertEquals(r.score, 0);
});

Deno.test("calculerScore — tout conforme donne 100", () => {
  const r = calculerScore(ITEMS, {
    a1: "conforme", a2: "conforme", a3: "conforme", b1: "conforme", b2: "conforme",
  });
  assertEquals(r.score, 100);
});

Deno.test("calculerScore — une réponse inconnue est traitée comme sans réponse", () => {
  const r = calculerScore(ITEMS, { ...REPONSES, b2: "n_importe_quoi" });
  assertEquals(r.score, ATTENDU.score);
});

Deno.test("niveauRisque — seuils 80 / 50 / 25", () => {
  assertEquals(niveauRisque(100), "faible");
  assertEquals(niveauRisque(80), "faible");
  assertEquals(niveauRisque(79), "modere");
  assertEquals(niveauRisque(50), "modere");
  assertEquals(niveauRisque(49), "eleve");
  assertEquals(niveauRisque(25), "eleve");
  assertEquals(niveauRisque(24), "critique");
  assertEquals(niveauRisque(0), "critique");
});

Deno.test("recommandations — ne retient que non conforme et partiel", () => {
  const r = recommandations(ITEMS, REPONSES);
  assertEquals(r.map((x) => x.item_key), ["b1", "a2"]);
});

Deno.test("recommandations — le critique non conforme passe devant", () => {
  const r = recommandations(ITEMS, { a1: "non_conforme", a2: "partiel", b1: "non_conforme" });
  assertEquals(r[0].item_key, "a1");
  assertEquals(r[0].priorite, "critique");
  assertEquals(r[1].priorite, "haute");
  assertEquals(r[2].priorite, "normale");
});

Deno.test("recommandations — un point critique seulement partiel n'est pas relevé au maximum", () => {
  const r = recommandations(ITEMS, { a1: "partiel" });
  assertEquals(r[0].priorite, "normale");
});

Deno.test("recommandations — le titre est l'action du référentiel, pas le libellé technique", () => {
  const r = recommandations(ITEMS, { b1: "non_conforme" });
  assertEquals(r[0].titre, "r b1");
});
