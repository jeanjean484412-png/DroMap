import type { DromapAccountPlan } from "@/lib/dromap/plans";

export type DromapAccountSession = {
  userId: string;
  email: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  preferences: Record<string, unknown>;
  plan: DromapAccountPlan;
  singleMapMaxExportProjectIds: string[];
  publicMapExportProjectIds: string[];
};

export type DromapSessionResult = {
  configured: boolean;
  authenticated: boolean;
  account: DromapAccountSession | null;
  error?: string;
};

type ApiResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
};


async function fetchWithSessionRefresh(input: RequestInfo | URL, init: RequestInit) {
  let response = await fetch(input, { ...init, credentials: "same-origin" });
  if (response.status !== 401) return response;
  try {
    const refreshed = await fetch("/api/dromap/auth/session", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (refreshed.ok) {
      response = await fetch(input, { ...init, credentials: "same-origin" });
    }
  } catch {
    // Le second appel n'est pas tenté si le rafraîchissement de session échoue.
  }
  return response;
}

async function readApiJson<T>(response: Response): Promise<ApiResult<T>> {
  let data: T | null = null;
  try {
    data = (await response.json()) as T;
  } catch {
    data = null;
  }
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const message =
    record && typeof record.error === "string"
      ? record.error
      : response.ok
        ? null
        : "L’opération n’a pas pu être effectuée.";
  return { ok: response.ok, status: response.status, data, error: message };
}

export async function getDromapSession(): Promise<DromapSessionResult> {
  try {
    const response = await fetch("/api/dromap/auth/session", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    const result = await readApiJson<DromapSessionResult>(response);
    if (result.data) return result.data;
    return {
      configured: response.status !== 503,
      authenticated: false,
      account: null,
      error: result.error ?? undefined,
    };
  } catch {
    return {
      configured: true,
      authenticated: false,
      account: null,
      error: "Connexion au service de compte indisponible.",
    };
  }
}

export async function signInDromapAccount(email: string, password: string) {
  const response = await fetch("/api/dromap/auth/sign-in", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return readApiJson<{
    authenticated: boolean;
    account?: DromapAccountSession;
    error?: string;
  }>(response);
}

export async function signUpDromapAccount(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  returnTo = "/dashboard",
  termsVersion?: string,
) {
  const response = await fetch("/api/dromap/auth/sign-up", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, firstName, lastName, returnTo, termsVersion }),
  });
  return readApiJson<{
    authenticated: boolean;
    requiresEmailConfirmation?: boolean;
    account?: DromapAccountSession;
    error?: string;
  }>(response);
}

export async function requestDromapPasswordReset(email: string) {
  const response = await fetch("/api/dromap/auth/request-reset", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return readApiJson<{ ok: boolean; error?: string }>(response);
}

export async function adoptDromapRecoverySession(
  accessToken: string,
  refreshToken: string,
  expiresIn?: number,
  purpose: "login" | "recovery" = "login",
) {
  const response = await fetch("/api/dromap/auth/adopt", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken, refreshToken, expiresIn, purpose }),
  });
  return readApiJson<{ authenticated: boolean; error?: string }>(response);
}

export async function changeDromapPassword(password: string, currentPassword = "") {
  const response = await fetchWithSessionRefresh("/api/dromap/account/password", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, currentPassword }),
  });
  return readApiJson<{ ok: boolean; error?: string }>(response);
}

export async function requestDromapEmailChange(email: string, currentPassword: string) {
  const response = await fetchWithSessionRefresh("/api/dromap/account/email", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, currentPassword }),
  });
  return readApiJson<{
    ok: boolean;
    pendingEmail?: string;
    message?: string;
    error?: string;
  }>(response);
}

export async function updateDromapProfile(profile: {
  firstName: string;
  lastName: string;
  preferences?: Record<string, unknown>;
}) {
  const response = await fetchWithSessionRefresh("/api/dromap/account/profile", {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
  return readApiJson<{
    ok: boolean;
    displayName?: string;
    firstName?: string | null;
    lastName?: string | null;
    preferences?: Record<string, unknown>;
    error?: string;
  }>(response);
}

export async function deleteDromapAccount(passwordConfirmation: string, currentPassword: string) {
  const response = await fetchWithSessionRefresh("/api/dromap/account", {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passwordConfirmation, currentPassword }),
  });
  return readApiJson<{ ok: boolean; error?: string }>(response);
}

export async function signOutDromapAccount() {
  const response = await fetch("/api/dromap/auth/sign-out", {
    method: "POST",
    credentials: "same-origin",
  });
  return readApiJson<{ ok: boolean; error?: string }>(response);
}

export type DromapAccountUsage = {
  activeProjects: number;
  trashedProjects: number;
  projectBytes: number;
  libraryBytes: number;
  totalBytes: number;
};

export async function getDromapAccountUsage() {
  const response = await fetchWithSessionRefresh("/api/dromap/account/usage", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  return readApiJson<DromapAccountUsage & { error?: string }>(response);
}
