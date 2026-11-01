/* =========================================================
   S@FE — Référentiel RGPD client, 19 points  (NOUVEAU)
   =========================================================
   Pourquoi ce référentiel existe : côté CRM, le score RGPD est
   DÉDUIT du contenu des modules DPO (dpo-audit.js construit 18
   points booléens à la volée, dpo-clients-core.js en tire 6
   sous-scores). Rien n'est stocké, et un client ne peut donc pas
   « remplir » cet audit.

   Ce référentiel est le questionnaire déclaratif que le client
   remplit lui-même. Il est volontairement calé sur les six
   dimensions et les six poids de computeScore() (25/20/20/15/
   10/10), afin que le score déclaré par le client et le score
   constaté par le consultant se lisent dimension par dimension.

   Les réponses vont dans dpo_client_audit_items (table qui
   existait déjà en base, sans aucun usage). Le score consultant
   n'est pas modifié : les deux coexistent.

   Vocabulaire : aucun sigle sans explication. « RGPD » est
   employé car les dirigeants le connaissent ; « CNIL »,
   « sous-traitant » et « violation de données » sont expliqués
   dans le champ `aide`.
   ========================================================= */
(function (global) {
  'use strict';

  const RGPD_CLIENT_19 = {
    registre: {
      label: 'Registre des traitements', icon: '📋', weight: 0.25,
      label_client: 'Ce que vous savez de vos fichiers',
      items: [
        {
          key: 'reg_inventaire',
          label: 'Inventaire des données personnelles collectées et de leur finalité',
          question: 'Savez-vous quelles informations personnelles vous conservez, et dans quels outils ?',
          aide: 'Clients, salariés, fournisseurs, candidats, adhérents : nom, e-mail, téléphone, numéro de compte sont tous des informations personnelles.',
          reco: 'Lister les informations personnelles conservées, outil par outil',
          criticite: 'critique',
        },
        {
          key: 'reg_registre',
          label: 'Registre des activités de traitement tenu à jour (Art. 30)',
          question: 'Avez-vous un document qui recense ces fichiers, tenu à jour ?',
          aide: 'Ce document, le registre des traitements, est obligatoire et c\'est la première chose demandée en cas de contrôle.',
          reco: 'Mettre en place le registre des traitements et le tenir à jour',
          criticite: 'critique',
        },
        {
          key: 'reg_base_legale',
          label: 'Base légale identifiée pour chaque traitement',
          question: 'Pour chaque fichier, savez-vous dire pourquoi vous avez le droit de le conserver ?',
          aide: 'Un contrat, une obligation légale, ou l\'accord de la personne : il faut une raison par fichier.',
          reco: 'Indiquer, pour chaque fichier, la raison qui autorise sa conservation',
          criticite: 'haute',
        },
        {
          key: 'reg_duree',
          label: 'Durée de conservation définie pour chaque traitement',
          question: 'Savez-vous combien de temps vous gardez chaque information, et supprimez-vous au-delà ?',
          aide: 'Garder les données « au cas où », indéfiniment, est précisément ce que le RGPD interdit.',
          reco: 'Fixer une durée de conservation par fichier et supprimer au-delà',
          criticite: 'haute',
        },
      ],
    },

    consentements: {
      label: 'Consentements', icon: '✅', weight: 0.20,
      label_client: 'L\'accord de vos contacts',
      items: [
        {
          key: 'cons_prospection',
          label: 'Consentement recueilli avant toute prospection électronique',
          question: 'Avant d\'envoyer une offre par e-mail ou SMS à quelqu\'un qui n\'est pas déjà client, recueillez-vous son accord ?',
          aide: 'Sans accord préalable, l\'envoi est une infraction, même si le message est utile.',
          reco: 'Recueillir un accord explicite avant toute prospection par e-mail ou SMS',
          criticite: 'critique',
        },
        {
          key: 'cons_preuve',
          label: 'Preuve du consentement conservée (date, texte, canal)',
          question: 'Pouvez-vous prouver quand et comment cet accord a été donné ?',
          aide: 'En cas de plainte, c\'est à vous de démontrer que l\'accord existait : il faut en garder la trace.',
          reco: 'Conserver la date, le texte et l\'origine de chaque accord recueilli',
          criticite: 'haute',
        },
        {
          key: 'cons_retrait',
          label: 'Retrait du consentement possible et pris en compte',
          question: 'Vos messages contiennent-ils un moyen simple de ne plus être contacté, et le respectez-vous ?',
          aide: 'Se désinscrire doit être aussi facile que s\'inscrire, et la demande doit être appliquée sans délai.',
          reco: 'Ajouter un lien de désinscription à chaque envoi et traiter les retraits immédiatement',
          criticite: 'haute',
        },
      ],
    },

    documents: {
      label: 'Documents et information', icon: '📄', weight: 0.20,
      label_client: 'Ce que vous dites à vos contacts',
      items: [
        {
          key: 'doc_mentions',
          label: 'Mentions d\'information / politique de confidentialité publiées',
          question: 'Vos clients peuvent-ils lire quelque part ce que vous faites de leurs données ?',
          aide: 'C\'est la politique de confidentialité : une page qui explique ce que vous collectez, pourquoi, et pour combien de temps.',
          reco: 'Publier une politique de confidentialité claire et accessible',
          criticite: 'critique',
        },
        {
          key: 'doc_cookies',
          label: 'Bandeau de consentement aux cookies conforme',
          question: 'Si votre site utilise des cookies de mesure ou de publicité, le visiteur peut-il refuser aussi facilement qu\'accepter ?',
          aide: 'Un bandeau avec seulement un bouton « J\'accepte » n\'est pas conforme et fait l\'objet de sanctions régulières.',
          reco: 'Mettre en place un bandeau cookies permettant de refuser aussi simplement que d\'accepter',
          criticite: 'haute',
        },
        {
          key: 'doc_salaries',
          label: 'Information des salariés sur les traitements les concernant',
          question: 'Si vous avez des salariés, sont-ils informés des données que vous conservez sur eux ?',
          aide: 'Paie, badges, géolocalisation des véhicules, vidéosurveillance : chacun de ces éléments doit être annoncé.',
          reco: 'Informer les salariés par écrit des données conservées à leur sujet',
          criticite: 'normale',
        },
        {
          key: 'doc_contrats',
          label: 'Clause de protection des données dans les contrats clients et fournisseurs',
          question: 'Vos contrats mentionnent-ils la protection des données ?',
          aide: 'Une clause écrite répartit les responsabilités et vous protège si le problème vient de l\'autre partie.',
          reco: 'Ajouter une clause de protection des données aux contrats',
          criticite: 'basse',
        },
      ],
    },

    sous_traitants: {
      label: 'Sous-traitants et hébergement', icon: '🤝', weight: 0.15,
      label_client: 'Les prestataires qui voient vos données',
      items: [
        {
          key: 'st_liste',
          label: 'Liste des sous-traitants ayant accès aux données personnelles',
          question: 'Savez-vous quels prestataires ont accès à vos fichiers ?',
          aide: 'Comptable, éditeur de logiciel, prestataire informatique, agence web, service d\'envoi d\'e-mails : ce sont des sous-traitants au sens du RGPD.',
          reco: 'Lister les prestataires ayant accès aux données personnelles',
          criticite: 'haute',
        },
        {
          key: 'st_contrat',
          label: 'Contrat de sous-traitance conforme (Art. 28) signé avec chacun',
          question: 'Avez-vous un engagement écrit de ces prestataires sur la protection de vos données ?',
          aide: 'Sans cet engagement, vous restez seul responsable de ce qu\'ils feraient de vos fichiers.',
          reco: 'Faire signer un engagement de protection des données à chaque prestataire',
          criticite: 'haute',
        },
        {
          key: 'st_hebergement',
          label: 'Localisation de l\'hébergement connue (UE / transferts encadrés)',
          question: 'Savez-vous dans quel pays vos données sont stockées ?',
          aide: 'Un stockage hors Union européenne demande des garanties supplémentaires, à vérifier avant de choisir un outil.',
          reco: 'Vérifier le pays d\'hébergement de chaque outil et encadrer les transferts hors UE',
          criticite: 'normale',
        },
      ],
    },

    procedures: {
      label: 'Procédures internes', icon: '🔒', weight: 0.10,
      label_client: 'Votre organisation interne',
      items: [
        {
          key: 'proc_referent',
          label: 'Référent protection des données désigné (interne ou externalisé)',
          question: 'Une personne est-elle identifiée chez vous comme responsable du sujet ?',
          aide: 'Même sans obligation de nommer un délégué, désigner quelqu\'un évite que personne ne s\'en occupe.',
          reco: 'Désigner un référent protection des données, interne ou externe',
          criticite: 'normale',
        },
        {
          key: 'proc_securite',
          label: 'Mesures de sécurité des données (accès limités, chiffrement, sauvegardes)',
          question: 'L\'accès à vos fichiers est-il limité aux personnes qui en ont besoin ?',
          aide: 'La protection des données exige des mesures concrètes : accès restreints, mots de passe solides, sauvegardes.',
          reco: 'Restreindre les accès aux fichiers aux seules personnes concernées',
          criticite: 'haute',
        },
        {
          key: 'proc_violation',
          label: 'Procédure de notification d\'une violation de données (72 h)',
          question: 'Sauriez-vous quoi faire si vos fichiers clients étaient volés ou rendus publics ?',
          aide: 'Une fuite de données doit être signalée à la CNIL, l\'autorité française de protection des données, dans les 72 heures.',
          reco: 'Écrire la procédure à suivre en cas de fuite de données, avec le délai de 72 heures',
          criticite: 'critique',
        },
      ],
    },

    droits: {
      label: 'Droits des personnes', icon: '✋', weight: 0.10,
      label_client: 'Les demandes de vos contacts',
      items: [
        {
          key: 'droits_procedure',
          label: 'Procédure de traitement des demandes d\'accès, de rectification et de suppression',
          question: 'Sauriez-vous quoi faire si un client demandait à voir ou à supprimer ses données ?',
          aide: 'Toute personne peut demander ce que vous avez sur elle, le faire corriger, ou le faire effacer.',
          reco: 'Écrire la procédure de réponse aux demandes d\'accès et de suppression',
          criticite: 'haute',
        },
        {
          key: 'droits_delai',
          label: 'Délai de réponse d\'un mois connu et respecté',
          question: 'Savez-vous que vous avez un mois pour répondre à ce type de demande ?',
          aide: 'Passé ce délai, la personne peut saisir la CNIL, l\'autorité française de protection des données, et le dossier devient une réclamation officielle.',
          reco: 'Tenir le délai d\'un mois pour répondre aux demandes reçues',
          criticite: 'normale',
        },
      ],
    },
  };

  global.SafeAudit = global.SafeAudit || {};
  global.SafeAudit.RGPD_CLIENT_19 = RGPD_CLIENT_19;
})(typeof globalThis !== 'undefined' ? globalThis : window);
