import { NextResponse } from "next/server";

import {
  clearAuthCookies,
  getSupabaseConfig,
  readAuthCookies,
  supabaseAuthFetch,
} from "@/lib/dromap/server/supabase-rest";

export async function POST() {
  const { accessToken } = await readAuthCookies();
  if (getSupabaseConfig() && accessToken) {
    try {
      await supabaseAuthFetch("/auth/v1/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      // La fermeture locale de session reste possible si le service distant est indisponible.
    }
  }
  return clearAuthCookies(NextResponse.json({ ok: true }));
}
