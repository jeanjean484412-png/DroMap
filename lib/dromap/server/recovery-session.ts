import "server-only";

// À appeler uniquement APRÈS validation du même JWT par Supabase /auth/v1/user.
// Le flux implicite des liens email Supabase utilise AMR=otp ; PKCE=recovery.
export function hasRecentRecoveryProof(verifiedAccessToken: string, verifiedUserId: string) {
  try {
    const parts = verifiedAccessToken.split(".");
    if (parts.length !== 3) return false;
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    return claims.sub === verifiedUserId && claims.exp > now &&
      Array.isArray(claims.amr) && claims.amr.some((entry: { method?: unknown; timestamp?: unknown }) =>
        (entry.method === "recovery" || entry.method === "otp") &&
        typeof entry.timestamp === "number" &&
        entry.timestamp <= now && entry.timestamp > now - 600,
      );
  } catch {
    return false;
  }
}
