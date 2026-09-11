import { checkAbuseLimit } from "@/lib/dromap/server/abuse-limit";
import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { NextResponse } from "next/server";

import { getDromapBillingAccessForSession } from "@/lib/dromap/server/billing";
import {
  displayNameFromUser,
  extractTokens,
  getSupabaseConfig,
  parseJsonResponse,
  setAuthCookies,
  supabaseAuthFetch,
  supabaseRestFetch,
  type SupabaseTokenPayload,
} from "@/lib/dromap/server/supabase-rest";

type ProfileRow = {
  display_name?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  preferences?: unknown;
};

async function handlePOST(request: Request) {
  const networkLimit = await checkAbuseLimit(request, "sign-in");
  if (networkLimit) return networkLimit;
  if (!getSupabaseConfig()) {
    return NextResponse.json(
      { error: "Les comptes DroMap sont momentanément indisponibles." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { email?: unknown; password?: unknown }
    | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254) return NextResponse.json({ error: "Adresse e-mail invalide." }, { status: 400 });
  if (email) {
    const identityLimit = await checkAbuseLimit(request, "sign-in", email);
    if (identityLimit) return identityLimit;
  }
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json(
      { error: "Renseigne ton adresse e-mail et ton mot de passe." },
      { status: 400 },
    );
  }

  try {
    const authResponse = await supabaseAuthFetch("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const payload = await parseJsonResponse<SupabaseTokenPayload>(authResponse);
    if (!authResponse.ok) {
      return NextResponse.json(
        {
          error:
            authResponse.status === 400
              ? "Adresse e-mail ou mot de passe incorrect."
              : authResponse.status === 429
                ? "Trop de tentatives. Réessaie dans quelques instants."
                : "Connexion impossible pour le moment.",
        },
        { status: authResponse.status === 400 ? 401 : authResponse.status },
      );
    }

    const tokens = extractTokens(payload);
    if (!tokens.accessToken || !tokens.refreshToken || !tokens.user?.id) {
      return NextResponse.json({ error: "Connexion incomplète. Réessaie." }, { status: 502 });
    }

    let profile: ProfileRow | null = null;
    try {
      const profileResponse = await supabaseRestFetch(
        `/dromap_profiles?user_id=eq.${encodeURIComponent(tokens.user.id)}&select=display_name,first_name,last_name,preferences&limit=1`,
        tokens.accessToken,
        { method: "GET" },
      );
      const rows = await parseJsonResponse<ProfileRow[]>(profileResponse);
      profile = profileResponse.ok ? rows?.[0] ?? null : null;
    } catch {
      profile = null;
    }

    const billingAccess = await getDromapBillingAccessForSession(
      tokens.accessToken,
      tokens.user.id,
    );
    const firstName =
      typeof profile?.first_name === "string" && profile.first_name.trim()
        ? profile.first_name.trim()
        : null;
    const lastName =
      typeof profile?.last_name === "string" && profile.last_name.trim()
        ? profile.last_name.trim()
        : null;
    const displayName =
      typeof profile?.display_name === "string" && profile.display_name.trim()
        ? profile.display_name.trim()
        : displayNameFromUser(tokens.user);
    const preferences =
      profile?.preferences && typeof profile.preferences === "object" && !Array.isArray(profile.preferences)
        ? (profile.preferences as Record<string, unknown>)
        : {};

    const response = NextResponse.json({
      authenticated: true,
      account: {
        userId: tokens.user.id,
        email: tokens.user.email ?? email,
        displayName,
        firstName,
        lastName,
        preferences,
        plan: billingAccess?.plan ?? "free",
        singleMapMaxExportProjectIds:
          billingAccess?.singleMapMaxExportProjectIds ?? [],
        publicMapExportProjectIds:
          billingAccess?.publicMapExportProjectIds ?? [],
      },
    });
    return setAuthCookies(response, tokens.accessToken, tokens.refreshToken, tokens.expiresIn);
  } catch {
    return NextResponse.json(
      { error: "Le service de connexion est momentanément indisponible." },
      { status: 503 },
    );
  }
}

export const POST = withRequestSecurity(handlePOST);
