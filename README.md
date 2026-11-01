# safe-audits — Audits gratuits S@FE

Tunnel d'audits gratuits publics : RGPD, SEO local, GEO (référencement IA),
usages de l'IA, cybersécurité, réseaux sociaux.

**URL** : https://audits.safe-digitalisation.fr

## Structure

```
safe-audits/
├── index.html              ← Hub des 6 audits
├── core/
│   ├── audit/              ← Formulaires + moteur de scoring
│   │   ├── mission.html    ← Page de diagnostic (paramètre ?m=)
│   │   ├── mission-data.js ← Questions et scoring par domaine
│   │   └── referentiels/   ← Référentiels scoring (cyber, rgpd, seo)
│   └── design-system/      ← Tokens CSS, thème, composants partagés
├── supabase/
│   ├── functions/          ← Edge functions (soumission, email, vérification)
│   └── migrations/         ← Schéma audit (quota email)
├── robots.txt
├── sitemap.xml
└── CNAME
```

## Déploiement

GitHub Pages depuis la branche `main` → `audits.safe-digitalisation.fr`

## Edge Functions

| Fonction | Rôle |
|---|---|
| `client-audit-submit` | Soumission d'un audit (scoring + PDF + email) |
| `send-audit-email` | Envoi du rapport par email |
| `request-audit-verification` | Vérification email avant audit |
| `verify-audit-email` | Validation du code email |
| `create-lead` | Création de prospect depuis le formulaire |

Ces fonctions restent déployées sur le projet Supabase `Safe-crm-V2`
tant que l'éclatement Supabase n'est pas fait (Phase 4).
