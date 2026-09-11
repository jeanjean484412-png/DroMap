import "server-only";

import { getSupabaseAdminKey, getSupabaseConfig } from "./supabase-rest";

export async function securityRpc(name: string, parameters: Record<string, unknown>): Promise<unknown> {
  const config = getSupabaseConfig();
  const key = getSupabaseAdminKey();
  if (!config || !key) throw new Error("SECURITY_STORAGE_UNAVAILABLE");
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
    method: "POST", headers, body: JSON.stringify(parameters), cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  // Aucun repli permissif si la migration n'est pas installée.
  if (!response.ok) throw new Error("SECURITY_STORAGE_UNAVAILABLE");
  return response.json();
}
