/* =========================================================
   S@FE — Chargeur Node/Deno des référentiels
   =========================================================
   Les quatre fichiers du référentiel sont des scripts classiques
   (pas des modules ES) : ils doivent être consommables par les
   pages du CRM, chargées en <script src> sans étape de build
   (build/targets.json : bundle = false pour safe-rgpd et
   safe-media).

   Ce fichier est le point d'entrée pour les outils qui, eux,
   savent importer : les tests vitest et le générateur de
   migration.

   Les scripts sont lus puis évalués, et non `require()`és :
   safe-crm déclare "type": "module", donc un require() de ces
   .js dépendrait de la prise en charge de require(ESM), apparue
   seulement avec Node 22. L'évaluation directe fonctionne sur
   toute version, et correspond exactement à ce que fait le
   navigateur avec ces mêmes fichiers.
   ========================================================= */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));

const ORDRE = ['scoring.js', 'cyber-23.js', 'seo-25.js', 'rgpd-client-19.js', 'index.js'];

export function chargerSafeAudit() {
  // Rechargement propre : les référentiels sont des singletons posés sur
  // globalThis, il faut repartir de zéro à chaque appel.
  delete globalThis.SafeAudit;

  for (const fichier of ORDRE) {
    const source = fs.readFileSync(path.join(ICI, fichier), 'utf8');
    // eslint-disable-next-line no-new-func
    new Function(source).call(globalThis);
  }

  if (!globalThis.SafeAudit?.REFERENTIELS) {
    throw new Error('Chargement des référentiels incomplet : SafeAudit.REFERENTIELS absent');
  }
  return globalThis.SafeAudit;
}
