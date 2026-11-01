// =============================================================================
// S@FE — Limites de débit partagées (table rate_limits)
// =============================================================================
// Généralise la logique qui était recopiée dans create-lead et send-audit-email
// (compteur par IP, fenêtre d'une heure). La table rate_limits est fermée à
// anon et authenticated (`rate_limits_deny_all`), seul le service_role y écrit :
// un client ne peut donc pas remettre son propre compteur à zéro.
//
// Convention de clé : "<domaine>:<portee>:<valeur>", par exemple
//   signup_ip:1.2.3.4   pinverify_user:<uuid>   observatory_user:<uuid>

import type { SupabaseClient } from "@supabase/supabase-js";

export interface Quota {
  /** Clé du compteur. */
  cle: string;
  /** Nombre d'appels autorisés dans la fenêtre. */
  max: number;
  /** Durée de la fenêtre, en secondes (3600 = une heure). */
  fenetreSecondes?: number;
}

export interface ResultatQuota {
  ok: boolean;
  restant: number;
}

/**
 * Incrémente le compteur et indique si l'appel est autorisé. Si le quota est
 * déjà atteint, le compteur n'est PAS incrémenté (on ne prolonge pas le
 * blocage à chaque tentative, la fenêtre reste glissante par tranche).
 */
export async function consommerQuota(
  sb: SupabaseClient,
  { cle, max, fenetreSecondes = 3600 }: Quota,
): Promise<ResultatQuota> {
  const fenetreMs = fenetreSecondes * 1000;
  const debut = new Date(Math.floor(Date.now() / fenetreMs) * fenetreMs).toISOString();

  const { data: ligne } = await sb
    .from("rate_limits")
    .select("count, window_at")
    .eq("action", cle)
    .maybeSingle();

  const memeFenetre = ligne?.window_at
    ? new Date(ligne.window_at).getTime() === new Date(debut).getTime()
    : false;

  if (ligne && memeFenetre) {
    if (ligne.count >= max) return { ok: false, restant: 0 };
    await sb.from("rate_limits")
      .update({ count: ligne.count + 1, window_at: debut })
      .eq("action", cle);
    return { ok: true, restant: max - ligne.count - 1 };
  }

  await sb.from("rate_limits")
    .upsert({ action: cle, count: 1, window_at: debut }, { onConflict: "action" });
  return { ok: true, restant: max - 1 };
}

/** Applique plusieurs quotas (par IP et par compte, typiquement). */
export async function consommerQuotas(
  sb: SupabaseClient,
  quotas: Quota[],
): Promise<ResultatQuota & { cle?: string }> {
  for (const q of quotas) {
    const r = await consommerQuota(sb, q);
    if (!r.ok) return { ...r, cle: q.cle };
  }
  return { ok: true, restant: 0 };
}
