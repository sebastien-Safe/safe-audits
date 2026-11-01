/* =========================================================
   S@FE — Référentiel SEO, 25 points
   =========================================================
   SOURCE UNIQUE DE VÉRITÉ. Remplace la constante SEO_CATS
   déclarée en dur dans seo-core.js.

   Comme pour le cyber, `key`, `label`, catégories et poids sont
   repris À L'IDENTIQUE : `key` est la clé de seo_client_audits.

   Champ supplémentaire `auto` : indique les points que l'espace
   client renseigne tout seul à partir du domaine saisi.
     - 'pagespeed'  : déduit de l'Edge Function pagespeed-analyze
     - 'observatory': déduit de l'Edge Function observatory-scan
     - 'probe'      : déduit d'une simple requête HTTP (robots.txt,
                      sitemap.xml), faite par observatory-scan
   Un point automatique reste modifiable par le consultant.
   ========================================================= */
(function (global) {
  'use strict';

  const SEO_25 = {
    technique: {
      label: 'Technique', icon: '⚙️', weight: 0.30,
      label_client: 'Les fondations de votre site',
      items: [
        {
          key: 'https',
          label: 'HTTPS actif, certificat SSL valide',
          question: 'Votre site s\'ouvre-t-il avec le petit cadenas, en https ?',
          aide: 'Sans cadenas, les navigateurs affichent « site non sécurisé » et Google vous déclasse.',
          reco: 'Activer le certificat de sécurité (https) sur l\'ensemble du site',
          criticite: 'critique', auto: 'observatory',
        },
        {
          key: 'sitemap',
          label: 'Sitemap.xml présent et soumis à Google',
          question: 'Votre site fournit-il à Google la liste de ses pages ?',
          aide: 'Ce fichier, le sitemap, évite que des pages restent invisibles parce que Google ne les a pas trouvées.',
          reco: 'Publier un fichier sitemap.xml et le déclarer à Google',
          criticite: 'haute', auto: 'probe',
        },
        {
          key: 'robots',
          label: 'Robots.txt configuré correctement',
          question: 'Votre site indique-t-il correctement aux moteurs de recherche ce qu\'ils peuvent consulter ?',
          aide: 'Un fichier robots.txt mal réglé peut, par erreur, interdire tout votre site à Google.',
          reco: 'Corriger le fichier robots.txt pour ne pas bloquer les pages utiles',
          criticite: 'haute', auto: 'probe',
        },
        {
          key: 'no_404',
          label: 'Pas d\'erreurs 404 sur les pages principales',
          question: 'Tous les liens de votre menu et de votre page d\'accueil fonctionnent-ils ?',
          aide: 'Une page introuvable fait fuir le visiteur et fait perdre des points à votre site.',
          reco: 'Corriger les liens cassés des pages principales',
          criticite: 'haute',
        },
        {
          key: 'vitesse',
          label: 'Vitesse de chargement < 3s (mobile)',
          question: 'Votre site s\'affiche-t-il en moins de 3 secondes sur un téléphone ?',
          aide: 'Au-delà de 3 secondes, une grande partie des visiteurs repart avant d\'avoir vu la page.',
          reco: 'Réduire le temps de chargement mobile sous 3 secondes',
          criticite: 'haute', auto: 'pagespeed',
        },
        {
          key: 'cwv',
          label: 'Core Web Vitals conformes (LCP, FID, CLS)',
          question: 'Votre site est-il confortable à utiliser sur mobile, sans éléments qui sautent pendant le chargement ?',
          aide: 'Google mesure trois repères de confort ; les rater fait reculer votre position.',
          reco: 'Corriger les indicateurs de confort de navigation mesurés par Google',
          criticite: 'normale', auto: 'pagespeed',
        },
        {
          key: 'mobile',
          label: 'Site responsive / mobile-friendly (Google Mobile Test)',
          question: 'Votre site est-il lisible sur un téléphone sans zoomer ni faire défiler sur le côté ?',
          aide: 'La majorité de vos visiteurs arrivent depuis un mobile, et Google juge d\'abord cette version.',
          reco: 'Rendre le site lisible et utilisable sur téléphone',
          criticite: 'critique', auto: 'pagespeed',
        },
        {
          key: 'schema',
          label: 'Balisage Schema.org présent (LocalBusiness, FAQ…)',
          question: 'Votre site indique-t-il à Google, dans un format qu\'il comprend, votre activité, votre adresse et vos horaires ?',
          aide: 'Ces informations structurées permettent d\'apparaître avec vos horaires et vos avis directement dans les résultats.',
          reco: 'Ajouter les données structurées d\'entreprise locale (activité, adresse, horaires)',
          criticite: 'normale',
        },
      ],
    },

    onpage: {
      label: 'On-Page', icon: '📝', weight: 0.25,
      label_client: 'Le contenu de vos pages',
      items: [
        {
          key: 'title',
          label: 'Balises title optimisées (50-60 car., mot-clé principal)',
          question: 'Chaque page a-t-elle un titre court et précis, contenant ce que vous vendez et votre ville ?',
          aide: 'Ce titre est la ligne bleue cliquable dans Google : c\'est lui qui décide du clic.',
          reco: 'Réécrire les titres de pages en 50 à 60 caractères, avec l\'activité et la ville',
          criticite: 'haute',
        },
        {
          key: 'meta_desc',
          label: 'Meta descriptions présentes et uniques (150-160 car.)',
          question: 'Chaque page a-t-elle son petit texte de présentation, différent des autres ?',
          aide: 'C\'est le résumé affiché sous le titre dans Google ; sans lui, Google improvise.',
          reco: 'Rédiger une description unique de 150 à 160 caractères par page',
          criticite: 'normale',
        },
        {
          key: 'h1',
          label: 'Balises H1 uniques par page avec mot-clé cible',
          question: 'Chaque page a-t-elle un grand titre visible, unique, qui dit de quoi elle parle ?',
          aide: 'Ce titre principal aide Google et le visiteur à comprendre la page en une seconde.',
          reco: 'Donner à chaque page un titre principal unique et explicite',
          criticite: 'normale',
        },
        {
          key: 'maillage',
          label: 'Maillage interne cohérent et fonctionnel',
          question: 'Vos pages se renvoient-elles les unes vers les autres par des liens ?',
          aide: 'Ces liens internes guident le visiteur et montrent à Google quelles pages comptent.',
          reco: 'Relier les pages entre elles par des liens internes cohérents',
          criticite: 'basse',
        },
        {
          key: 'alt_img',
          label: 'Attributs ALT présents sur les images importantes',
          question: 'Vos images ont-elles une description écrite ?',
          aide: 'Cette description sert aux personnes malvoyantes et permet à Google de comprendre l\'image.',
          reco: 'Décrire les images importantes par un texte alternatif',
          criticite: 'basse',
        },
        {
          key: 'canonical',
          label: 'Balises canoniques configurées',
          question: 'Si un même contenu est accessible par plusieurs adresses, indiquez-vous laquelle est la bonne ?',
          aide: 'Sans cette indication, Google hésite entre vos pages et n\'en met aucune en avant.',
          reco: 'Déclarer l\'adresse de référence de chaque page',
          criticite: 'basse',
        },
      ],
    },

    contenu: {
      label: 'Contenu', icon: '✍️', weight: 0.20,
      label_client: 'Ce que vous publiez',
      items: [
        {
          key: 'contenu_unique',
          label: 'Contenu original, sans duplication (pas de contenu mince)',
          question: 'Vos textes sont-ils écrits par vous, et non repris d\'un autre site ou d\'un fournisseur ?',
          aide: 'Un texte recopié ailleurs n\'apporte aucun point à votre site.',
          reco: 'Réécrire les textes repris ailleurs avec vos propres mots',
          criticite: 'haute',
        },
        {
          key: 'blog_actif',
          label: 'Blog / actualités actif (≥ 1 publication/mois)',
          question: 'Publiez-vous au moins une actualité ou un article par mois ?',
          aide: 'Un site qui bouge est visité plus souvent par Google qu\'un site figé.',
          reco: 'Publier au moins une actualité ou un article par mois',
          criticite: 'normale',
        },
        {
          key: 'pages_service',
          label: 'Pages de service optimisées par mot-clé cible',
          question: 'Chacune de vos prestations a-t-elle sa propre page ?',
          aide: 'Une page par prestation permet d\'être trouvé sur chaque recherche, plutôt que sur aucune.',
          reco: 'Créer une page dédiée par prestation, avec la ville visée',
          criticite: 'haute',
        },
        {
          key: 'cocon_sem',
          label: 'Structure en cocon sémantique (pillar pages + clusters)',
          question: 'Vos pages sont-elles organisées par thème, avec une page principale par sujet ?',
          aide: 'Regrouper les pages par thème renforce leur position sur ce thème.',
          reco: 'Regrouper les pages par thème autour d\'une page principale',
          criticite: 'basse',
        },
      ],
    },

    local: {
      label: 'SEO Local (GMB)', icon: '📍', weight: 0.15,
      label_client: 'Votre visibilité près de chez vous',
      items: [
        {
          key: 'gmb_cree',
          label: 'Fiche Google My Business créée et vérifiée',
          question: 'Votre fiche d\'établissement Google existe-t-elle et est-elle validée ?',
          aide: 'C\'est l\'encadré qui apparaît à droite dans Google et sur Maps : c\'est souvent le premier contact.',
          reco: 'Créer et faire valider la fiche d\'établissement Google',
          criticite: 'critique',
        },
        {
          key: 'nap_coherent',
          label: 'NAP cohérent (Nom, Adresse, Tél.) sur tous les supports',
          question: 'Votre nom, votre adresse et votre téléphone sont-ils écrits exactement pareil partout ?',
          aide: 'Deux adresses différentes sur deux annuaires et Google ne sait plus où vous situer.',
          reco: 'Harmoniser nom, adresse et téléphone sur le site, la fiche Google et les annuaires',
          criticite: 'haute',
        },
        {
          key: 'avis',
          label: 'Avis clients gérés, réponses publiées',
          question: 'Répondez-vous aux avis clients, y compris aux négatifs ?',
          aide: 'Répondre rassure les futurs clients et compte dans le classement local.',
          reco: 'Répondre systématiquement aux avis clients',
          criticite: 'haute',
        },
        {
          key: 'gmb_photos',
          label: 'Photos à jour sur la fiche GMB (≥ 10 photos)',
          question: 'Votre fiche Google contient-elle au moins une dizaine de photos récentes ?',
          aide: 'Les fiches avec photos sont nettement plus consultées et plus appelées.',
          reco: 'Ajouter au moins dix photos récentes sur la fiche Google',
          criticite: 'normale',
        },
      ],
    },

    backlinks: {
      label: 'Backlinks & Autorité', icon: '🔗', weight: 0.10,
      label_client: 'Les sites qui parlent de vous',
      items: [
        {
          key: 'bl_qualite',
          label: 'Profil de backlinks sain (pas de liens toxiques)',
          question: 'À votre connaissance, aucun site douteux ne pointe vers le vôtre ?',
          aide: 'Des liens venant de sites douteux peuvent pénaliser votre site.',
          reco: 'Faire le tri des liens entrants douteux',
          criticite: 'normale',
        },
        {
          key: 'bl_entrants',
          label: 'Liens entrants de qualité (domaines pertinents et variés)',
          question: 'D\'autres sites sérieux de votre région ou de votre métier renvoient-ils vers le vôtre ?',
          aide: 'Chaque lien depuis un site reconnu agit comme une recommandation aux yeux de Google.',
          reco: 'Obtenir des liens depuis des sites locaux ou professionnels reconnus',
          criticite: 'normale',
        },
        {
          key: 'ancres',
          label: 'Ancres diversifiées (marque + générique + mots-clés)',
          question: 'Les textes cliquables qui mènent à votre site sont-ils variés ?',
          aide: 'Toujours le même texte cliquable paraît artificiel et perd de son effet.',
          reco: 'Varier les textes des liens pointant vers le site',
          criticite: 'basse',
        },
      ],
    },
  };

  global.SafeAudit = global.SafeAudit || {};
  global.SafeAudit.SEO_25 = SEO_25;
})(typeof globalThis !== 'undefined' ? globalThis : window);
