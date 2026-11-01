// =============================================================================
// S@FE — Vérification Cloudflare Turnstile (siteverify)
// =============================================================================
// Constat de l'état des lieux (§ 5, risque 🔴 3) : les formulaires publics de
// safe-digitalisation.fr embarquent bien le widget Turnstile et transmettent un
// `turnstile_token`, mais AUCUNE Edge Function ne le vérifiait — le captcha ne
// protégeait donc rien. Ce module ajoute la vérification côté serveur.
//
// Turnstile est retenu pour l'espace client parce qu'il ne pose pas de cookie,
// ne profile pas le visiteur et n'envoie aucune donnée personnelle : c'est la
// solution de captcha compatible RGPD demandée au § 4.6 du cahier des charges.
//
// Secret : `TURNSTILE_SECRET` dans les secrets Edge Functions du projet
// bgkijldrmdhklkadkeua — clé secrète du widget dont la sitekey publique est
// 0x4AAAAAAE0whlsk7nDHoVec. Ce secret EXISTE DÉJÀ (posé le 15/09/2026) et est
// documenté dans Site_safe-digitalisation/README.md : il avait été provisionné
// en même temps que le widget, mais aucune fonction ne le lisait — d'où le
// captcha décoratif constaté. On lit donc ce nom, et non un nouveau.
//
// `TURNSTILE_SECRET_KEY` est accepté en repli, pour ne pas dépendre du nom exact
// si le secret est un jour reprovisionné sous l'autre appellation.

import { ALLOWED_ORIGINS } from "./cors.ts";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// ── Contrôle de l'hôte d'émission du jeton ───────────────────────────────────
// La configuration du widget autorise aussi `localhost` et `127.0.0.1`, ce qui
// est nécessaire au développement local. Mais un attaquant peut servir une page
// depuis SA machine sur localhost, y poser notre sitekey, obtenir des jetons
// valides et les rejouer contre nos Edge Functions : l'épinglage au nom d'hôte,
// qui devrait obliger à passer par nos vraies pages, serait contourné.
//
// La réponse de siteverify contient le nom d'hôte pour lequel le jeton a été
// émis : on le compare donc à nos domaines de production. La liste vient de
// ALLOWED_ORIGINS (_shared/cors.ts), source unique déjà maintenue : tout nouveau
// sous-domaine autorisé côté CORS l'est automatiquement ici.
//
// Pour tester en local contre les fonctions déployées, poser le secret
// TURNSTILE_AUTORISE_LOCALHOST=true — et le retirer ensuite.
const HOTES_PRODUCTION: ReadonlySet<string> = new Set(
  ALLOWED_ORIGINS
    .map((origine) => { try { return new URL(origine).hostname.toLowerCase(); } catch { return ""; } })
    .filter(Boolean),
);

function hoteLocal(hote: string): boolean {
  return hote === "localhost" || hote === "127.0.0.1" || hote === "[::1]" || hote.endsWith(".localhost");
}

export type ResultatTurnstile =
  | { ok: true; ignore?: boolean }
  | {
      ok: false;
      raison: "absent" | "invalide" | "non_configure" | "indisponible" | "hote_non_autorise";
      codes?: string[];
      hote?: string;
    };

/**
 * Vérifie un jeton Turnstile auprès de Cloudflare.
 *
 * @param token  le jeton envoyé par le navigateur (`turnstile_token`)
 * @param ip     l'IP de l'appelant, transmise à Cloudflare pour corrélation
 * @param exige  true : l'absence de jeton est un échec. false : un jeton absent
 *               est toléré (formulaires qui n'ont pas encore le widget), mais un
 *               jeton PRÉSENT doit toujours être valide.
 */
export async function verifierTurnstile(
  token: unknown,
  ip: string | null,
  exige: boolean,
): Promise<ResultatTurnstile> {
  const secret = Deno.env.get("TURNSTILE_SECRET") ?? Deno.env.get("TURNSTILE_SECRET_KEY");
  const jeton = typeof token === "string" ? token.trim() : "";

  if (!secret) {
    // Sans secret configuré, on ne peut rien vérifier. On refuse là où le
    // captcha est exigé (plutôt que de laisser passer en silence, ce qui
    // reproduirait exactement le défaut constaté), et on le signale.
    console.error("TURNSTILE_SECRET non configuré — vérification impossible");
    return exige ? { ok: false, raison: "non_configure" } : { ok: true, ignore: true };
  }

  if (!jeton) {
    if (exige) return { ok: false, raison: "absent" };
    return { ok: true, ignore: true };
  }

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", jeton);
  if (ip) form.append("remoteip", ip);

  let data: { success?: boolean; "error-codes"?: string[]; hostname?: string };
  try {
    const res = await fetch(SITEVERIFY, { method: "POST", body: form });
    data = await res.json();
  } catch (e) {
    // Cloudflare injoignable : on ne bloque pas un prospect légitime pour une
    // panne réseau, mais on trace. Le honeypot et la limite par IP restent actifs.
    console.error("Turnstile siteverify injoignable :", (e as Error).message);
    return exige ? { ok: false, raison: "indisponible" } : { ok: true, ignore: true };
  }

  if (data.success) {
    // Jeton valide : reste à vérifier POUR QUEL SITE il a été émis.
    const hote = typeof data.hostname === "string" ? data.hostname.toLowerCase() : "";

    if (hote && !HOTES_PRODUCTION.has(hote)) {
      const localToleres = Deno.env.get("TURNSTILE_AUTORISE_LOCALHOST") === "true";
      if (!(hoteLocal(hote) && localToleres)) {
        console.warn("Turnstile : jeton émis pour un hôte non autorisé —", hote);
        return { ok: false, raison: "hote_non_autorise", hote };
      }
    }

    return { ok: true };
  }

  console.warn("Turnstile refusé :", data["error-codes"]);
  return { ok: false, raison: "invalide", codes: data["error-codes"] };
}

/** IP de l'appelant, telle qu'utilisée par les limites de débit existantes. */
export function ipAppelant(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/**
 * Empreinte d'IP non réversible, pour les journaux (login_audit.ip_hint) : on
 * ne conserve pas l'adresse en clair. Tronquée à 16 caractères, suffisant pour
 * corréler des tentatives sans identifier une personne.
 */
export async function empreinteIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("safe-ip:" + ip));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
