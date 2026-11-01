// =============================================================================
// S@FE — Authentification d'un appel venu de l'espace client
// =============================================================================
// Toutes les Edge Functions de l'espace client partagent le même contrôle :
//   1. un JWT valide,
//   2. un profil dont role = 'client' (jamais un compte du personnel),
//   3. un contact_id rattaché.
//
// Le contrôle du rôle est fait ici ET par le RLS (`is_client()`). Le faire dans
// la fonction évite qu'un compte du personnel appelle par erreur une fonction
// prévue pour un client, et rend le refus explicite plutôt que silencieux.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface ClientAppelant {
  userId: string;
  email: string;
  contactId: string;
  /** Claims du JWT, pour les contrôles de fraîcheur d'authentification. */
  claims: Record<string, unknown>;
  /** Le PIN a été validé et la fenêtre de 12 h est encore ouverte. */
  pinVerifie: boolean;
}

export interface OptionsAuth {
  /**
   * Exige une fenêtre PIN ouverte. À mettre à true partout SAUF dans
   * client-pin-set et client-pin-verify : ces fonctions utilisent le
   * service_role, qui contourne le RLS, donc le second facteur doit être
   * revérifié explicitement ici — sinon il ne protégerait que les accès
   * directs à PostgREST, pas les Edge Functions.
   */
  exigerPin?: boolean;
}

export type ResultatAuth =
  | { ok: true; client: ClientAppelant; sb: SupabaseClient }
  | { ok: false; status: number; erreur: string };

/** Décode le corps d'un JWT déjà validé par getUser(). Sans vérification de
 *  signature : c'est getUser() qui l'a faite côté Supabase. */
function lireClaims(jwt: string): Record<string, unknown> {
  try {
    const p = jwt.split(".")[1];
    const json = atob(p.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(p.length / 4) * 4, "="));
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export async function authentifierClient(
  req: Request,
  options: OptionsAuth = {},
): Promise<ResultatAuth> {
  const SB_URL = Deno.env.get("SUPABASE_URL")!;
  const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SB_SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SB_SRV) return { ok: false, status: 500, erreur: "service_role_manquant" };

  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return { ok: false, status: 401, erreur: "non_authentifie" };

  const sbUser = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error } = await sbUser.auth.getUser();
  if (error || !user) return { ok: false, status: 401, erreur: "non_authentifie" };

  const sb = createClient(SB_URL, SB_SRV, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: profil } = await sb
    .from("profiles")
    .select("role, contact_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profil || profil.role !== "client") {
    return { ok: false, status: 403, erreur: "pas_un_compte_client" };
  }
  if (!profil.contact_id) {
    return { ok: false, status: 409, erreur: "compte_sans_fiche" };
  }

  const { data: fenetre } = await sb
    .from("client_pin_sessions")
    .select("expires_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const pinVerifie = !!fenetre?.expires_at && new Date(fenetre.expires_at) > new Date();

  if (options.exigerPin && !pinVerifie) {
    return { ok: false, status: 403, erreur: "pin_requis" };
  }

  return {
    ok: true,
    sb,
    client: {
      userId: user.id,
      email: user.email ?? "",
      contactId: profil.contact_id,
      claims: lireClaims(jwt),
      pinVerifie,
    },
  };
}

/**
 * Vrai si l'authentification d'origine (lien magique / code à usage unique) a
 * moins de `minutes`. On lit le claim `amr` (authentication method reference),
 * qui conserve la méthode et l'horodatage de la connexion initiale et survit au
 * rafraîchissement du jeton — contrairement à `iat`, qui change à chaque
 * rafraîchissement et ne prouverait donc rien.
 */
export function authentificationRecente(claims: Record<string, unknown>, minutes = 15): boolean {
  const limite = Date.now() / 1000 - minutes * 60;
  const amr = claims.amr;

  if (Array.isArray(amr)) {
    for (const e of amr) {
      const entree = e as { method?: string; timestamp?: number };
      if (typeof entree?.timestamp === "number" && entree.timestamp >= limite) return true;
    }
    return false;
  }

  // Projets sans claim amr : repli sur iat, moins précis mais mieux que rien.
  const iat = claims.iat;
  return typeof iat === "number" && iat >= limite;
}
