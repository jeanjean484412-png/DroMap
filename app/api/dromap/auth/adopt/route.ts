import { NextResponse } from "next/server";

import {
  DROMAP_RECOVERY_COOKIE,
  fetchSupabaseUser,
  getSupabaseConfig,
  setAuthCookies,
} from "@/lib/dromap/server/supabase-rest";

export async function POST(request: Request) {
  if (!getSupabaseConfig()) {
    return NextResponse.json({ error: "Le service de compte n’est pas configuré." }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as
    | { accessToken?: unknown; refreshToken?: unknown; expiresIn?: unknown; purpose?: unknown }
    | null;
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken : "";
  const refreshToken = typeof body?.refreshToken === "string" ? body.refreshToken : "";
  const purpose = body?.purpose === "recovery" ? "recovery" : "login";
  const expiresIn =
    typeof body?.expiresIn === "number" && Number.isFinite(body.expiresIn)
      ? Math.max(60, Math.floor(body.expiresIn))
      : 3600;
  if (!accessToken || !refreshToken) {
    return NextResponse.json({ error: "Lien de connexion incomplet." }, { status: 400 });
  }
  try {
    const { response: authResponse, user } = await fetchSupabaseUser(accessToken);
    if (!authResponse.ok || !user) {
      return NextResponse.json({ error: "Ce lien a expiré ou n’est plus valide." }, { status: 401 });
    }
    const response = setAuthCookies(
      NextResponse.json({ authenticated: true }),
      accessToken,
      refreshToken,
      expiresIn,
    );
    response.cookies.set(DROMAP_RECOVERY_COOKIE, purpose === "recovery" ? "1" : "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: purpose === "recovery" ? 10 * 60 : 0,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Validation du lien impossible." }, { status: 503 });
  }
}
