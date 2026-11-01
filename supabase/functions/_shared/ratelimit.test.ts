import { assertEquals } from "@std/assert";
import { consommerQuota, consommerQuotas } from "./ratelimit.ts";
// deno-lint-ignore no-explicit-any
type Any = any;

// =============================================================================
// Faux client Supabase : la table rate_limits est fermée à anon/authenticated,
// seul le service_role y écrit, donc un client ne peut pas remettre son propre
// compteur à zéro. Ici on ne teste que l'arithmétique de la fenêtre.
// =============================================================================
function faussebase(lignes: Record<string, { count: number; window_at: string }> = {}) {
  const table = { ...lignes };
  const sb = {
    from(_nom: string) {
      let cle = "";
      const api: Any = {
        select: () => api,
        eq: (_c: string, v: string) => { cle = v; return api; },
        maybeSingle: () => Promise.resolve({ data: table[cle] ?? null }),
        update: (patch: Any) => ({
          eq: (_c: string, v: string) => {
            table[v] = { ...table[v], ...patch };
            return Promise.resolve({ error: null });
          },
        }),
        upsert: (ligne: Any) => {
          table[ligne.action] = { count: ligne.count, window_at: ligne.window_at };
          return Promise.resolve({ error: null });
        },
      };
      return api;
    },
  };
  return { sb: sb as Any, table };
}

const fenetreCourante = (secondes: number) =>
  new Date(Math.floor(Date.now() / (secondes * 1000)) * secondes * 1000).toISOString();

Deno.test("premier appel : compteur créé à 1", async () => {
  const { sb, table } = faussebase();
  const r = await consommerQuota(sb, { cle: "test_ip:1.2.3.4", max: 3 });
  assertEquals(r.ok, true);
  assertEquals(r.restant, 2);
  assertEquals(table["test_ip:1.2.3.4"].count, 1);
});

Deno.test("appels suivants dans la même fenêtre : incrément", async () => {
  const cle = "test_ip:5.6.7.8";
  const { sb, table } = faussebase({ [cle]: { count: 1, window_at: fenetreCourante(3600) } });
  const r = await consommerQuota(sb, { cle, max: 3 });
  assertEquals(r.ok, true);
  assertEquals(table[cle].count, 2);
});

Deno.test("quota atteint : refus, et le compteur n'est PAS incrémenté", async () => {
  const cle = "test_ip:9.9.9.9";
  const { sb, table } = faussebase({ [cle]: { count: 3, window_at: fenetreCourante(3600) } });
  const r = await consommerQuota(sb, { cle, max: 3 });
  assertEquals(r.ok, false);
  assertEquals(r.restant, 0);
  // Ne pas incrémenter évite de prolonger le blocage à chaque tentative.
  assertEquals(table[cle].count, 3);
});

Deno.test("fenêtre expirée : le compteur repart à 1", async () => {
  const cle = "test_ip:1.1.1.1";
  const vieux = new Date(Date.now() - 4 * 3600_000).toISOString();
  const { sb, table } = faussebase({ [cle]: { count: 99, window_at: vieux } });
  const r = await consommerQuota(sb, { cle, max: 3 });
  assertEquals(r.ok, true);
  assertEquals(table[cle].count, 1);
});

Deno.test("fenêtre courte (jour) distincte de la fenêtre horaire", async () => {
  const cle = "test_email:a@b.fr";
  const { sb, table } = faussebase({ [cle]: { count: 2, window_at: fenetreCourante(86400) } });
  const r = await consommerQuota(sb, { cle, max: 3, fenetreSecondes: 86400 });
  assertEquals(r.ok, true);
  assertEquals(table[cle].count, 3);
});

Deno.test("consommerQuotas — s'arrête au premier quota dépassé et le nomme", async () => {
  const { sb, table } = faussebase({
    "q_ip:1": { count: 5, window_at: fenetreCourante(3600) },
  });
  const r = await consommerQuotas(sb, [
    { cle: "q_user:u", max: 10 },
    { cle: "q_ip:1", max: 5 },
    { cle: "q_jamais:x", max: 1 },
  ]);
  assertEquals(r.ok, false);
  assertEquals(r.cle, "q_ip:1");
  // Le quota suivant n'a pas été consommé : pas d'effet de bord après un refus.
  assertEquals(table["q_jamais:x"], undefined);
});

Deno.test("consommerQuotas — tout passe quand chaque quota est disponible", async () => {
  const { sb, table } = faussebase();
  const r = await consommerQuotas(sb, [
    { cle: "ok_user:u", max: 2 },
    { cle: "ok_ip:1", max: 2 },
  ]);
  assertEquals(r.ok, true);
  assertEquals(table["ok_user:u"].count, 1);
  assertEquals(table["ok_ip:1"].count, 1);
});
