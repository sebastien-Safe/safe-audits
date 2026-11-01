/* =========================================================
   S@FE — Barème d'audit commun (source unique de vérité)
   =========================================================
   Extrait à l'identique de computeScoreCyber() (cyber-core.js)
   et computeScoreSEO() (seo-core.js), qui dupliquaient le même
   calcul. Le référentiel RGPD client utilise le même barème.

   Aucun accès réseau, aucune dépendance : fonctions pures,
   testables (tests/referentiels-scoring.test.js) et utilisables
   à l'identique par le CRM, par l'espace client et — via la
   copie en base (table audit_referentiel_items) — par les Edge
   Functions qui recalculent le score côté serveur.

   Chargement : script classique, avant tout appelant.
   ========================================================= */
(function (global) {
  'use strict';

  /** Statuts possibles d'un point de contrôle. */
  const STATUTS = ['non_verifie', 'conforme', 'partiel', 'non_conforme', 'na'];

  /**
   * Valeur d'un statut dans le calcul. `na` est exclu du dénominateur
   * (renvoie null), `non_verifie` et `non_conforme` valent 0.
   */
  function valeurStatut(statut) {
    if (statut === 'na') return null;
    if (statut === 'conforme') return 1;
    if (statut === 'partiel') return 0.5;
    return 0;
  }

  /**
   * Score d'une catégorie, en pourcentage entier.
   * @param {{key:string}[]} items
   * @param {Record<string,string>} parStatut  { item_key: statut }
   */
  function scoreCategorie(items, parStatut) {
    let somme = 0;
    let total = 0;
    for (const item of items) {
      const v = valeurStatut(parStatut[item.key] || 'non_verifie');
      if (v === null) continue;
      total += 1;
      somme += v;
    }
    return total > 0 ? Math.round((somme / total) * 100) : 0;
  }

  /**
   * Score global pondéré et scores par catégorie.
   * @param {Record<string,{weight:number, items:{key:string}[]}>} referentiel
   * @param {Record<string,string>} parStatut  { item_key: statut }
   * @returns {{ score:number, catScores:Record<string,number> }}
   */
  function calculerScore(referentiel, parStatut) {
    const catScores = {};
    for (const [catKey, cat] of Object.entries(referentiel)) {
      catScores[catKey] = scoreCategorie(cat.items, parStatut);
    }
    let pondere = 0;
    for (const [catKey, cat] of Object.entries(referentiel)) {
      pondere += (catScores[catKey] || 0) * cat.weight;
    }
    return { score: Math.round(pondere), catScores };
  }

  /** Nombre total de points de contrôle d'un référentiel. */
  function nbItems(referentiel) {
    return Object.values(referentiel).reduce((n, cat) => n + cat.items.length, 0);
  }

  /** Aplatit un référentiel en liste d'items, catégorie incluse. */
  function listerItems(referentiel) {
    const out = [];
    for (const [catKey, cat] of Object.entries(referentiel)) {
      cat.items.forEach((item, i) => {
        out.push({
          categorie: catKey,
          categorie_label: cat.label,
          poids_categorie: cat.weight,
          ordre: i + 1,
          ...item,
        });
      });
    }
    return out;
  }

  /**
   * Niveau de risque associé à un score global. Volontairement aligné sur
   * scoreBadge() du CRM (seuils 80 / 50) pour qu'un client et son consultant
   * lisent le même verdict.
   */
  function niveauRisque(score) {
    if (score >= 80) return { cle: 'faible',   label: 'Risque faible',   emoji: '🟢' };
    if (score >= 50) return { cle: 'modere',   label: 'Risque modéré',   emoji: '🟡' };
    if (score >= 25) return { cle: 'eleve',    label: 'Risque élevé',    emoji: '🟠' };
    return { cle: 'critique', label: 'Risque critique', emoji: '🔴' };
  }

  /**
   * Recommandations priorisées à partir des réponses : un item non conforme
   * ou partiel donne une action. La priorité reprend la règle déjà appliquée
   * par genererPlanDepuisAudit() (non conforme → haute, partiel → normale),
   * relevée à « critique » pour les points marqués comme tels dans le
   * référentiel.
   */
  function recommandations(referentiel, parStatut) {
    const out = [];
    for (const item of listerItems(referentiel)) {
      const statut = parStatut[item.key] || 'non_verifie';
      if (statut !== 'non_conforme' && statut !== 'partiel') continue;
      const priorite = (item.criticite === 'critique' && statut === 'non_conforme')
        ? 'critique'
        : (statut === 'non_conforme' ? 'haute' : 'normale');
      out.push({
        item_key: item.key,
        categorie: item.categorie,
        titre: item.reco || `Corriger : ${item.label}`,
        priorite,
        statut_audit: statut,
      });
    }
    const rang = { critique: 0, haute: 1, normale: 2, basse: 3 };
    return out.sort((a, b) => rang[a.priorite] - rang[b.priorite]);
  }

  global.SafeAudit = global.SafeAudit || {};
  Object.assign(global.SafeAudit, {
    STATUTS,
    valeurStatut,
    scoreCategorie,
    calculerScore,
    nbItems,
    listerItems,
    niveauRisque,
    recommandations,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
