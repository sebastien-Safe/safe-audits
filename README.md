# safe-audits — Audits gratuits S@FE

Tunnel d'audits gratuits publics : RGPD, SEO local, GEO (référencement IA),
usages de l'IA, cybersécurité, réseaux sociaux.

**URL** : https://audits.safe-digitalisation.fr

## Structure

```
safe-audits/
├── index.html              ← Hub des 6 audits
├── worker.js               ← Worker Cloudflare : POST /api/send-audit
├── wrangler.jsonc
├── core/
│   ├── audit/              ← Formulaires + moteur de scoring (côté navigateur)
│   │   ├── mission.html    ← Page de diagnostic (paramètre ?m=)
│   │   ├── mission-data.js ← Questions et scoring par domaine
│   │   └── referentiels/   ← Référentiels scoring (cyber, rgpd, seo)
│   └── design-system/      ← Tokens CSS, thème, composants partagés
├── robots.txt
└── sitemap.xml
```

## Fonctionnement

Le questionnaire, le score et le PDF sont calculés dans le navigateur.
À l'envoi, `mission.html` appelle `POST /api/send-audit` (Worker de ce même
site) qui :

1. vérifie le jeton Turnstile et applique les limites de débit (par IP et par
   destinataire) ;
2. envoie le rapport au visiteur par Brevo ;
3. envoie une notification à contact@safe-digitalisation.fr (reply-to = visiteur).

Aucune donnée n'est stockée : plus de Supabase, plus de CRM.

## Déploiement

Cloudflare Workers, domaine personnalisé `audits.safe-digitalisation.fr`.

```bash
npx wrangler secret put BREVO              # clé API Brevo
npx wrangler secret put TURNSTILE_SECRET   # clé secrète du widget Turnstile
npx wrangler deploy
```
