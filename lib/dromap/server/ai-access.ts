import "server-only";

import { NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "./supabase-rest";
import { getDromapBillingAccessForSession } from "./billing";
import { securityRpc } from "./security-rpc";

export async function checkAiAccess(scope: "ai" | "geojson" = "ai") {
  try {
    const auth = await getAuthenticatedRequestUser();
    if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
    if (scope === "ai") {
      const billing = await getDromapBillingAccessForSession(auth.accessToken, auth.user.id);
      if (!billing) throw new Error("BILLING_UNAVAILABLE");
      if (!["plus", "pro", "tester"].includes(billing.plan)) {
        return NextResponse.json({ error: "L’assistant IA nécessite un abonnement Plus ou Pro." }, { status: 403 });
      }
    }
    const allowed = await securityRpc("dromap_take_ai_request", {
      p_user_id: auth.user.id, p_scope: scope, p_limit: 30,
    });
    if (allowed !== true) {
      return NextResponse.json({ error: "Trop de demandes rapprochées. Réessaie dans une minute." }, {
        status: 429, headers: { "Retry-After": "60" },
      });
    }
    return null;
  } catch {
    return NextResponse.json({ error: "Les droits ne peuvent pas être vérifiés pour le moment." }, { status: 503 });
  }
}
