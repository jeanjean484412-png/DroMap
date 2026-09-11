import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const DROMAP_ACCESS_COOKIE = "dromap-auth-access";
export const DROMAP_REFRESH_COOKIE = "dromap-auth-refresh";
export const DROMAP_RECOVERY_COOKIE = "dromap-auth-recovery";

export type SupabaseAuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

const AUTH_USER_CACHE_TTL_MS = 30_000;
const AUTH_USER_CACHE_MAX_ENTRIES = 32;
const authenticatedUserCache = new Map<string, { user: SupabaseAuthUser; expiresAt: number }>();

function readCachedAuthenticatedUser(accessToken: string) {
  const cached = authenticatedUserCache.get(accessToken);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    authenticatedUserCache.delete(accessToken);
    return null;
  }
  // Rafraîchir l'ordre d'insertion pour garder les entrées récemment utilisées.
  authenticatedUserCache.delete(accessToken);
  authenticatedUserCache.set(accessToken, cached);
  return cached.user;
}

function cacheAuthenticatedUser(accessToken: string, user: SupabaseAuthUser) {
  authenticatedUserCache.delete(accessToken);
  authenticatedUserCache.set(accessToken, { user, expiresAt: Date.now() + AUTH_USER_CACHE_TTL_MS });
  while (authenticatedUserCache.size > AUTH_USER_CACHE_MAX_ENTRIES) {
    const oldest = authenticatedUserCache.keys().next().value as string | undefined;
    if (!oldest) break;
    authenticatedUserCache.delete(oldest);
  }
}

export type SupabaseTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  user?: SupabaseAuthUser | null;
  session?: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    user?: SupabaseAuthUser | null;
  } | null;
  error?: string;
  error_description?: string;
  msg?: string;
  message?: string;
};

type SupabaseConfig = {
  url: string;
  publicKey: string;
};

function cleanBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !publicKey) return null;
  return { url: cleanBaseUrl(url), publicKey };
}

export function getSupabaseAdminKey() {
  return (
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    null
  );
}

export function supabaseConfigurationError() {
  return NextResponse.json(
    {
      configured: false,
      error:
        "La connexion aux comptes DroMap n’est pas encore configurée sur ce serveur.",
    },
    { status: 503 },
  );
}

export async function parseJsonResponse<T = unknown>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function getSupabaseErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as Record<string, unknown>;
  for (const key of ["msg", "message", "error_description", "error"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

export async function supabaseAuthFetch(
  path: string,
  init: RequestInit = {},
  keyOverride?: string | null,
) {
  const config = getSupabaseConfig();
  if (!config) throw new Error("SUPABASE_NOT_CONFIGURED");
  const apiKey = keyOverride?.trim() || config.publicKey;
  const headers = new Headers(init.headers);
  headers.set("apikey", apiKey);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (keyOverride && !apiKey.startsWith("sb_secret_")) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }

  return fetch(`${config.url}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export async function verifySupabasePassword(email: string, password: string) {
  if (!email || !password) return false;
  try {
    const response = await supabaseAuthFetch(
      "/auth/v1/token?grant_type=password",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function supabaseRestFetch(
  path: string,
  accessToken: string,
  init: RequestInit = {},
) {
  const config = getSupabaseConfig();
  if (!config) throw new Error("SUPABASE_NOT_CONFIGURED");
  const headers = new Headers(init.headers);
  headers.set("apikey", config.publicKey);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${config.url}/rest/v1${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export async function readAuthCookies() {
  const cookieStore = await cookies();
  return {
    accessToken: cookieStore.get(DROMAP_ACCESS_COOKIE)?.value ?? null,
    refreshToken: cookieStore.get(DROMAP_REFRESH_COOKIE)?.value ?? null,
  };
}

export async function fetchSupabaseUser(accessToken: string) {
  const response = await supabaseAuthFetch("/auth/v1/user", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await parseJsonResponse<SupabaseAuthUser & Record<string, unknown>>(response);
  return { response, user: response.ok && payload?.id ? payload : null };
}

export function extractTokens(payload: SupabaseTokenPayload | null) {
  const session = payload?.session ?? null;
  return {
    accessToken: payload?.access_token ?? session?.access_token ?? null,
    refreshToken: payload?.refresh_token ?? session?.refresh_token ?? null,
    expiresIn: payload?.expires_in ?? session?.expires_in ?? 3600,
    user: payload?.user ?? session?.user ?? null,
  };
}

export async function refreshSupabaseSession(refreshToken: string) {
  const response = await supabaseAuthFetch("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const payload = await parseJsonResponse<SupabaseTokenPayload>(response);
  const tokens = extractTokens(payload);
  return { response, payload, ...tokens };
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function setAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
  expiresIn = 3600,
) {
  response.cookies.set(
    DROMAP_ACCESS_COOKIE,
    accessToken,
    cookieOptions(Math.max(60, Math.floor(expiresIn))),
  );
  response.cookies.set(
    DROMAP_REFRESH_COOKIE,
    refreshToken,
    // Rolling browser persistence; absolute lifetime/revocation is managed by Auth.
    cookieOptions(60 * 60 * 24 * 30),
  );
  return response;
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set(DROMAP_ACCESS_COOKIE, "", cookieOptions(0));
  response.cookies.set(DROMAP_REFRESH_COOKIE, "", cookieOptions(0));
  response.cookies.set(DROMAP_RECOVERY_COOKIE, "", cookieOptions(0));
  return response;
}

export async function getAuthenticatedRequestUser(expectedOwnerId?: string | null) {
  const { accessToken } = await readAuthCookies();
  if (!accessToken) return null;

  // Les routes projets/bibliothèque peuvent s'enchaîner très vite (manifestes,
  // chunks, heartbeat). Éviter de recontacter /auth/v1/user à chaque requête
  // réduit fortement la latence sans changer les droits : les appels REST
  // Supabase continuent d'utiliser le JWT original et restent protégés par RLS.
  const cachedUser = readCachedAuthenticatedUser(accessToken);
  if (cachedUser) return expectedOwnerId && cachedUser.id !== expectedOwnerId ? null : { accessToken, user: cachedUser };

  const { response, user } = await fetchSupabaseUser(accessToken);
  if (!response.ok || !user) return null;
  if (expectedOwnerId && user.id !== expectedOwnerId) return null;
  cacheAuthenticatedUser(accessToken, user);
  return { accessToken, user };
}

export function displayNameFromUser(user: SupabaseAuthUser) {
  const metadataName = user.user_metadata?.display_name;
  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName.trim();
  }
  const email = typeof user.email === "string" ? user.email.trim() : "";
  return email ? email.split("@")[0] || "Utilisateur DroMap" : "Utilisateur DroMap";
}
