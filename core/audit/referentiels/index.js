/* =========================================================
   S@FE — Registre des référentiels d'audit
   =========================================================
   À charger après scoring.js, cyber-23.js, seo-25.js et
   rgpd-client-19.js. Expose le catalogue et un validateur.

   `version` est reportée dans chaque audit soumis
   (client_audits_soumis.referentiel_version) : un audit figé
   reste donc interprétable même après une évolution du
   référentiel. Toute modification du contenu d'un référentiel
   (ajout, retrait ou reformulation d'un point) doit incrémenter
   cette version ET régénérer la migration de semis
   (npm run referentiels:sql).
   ========================================================= */
(function (global) {
  'use strict';

  const A = global.SafeAudit || {};

  const REFERENTIELS = {
    cyber: {
      code: 'cyber',
      version: '1.0.0',
      titre: 'Cybersécurité',
      titre_client: 'Votre sécurité informatique',
      table_reponses: 'cyber_client_audits',
      cats: A.CYBER_23,
    },
    seo: {
      code: 'seo',
      version: '1.0.0',
      titre: 'Visibilité (SEO)',
      titre_client: 'Votre visibilité sur Internet',
      table_reponses: 'seo_client_audits',
      cats: A.SEO_25,
    },
    rgpd: {
      code: 'rgpd',
      version: '1.0.0',
      titre: 'Conformité RGPD',
      titre_client: 'Vos données personnelles',
      table_reponses: 'dpo_client_audit_items',
      cats: A.RGPD_CLIENT_19,
    },
  };

  /** @returns {object|null} le référentiel demandé, ou null. */
  function referentiel(code) {
    return REFERENTIELS[code] || null;
  }

  /**
   * Contrôles d'intégrité d'un référentiel. Utilisé par les tests et
   * par le générateur de migration : un référentiel invalide ne doit
   * jamais atteindre la base.
   * @returns {string[]} liste des anomalies (vide si tout va bien)
   */
  function valider(ref) {
    const erreurs = [];
    if (!ref || !ref.cats) return ['référentiel absent'];

    const poids = Object.values(ref.cats).reduce((s, c) => s + c.weight, 0);
    if (Math.abs(poids - 1) > 1e-9) {
      erreurs.push(`somme des poids = ${poids} (attendu 1)`);
    }

    const vues = new Set();
    for (const [catKey, cat] of Object.entries(ref.cats)) {
      if (!cat.label) erreurs.push(`catégorie ${catKey} sans label`);
      if (!cat.label_client) erreurs.push(`catégorie ${catKey} sans label_client`);
      if (!Array.isArray(cat.items) || cat.items.length === 0) {
        erreurs.push(`catégorie ${catKey} sans item`);
        continue;
      }
      for (const item of cat.items) {
        if (!item.key) { erreurs.push(`item sans clé dans ${catKey}`); continue; }
        if (vues.has(item.key)) erreurs.push(`clé dupliquée : ${item.key}`);
        vues.add(item.key);
        for (const champ of ['label', 'question', 'aide', 'reco', 'criticite']) {
          if (!item[champ]) erreurs.push(`item ${item.key} sans ${champ}`);
        }
        if (!['critique', 'haute', 'normale', 'basse'].includes(item.criticite)) {
          erreurs.push(`item ${item.key} : criticite « ${item.criticite} » inconnue`);
        }
      }
    }
    return erreurs;
  }

  global.SafeAudit = A;
  Object.assign(global.SafeAudit, { REFERENTIELS, referentiel, valider });
})(typeof globalThis !== 'undefined' ? globalThis : window);
