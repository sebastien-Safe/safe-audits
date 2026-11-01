import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditOperation = "email" | "lead";

export function normaliserEmailAudit(email: string): string {
  return email.trim().toLowerCase();
}

export async function empreinteAudit(
  secret: string,
  valeur: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(valeur),
  );
  return Array.from(
    new Uint8Array(signature),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function autoriserSoumissionAudit(
  sb: SupabaseClient,
  secret: string,
  email: string,
  token: string,
  submissionId: string,
  operation: AuditOperation,
): Promise<{ status: string; error?: string }> {
  if (!token || token.length > 128) return { status: "invalid" };
  const emailHash = await empreinteAudit(
    secret,
    `email:${normaliserEmailAudit(email)}`,
  );
  const tokenHash = await empreinteAudit(secret, `token:${token}`);
  const { data, error } = await sb.rpc("authorize_public_audit_submission", {
    p_email_hash: emailHash,
    p_token_hash: tokenHash,
    p_submission_id: submissionId,
    p_operation: operation,
  });

  if (error) return { status: "error", error: error.message };
  return { status: typeof data === "string" ? data : "error" };
}
