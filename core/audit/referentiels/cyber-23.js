/* =========================================================
   S@FE — Référentiel Cybersécurité, 23 points (ANSSI / CIS)
   =========================================================
   SOURCE UNIQUE DE VÉRITÉ. Remplace la constante CYBER_CATS
   qui était déclarée en dur dans cyber-core.js.

   Les clés (`key`), les catégories, les poids et le champ
   `label` sont repris À L'IDENTIQUE de l'ancienne constante :
   ils servent de clé primaire dans cyber_client_audits et
   composent les titres du plan d'action déjà en base. Ne jamais
   les renommer sans migration de données — et sans vérifier
   cyberdesk/modules/Cyber, qui écrit dans les mêmes tables.

   Trois champs sont ajoutés pour l'espace client :
     - `question` : la même exigence, formulée en question simple,
                    sans jargon, pour un dirigeant de TPE ;
     - `aide`     : une phrase qui explique pourquoi ça compte ;
     - `reco`     : l'action à mener, telle qu'elle apparaîtra
                    dans les recommandations à cocher ;
     - `criticite`: 'critique' pour les points dont l'absence
                    suffit à faire perdre l'entreprise.
   ========================================================= */
(function (global) {
  'use strict';

  const CYBER_23 = {
    acces: {
      label: 'Accès & Identités', icon: '🔐', weight: 0.25,
      label_client: 'Qui peut entrer dans vos outils',
      items: [
        {
          key: 'pw_policy',
          label: 'Politique de mots de passe (12 car. min, complexité)',
          question: 'Vos mots de passe professionnels font-ils au moins 12 caractères, avec des lettres, des chiffres et des symboles ?',
          aide: 'Un mot de passe court se devine en quelques minutes avec un logiciel ; un mot de passe long, non.',
          reco: 'Imposer des mots de passe de 12 caractères minimum et un gestionnaire de mots de passe',
          criticite: 'haute',
        },
        {
          key: 'mfa',
          label: 'MFA activé sur les comptes critiques (admin, email, cloud)',
          question: 'Pour ouvrir votre messagerie ou votre banque en ligne, faut-il un code supplémentaire (SMS ou application) en plus du mot de passe ?',
          aide: 'Ce second code, appelé double authentification, bloque quelqu\'un qui aurait volé votre mot de passe.',
          reco: 'Activer la double authentification sur la messagerie, la banque et les outils en ligne',
          criticite: 'critique',
        },
        {
          key: 'no_generic',
          label: 'Aucun compte générique ou partagé actif',
          question: 'Chaque personne a-t-elle son propre identifiant, sans compte partagé du type « accueil » ou « contact » ?',
          aide: 'Avec un compte partagé, impossible de savoir qui a fait quoi le jour où il y a un problème.',
          reco: 'Supprimer les comptes partagés et créer un identifiant par personne',
          criticite: 'haute',
        },
        {
          key: 'access_review',
          label: 'Droits d\'accès revus au moins annuellement',
          question: 'Vérifiez-vous au moins une fois par an qui a encore accès à quoi ?',
          aide: 'Un ancien salarié ou un ancien prestataire qui garde ses accès est une porte ouverte.',
          reco: 'Mettre en place une revue annuelle des accès et fermer les comptes inutilisés',
          criticite: 'normale',
        },
        {
          key: 'admin_account',
          label: 'Compte admin dédié, distinct du compte courant',
          question: 'Utilisez-vous un compte séparé pour installer des logiciels et administrer vos machines ?',
          aide: 'Travailler en permanence avec les pleins pouvoirs permet à un virus de tout modifier d\'un coup.',
          reco: 'Créer un compte d\'administration distinct du compte de travail quotidien',
          criticite: 'haute',
        },
      ],
    },

    mises_a_jour: {
      label: 'Mises à jour & Correctifs', icon: '🔄', weight: 0.20,
      label_client: 'Vos logiciels sont-ils à jour',
      items: [
        {
          key: 'os_update',
          label: 'Systèmes d\'exploitation à jour',
          question: 'Windows, macOS ou Android de vos appareils professionnels sont-ils à jour ?',
          aide: 'Les mises à jour rebouchent les failles que les attaquants utilisent en priorité.',
          reco: 'Activer les mises à jour automatiques du système sur tous les appareils',
          criticite: 'critique',
        },
        {
          key: 'app_update',
          label: 'Applications et logiciels à jour',
          question: 'Vos logiciels métier, votre navigateur et votre site web sont-ils tenus à jour ?',
          aide: 'Un vieux module de site web ou un vieux logiciel de caisse est une cible facile.',
          reco: 'Tenir à jour les logiciels métier, le navigateur et les extensions du site web',
          criticite: 'haute',
        },
        {
          key: 'av_active',
          label: 'Antivirus / EDR actif et mis à jour',
          question: 'Un antivirus est-il installé, actif et à jour sur chaque ordinateur ?',
          aide: 'Sans antivirus actif, un fichier piégé reçu par e-mail s\'installe sans rien signaler.',
          reco: 'Installer un antivirus à jour sur chaque poste et vérifier qu\'il est bien actif',
          criticite: 'critique',
        },
        {
          key: 'patch_policy',
          label: 'Politique de patch définie et respectée',
          question: 'Savez-vous qui s\'occupe des mises à jour et à quel rythme ?',
          aide: 'Quand personne n\'est désigné, les mises à jour finissent par être repoussées indéfiniment.',
          reco: 'Désigner un responsable des mises à jour et fixer un rythme écrit',
          criticite: 'normale',
        },
      ],
    },

    sauvegardes: {
      label: 'Sauvegardes', icon: '💾', weight: 0.20,
      label_client: 'Vos sauvegardes',
      items: [
        {
          key: 'backup_regular',
          label: 'Sauvegardes automatiques régulières (quotidienne pour données critiques)',
          question: 'Vos données importantes sont-elles sauvegardées automatiquement chaque jour ?',
          aide: 'Une sauvegarde manuelle « quand on y pense » est presque toujours trop ancienne le jour où on en a besoin.',
          reco: 'Mettre en place une sauvegarde automatique quotidienne des données essentielles',
          criticite: 'critique',
        },
        {
          key: 'backup_tested',
          label: 'Restauration testée au moins une fois par an',
          question: 'Avez-vous déjà vérifié, au moins une fois, que vous savez récupérer un fichier depuis votre sauvegarde ?',
          aide: 'Une sauvegarde jamais testée est une sauvegarde dont on découvre qu\'elle est vide le jour de l\'incident.',
          reco: 'Tester au moins une fois par an la restauration d\'un fichier depuis la sauvegarde',
          criticite: 'critique',
        },
        {
          key: 'backup_offsite',
          label: 'Sauvegardes hors-site ou cloud (règle 3-2-1)',
          question: 'Une copie de vos sauvegardes se trouve-t-elle ailleurs que dans vos locaux ?',
          aide: 'Un incendie, un vol ou un rançongiciel emporte tout ce qui est branché au même endroit.',
          reco: 'Conserver une copie des sauvegardes hors des locaux (disque déporté ou service en ligne)',
          criticite: 'critique',
        },
        {
          key: 'backup_rto',
          label: 'RTO et RPO définis et documentés',
          question: 'Savez-vous combien de temps vous pourriez tenir à l\'arrêt, et combien de données vous accepteriez de perdre ?',
          aide: 'Ces deux repères déterminent le type de sauvegarde dont vous avez réellement besoin.',
          reco: 'Écrire la durée d\'arrêt et la perte de données acceptables pour l\'activité',
          criticite: 'normale',
        },
      ],
    },

    reseau: {
      label: 'Réseau & Accès distants', icon: '🌐', weight: 0.15,
      label_client: 'Votre connexion et votre Wi-Fi',
      items: [
        {
          key: 'vpn',
          label: 'VPN utilisé pour les accès distants',
          question: 'Quand vous travaillez à distance, utilisez-vous une connexion sécurisée dédiée pour atteindre vos outils internes ?',
          aide: 'Une connexion sécurisée, ou VPN, évite qu\'on lise vos échanges depuis un Wi-Fi public.',
          reco: 'Mettre en place une connexion sécurisée (VPN) pour le travail à distance',
          criticite: 'normale',
        },
        {
          key: 'wifi_secure',
          label: 'Wi-Fi sécurisé (WPA2/WPA3, réseau invité séparé)',
          question: 'Votre Wi-Fi professionnel a-t-il un mot de passe solide, et vos visiteurs passent-ils par un réseau séparé ?',
          aide: 'Un visiteur sur votre réseau principal peut atteindre vos fichiers depuis son propre téléphone.',
          reco: 'Changer le mot de passe Wi-Fi par défaut et créer un réseau séparé pour les visiteurs',
          criticite: 'haute',
        },
        {
          key: 'firewall',
          label: 'Pare-feu configuré et actif',
          question: 'Le pare-feu de votre box et de vos ordinateurs est-il activé ?',
          aide: 'Le pare-feu refuse les connexions venues de l\'extérieur que vous n\'avez pas demandées.',
          reco: 'Vérifier que le pare-feu est actif sur la box et sur chaque poste',
          criticite: 'haute',
        },
        {
          key: 'network_seg',
          label: 'Segmentation réseau (serveurs / postes / IoT)',
          question: 'Vos objets connectés (caméras, imprimantes, terminal de paiement) sont-ils séparés de vos ordinateurs ?',
          aide: 'Ces appareils sont rarement mis à jour : isolés, ils ne servent pas de tremplin vers vos données.',
          reco: 'Isoler les objets connectés sur un réseau distinct des ordinateurs',
          criticite: 'normale',
        },
      ],
    },

    sensibilisation: {
      label: 'Sensibilisation & Procédures', icon: '👥', weight: 0.10,
      label_client: 'Vos réflexes et ceux de votre équipe',
      items: [
        {
          key: 'training',
          label: 'Formation cybersécurité des collaborateurs (≥ 1/an)',
          question: 'Vous et vos collaborateurs avez-vous été sensibilisés aux risques informatiques dans l\'année ?',
          aide: 'La très grande majorité des attaques commencent par un clic humain, pas par une faille technique.',
          reco: 'Organiser une sensibilisation annuelle aux risques informatiques',
          criticite: 'haute',
        },
        {
          key: 'phishing',
          label: 'Procédure anti-phishing connue et appliquée',
          question: 'Chacun sait-il quoi faire devant un e-mail suspect qui réclame un paiement ou un mot de passe ?',
          aide: 'Le faux e-mail, ou hameçonnage, imite un fournisseur ou un dirigeant pour obtenir un virement.',
          reco: 'Écrire et diffuser la conduite à tenir devant un e-mail ou un appel suspect',
          criticite: 'critique',
        },
        {
          key: 'charter',
          label: 'Charte informatique signée par les utilisateurs',
          question: 'Les règles d\'usage du matériel professionnel sont-elles écrites et signées ?',
          aide: 'Un document signé vous protège juridiquement et clarifie ce qui est permis.',
          reco: 'Faire signer une charte d\'usage du matériel informatique',
          criticite: 'basse',
        },
      ],
    },

    continuite: {
      label: 'Continuité & Gestion de crise', icon: '🚨', weight: 0.10,
      label_client: 'Si tout s\'arrête demain matin',
      items: [
        {
          key: 'pca',
          label: 'Plan de continuité (PCA/PRI) documenté',
          question: 'Avez-vous écrit comment continuer à travailler si votre informatique était bloquée plusieurs jours ?',
          aide: 'Même une feuille A4 (qui appeler, quoi redémarrer d\'abord) change tout le jour J.',
          reco: 'Rédiger une fiche de continuité : quoi faire, dans quel ordre, avec quels moyens de secours',
          criticite: 'haute',
        },
        {
          key: 'contacts_cyber',
          label: 'Contacts urgence cyber (ANSSI 3918, assureur, prestataire)',
          question: 'Savez-vous qui appeler en premier en cas de piratage, et ces numéros sont-ils accessibles hors de l\'ordinateur ?',
          aide: 'Le 17Cyber et Cybermalveillance.gouv.fr orientent gratuitement ; votre assureur et votre prestataire doivent être joignables même écran éteint.',
          reco: 'Afficher la liste des contacts d\'urgence (assureur, prestataire, 17Cyber) hors informatique',
          criticite: 'haute',
        },
        {
          key: 'crisis_proc',
          label: 'Procédure de crise définie et testée',
          question: 'Avez-vous déjà répété, même rapidement, ce que chacun ferait en cas d\'attaque ?',
          aide: 'Sous la pression, on suit ce qu\'on a répété — pas ce qu\'on va improviser.',
          reco: 'Tester une fois la procédure de crise, même sous forme d\'exercice court',
          criticite: 'normale',
        },
      ],
    },
  };

  global.SafeAudit = global.SafeAudit || {};
  global.SafeAudit.CYBER_23 = CYBER_23;
})(typeof globalThis !== 'undefined' ? globalThis : window);
