import { NextResponse } from "next/server";

import {
  clearAuthCookies,
  displayNameFromUser,
  fetchSupabaseUser,
  getSupabaseConfig,
  parseJsonResponse,
  readAuthCookies,
  refreshSupabaseSession,
  setAuthCookies,
  supabaseRestFetch,
} from "@/lib/dromap/server/supabase-rest";

type ProfileRow = {
  display_name?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  preferences?: unknown;
};

async function getProfile(accessToken: string, userId: string) {
  try {
    const response = await supabaseRestFetch(
      `/dromap_profiles?user_id=eq.${encodeURIComponent(userId)}&select=display_name,first_name,last_name,preferences&limit=1`,
      accessToken,
      { method: "GET" },
    );
    if (!response.ok) return null;
    const rows = await parseJsonResponse<ProfileRow[]>(response);
    const row = rows?.[0];
    if (!row) return null;
    return {
      displayName:
        typeof row.display_name === "string" && row.display_name.trim()
          ? row.display_name.trim()
          : null,
      firstName:
        typeof row.first_name === "string" && row.first_name.trim()
          ? row.first_name.trim()
          : null,
      lastName:
        typeof row.last_name === "string" && row.last_name.trim()
          ? row.last_name.trim()
          : null,
      preferences:
        row.preferences && typeof row.preferences === "object" && !Array.isArray(row.preferences)
          ? (row.preferences as Record<string, unknown>)
          : {},
    };
  } catch {
    return null;
  }
}

export async function GET() {
  if (!getSupabaseConfig()) {
    return NextResponse.json(
      {
        configured: false,
        authenticated: false,
        account: null,
        error: "Les comptes DroMap sont momentanément indisponibles.",
      },
      { status: 503 },
    );
  }

  const { accessToken, refreshToken } = await readAuthCookies();
  let activeAccessToken = accessToken;
  let activeRefreshToken = refreshToken;
  let activeExpiresIn = 3600;
  let user = null as Awaited<ReturnType<typeof fetchSupabaseUser>>["user"];
  let refreshed = false;

  try {
    if (activeAccessToken) {
      const current = await fetchSupabaseUser(activeAccessToken);
      if (current.response.ok && current.user) user = current.user;
    }

    if (!user && activeRefreshToken) {
      const refreshedSession = await refreshSupabaseSession(activeRefreshToken);
      if (
        refreshedSession.response.ok &&
        refreshedSession.accessToken &&
        refreshedSession.refreshToken
      ) {
        activeAccessToken = refreshedSession.accessToken;
        activeRefreshToken = refreshedSession.refreshToken;
        activeExpiresIn = refreshedSession.expiresIn;
        user = refreshedSession.user;
        if (!user) {
          const current = await fetchSupabaseUser(activeAccessToken);
          user = current.user;
        }
        refreshed = true;
      }
    }

    if (!user || !activeAccessToken) {
      return clearAuthCookies(
        NextResponse.json({ configured: true, authenticated: false, account: null }),
      );
    }

    const profile = await getProfile(activeAccessToken, user.id);
    const displayName = profile?.displayName ?? displayNameFromUser(user);
    const response = NextResponse.json({
      configured: true,
      authenticated: true,
      account: {
        userId: user.id,
        email: user.email ?? "",
        displayName,
        firstName: profile?.firstName ?? null,
        lastName: profile?.lastName ?? null,
        preferences: profile?.preferences ?? {},
      },
    });
    if (refreshed && activeRefreshToken) {
      return setAuthCookies(response, activeAccessToken, activeRefreshToken, activeExpiresIn);
    }
    return response;
  } catch {
    return NextResponse.json(
      {
        configured: true,
        authenticated: false,
        account: null,
        error: "Le service de compte est momentanément indisponible.",
      },
      { status: 503 },
    );
  }
}
