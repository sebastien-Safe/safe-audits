import { assertEquals, assert } from "@std/assert";
import { verifierTurnstile, ipAppelant, empreinteIp } from "./turnstile.ts";

// =============================================================================
// Le constat qui a motivé ce module : les formulaires publics envoyaient déjà un
// jeton Turnstile que personne ne vérifiait. Ces tests verrouillent les trois
// comportements dont dépend la protection.
// =============================================================================

function avecFetch(reponse: unknown, statut = 200) {
  const original = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(new Response(JSON.stringify(reponse), { status: statut }));
  return () => { globalThis.fetch = original; };
}

/** Bascule le garde-fou localhost, et le remet en place ensuite. */
function avecLocalhostTolere(valeur: boolean) {
  const original = Deno.env.get("TURNSTILE_AUTORISE_LOCALHOST");
  if (valeur) Deno.env.set("TURNSTILE_AUTORISE_LOCALHOST", "true");
  else Deno.env.delete("TURNSTILE_AUTORISE_LOCALHOST");
  return () => {
    if (original === undefined) Deno.env.delete("TURNSTILE_AUTORISE_LOCALHOST");
    else Deno.env.set("TURNSTILE_AUTORISE_LOCALHOST", original);
  };
}

const NOMS = ["TURNSTILE_SECRET", "TURNSTILE_SECRET_KEY"] as const;

/**
 * Pose le secret sous le nom demandé et efface l'autre, pour que chaque test
 * parte d'un environnement connu. `nom` permet de vérifier que le nom
 * réellement provisionné (TURNSTILE_SECRET) comme son repli fonctionnent.
 */
function avecSecret(valeur: string | null, nom: typeof NOMS[number] = "TURNSTILE_SECRET") {
  const originaux = NOMS.map((n) => [n, Deno.env.get(n)] as const);
  for (const n of NOMS) Deno.env.delete(n);
  if (valeur !== null) Deno.env.set(nom, valeur);
  return () => {
    for (const [n, v] of originaux) {
      if (v === undefined) Deno.env.delete(n);
      else Deno.env.set(n, v);
    }
  };
}

Deno.test("jeton valide accepté", async () => {
  const s = avecSecret("secret-de-test");
  const f = avecFetch({ success: true });
  try {
    assertEquals(await verifierTurnstile("jeton", "1.2.3.4", true), { ok: true });
  } finally { f(); s(); }
});

Deno.test("jeton refusé par Cloudflare : rejet, même quand le captcha n'est pas exigé", async () => {
  const s = avecSecret("secret-de-test");
  const f = avecFetch({ success: false, "error-codes": ["invalid-input-response"] });
  try {
    const r1 = await verifierTurnstile("jeton", null, true);
    const r2 = await verifierTurnstile("jeton", null, false);
    assertEquals(r1.ok, false);
    assertEquals(r2.ok, false, "un jeton présent mais invalide doit toujours être rejeté");
  } finally { f(); s(); }
});

Deno.test("jeton absent : refusé si exigé, toléré sinon", async () => {
  const s = avecSecret("secret-de-test");
  try {
    const exige = await verifierTurnstile("", null, true);
    assertEquals(exige.ok, false);
    assertEquals(exige.ok === false ? exige.raison : "", "absent");

    const tolere = await verifierTurnstile(undefined, null, false);
    assertEquals(tolere.ok, true);
  } finally { s(); }
});

Deno.test("secret non configuré : refus là où le captcha est exigé", async () => {
  const s = avecSecret(null);
  try {
    const exige = await verifierTurnstile("jeton", null, true);
    assertEquals(exige.ok, false);
    assertEquals(exige.ok === false ? exige.raison : "", "non_configure");
    // Ailleurs, on ne bloque pas les formulaires qui n'ont pas encore le widget.
    assertEquals((await verifierTurnstile("jeton", null, false)).ok, true);
  } finally { s(); }
});

Deno.test("Cloudflare injoignable : on ne bloque pas un prospect légitime hors exigence", async () => {
  const s = avecSecret("secret-de-test");
  const original = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error("réseau"));
  try {
    assertEquals((await verifierTurnstile("jeton", null, false)).ok, true);
    assertEquals((await verifierTurnstile("jeton", null, true)).ok, false);
  } finally { globalThis.fetch = original; s(); }
});

Deno.test("ipAppelant — première adresse de x-forwarded-for", () => {
  const req = new Request("https://x.test", { headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" } });
  assertEquals(ipAppelant(req), "9.9.9.9");
  assertEquals(ipAppelant(new Request("https://x.test")), "unknown");
});

Deno.test("empreinteIp — stable, courte, et ne contient pas l'adresse", async () => {
  const e1 = await empreinteIp("9.9.9.9");
  const e2 = await empreinteIp("9.9.9.9");
  const e3 = await empreinteIp("9.9.9.8");
  assertEquals(e1, e2);
  assert(e1 !== e3);
  assertEquals(e1.length, 16);
  assert(!e1.includes("9.9.9.9"));
});

Deno.test("le secret est lu sous TURNSTILE_SECRET, le nom réellement provisionné", async () => {
  const s = avecSecret("secret-de-test", "TURNSTILE_SECRET");
  const f = avecFetch({ success: true });
  try {
    assertEquals(await verifierTurnstile("jeton", null, true), { ok: true });
  } finally { f(); s(); }
});

Deno.test("TURNSTILE_SECRET_KEY reste accepté en repli", async () => {
  const s = avecSecret("secret-de-test", "TURNSTILE_SECRET_KEY");
  const f = avecFetch({ success: true });
  try {
    assertEquals(await verifierTurnstile("jeton", null, true), { ok: true });
  } finally { f(); s(); }
});

// ── Contrôle du nom d'hôte d'émission ────────────────────────────────────────
// La configuration du widget autorise aussi localhost et 127.0.0.1 pour le
// développement. Sans ce contrôle, n'importe qui pourrait servir une page depuis
// SA machine, y poser notre sitekey publique, obtenir des jetons valides et les
// rejouer contre nos Edge Functions.

Deno.test("hôte de production accepté", async () => {
  const s = avecSecret("secret-de-test");
  const l = avecLocalhostTolere(false);
  const f = avecFetch({ success: true, hostname: "client.safe-digitalisation.fr" });
  try {
    assertEquals(await verifierTurnstile("jeton", null, true), { ok: true });
  } finally { f(); l(); s(); }
});

Deno.test("les autres domaines S@FE déclarés côté CORS sont acceptés", async () => {
  const s = avecSecret("secret-de-test");
  const l = avecLocalhostTolere(false);
  try {
    for (const hote of ["safe-digitalisation.fr", "www.safe-digitalisation.fr", "www.safe-assurances.fr"]) {
      const f = avecFetch({ success: true, hostname: hote });
      assertEquals((await verifierTurnstile("jeton", null, true)).ok, true, hote);
      f();
    }
  } finally { l(); s(); }
});

Deno.test("jeton émis depuis localhost REFUSÉ par défaut", async () => {
  const s = avecSecret("secret-de-test");
  const l = avecLocalhostTolere(false);
  const f = avecFetch({ success: true, hostname: "localhost" });
  try {
    const r = await verifierTurnstile("jeton", null, true);
    assertEquals(r.ok, false);
    assertEquals(r.ok === false ? r.raison : "", "hote_non_autorise");
    assertEquals(r.ok === false ? r.hote : "", "localhost");
  } finally { f(); l(); s(); }
});

Deno.test("jeton émis depuis 127.0.0.1 REFUSÉ par défaut", async () => {
  const s = avecSecret("secret-de-test");
  const l = avecLocalhostTolere(false);
  const f = avecFetch({ success: true, hostname: "127.0.0.1" });
  try {
    assertEquals((await verifierTurnstile("jeton", null, true)).ok, false);
  } finally { f(); l(); s(); }
});

Deno.test("localhost accepté quand TURNSTILE_AUTORISE_LOCALHOST=true (développement)", async () => {
  const s = avecSecret("secret-de-test");
  const l = avecLocalhostTolere(true);
  const f = avecFetch({ success: true, hostname: "localhost" });
  try {
    assertEquals((await verifierTurnstile("jeton", null, true)).ok, true);
  } finally { f(); l(); s(); }
});

Deno.test("un site tiers qui rejoue notre sitekey est refusé, même avec localhost toléré", async () => {
  const s = avecSecret("secret-de-test");
  const l = avecLocalhostTolere(true);
  const f = avecFetch({ success: true, hostname: "ferme-a-jetons.example" });
  try {
    const r = await verifierTurnstile("jeton", null, true);
    assertEquals(r.ok, false);
    assertEquals(r.ok === false ? r.raison : "", "hote_non_autorise");
  } finally { f(); l(); s(); }
});

Deno.test("réponse sans champ hostname : accepté (compatibilité)", async () => {
  const s = avecSecret("secret-de-test");
  const l = avecLocalhostTolere(false);
  const f = avecFetch({ success: true });
  try {
    assertEquals((await verifierTurnstile("jeton", null, true)).ok, true);
  } finally { f(); l(); s(); }
});
