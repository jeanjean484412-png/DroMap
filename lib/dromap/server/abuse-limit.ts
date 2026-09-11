import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { getSupabaseAdminKey } from "@/lib/dromap/server/supabase-rest";
import { securityRpc } from "@/lib/dromap/server/security-rpc";

type Scope = "sign-in" | "sign-up" | "reset" | "contact";
const POLICIES = {
  "sign-in": { seconds: 600, identity: 10, network: 60 },
  "sign-up": { seconds: 3600, identity: 3, network: 15 },
  reset: { seconds: 3600, identity: 3, network: 20 },
  contact: { seconds: 600, identity: 5, network: 10 },
} as const;

export function trustedNetwork(request: Request) {
  // Only Vercel's platform-overwritten header is trusted. Other deployments use
  // one shared bucket until an explicitly trusted ingress is configured.
  const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.trim() : null;
  return ip && isIP(ip) ? ip : "unattributed";
}

export async function checkAbuseLimit(request: Request, scope: Scope, identity?: string) {
  const policy = POLICIES[scope];
  try {
    const secret = getSupabaseAdminKey();
    if (!secret) throw new Error("SECURITY_STORAGE_UNAVAILABLE");
    const buckets = identity
      ? [{ value: `identity:${identity.trim().toLowerCase()}`, limit: policy.identity }]
      : [{ value: `network:${trustedNetwork(request)}`, limit: policy.network }];
    for (const bucket of buckets) {
      const key = createHmac("sha256", secret).update(`dromap-abuse-v1:${scope}:${bucket.value}`).digest("hex");
      const allowed = await securityRpc("dromap_take_abuse_request", {
        p_key: key, p_limit: bucket.limit, p_window_seconds: policy.seconds,
      });
      if (allowed !== true) return NextResponse.json({ error: "Trop de tentatives. Réessaie dans quelques instants." }, {
        status: 429, headers: { "Retry-After": String(policy.seconds) },
      });
    }
    return null;
  } catch {
    return NextResponse.json({ error: "Le service est momentanément indisponible. Réessaie dans quelques instants." }, { status: 503 });
  }
}
