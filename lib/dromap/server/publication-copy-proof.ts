import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getSupabaseAdminKey } from "./supabase-rest";

function signature(payload: string) {
  const key = getSupabaseAdminKey();
  if (!key) throw new Error("PUBLICATIONS_NOT_CONFIGURED");
  return createHmac("sha256", key).update(`dromap-publication-copy-v1:${payload}`).digest();
}

export function createPublicationCopyProof(userId: string, slug: string) {
  const projectId = randomUUID();
  const payload = Buffer.from(JSON.stringify({ userId, slug, projectId, expires: Date.now() + 30 * 60_000 })).toString("base64url");
  return { projectId, token: `${payload}.${signature(payload).toString("base64url")}` };
}

export function verifyPublicationCopyProof(token: unknown, userId: string, slug: string, projectId: string) {
  if (typeof token !== "string" || token.length > 4096) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const expected = signature(parts[0]);
    const received = Buffer.from(parts[1], "base64url");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false;
    const proof = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return proof.userId === userId && proof.slug === slug && proof.projectId === projectId && proof.expires > Date.now();
  } catch { return false; }
}
