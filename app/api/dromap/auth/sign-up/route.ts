import { checkAbuseLimit } from "@/lib/dromap/server/abuse-limit";
import { safeReturnTo } from "@/lib/dromap/safe-return-to";
import { getDromapSiteUrl } from "@/lib/dromap/site-url";
import { securityRpc } from "@/lib/dromap/server/security-rpc";
import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { NextResponse } from "next/server";

import { DROMAP_PRIVACY_VERSION, DROMAP_TERMS_VERSION } from "@/lib/dromap/legal-public";
import {
  extractTokens,
  getSupabaseConfig,
  parseJsonResponse,
  setAuthCookies,
  supabaseAuthFetch,
  type SupabaseTokenPayload,
} from "@/lib/dromap/server/supabase-rest";

function passwordLooksValid(password: string) {
  return password.length >= 8;
}

async function handlePOST(request: Request) {
  const networkLimit = await checkAbuseLimit(request, "sign-up");
  if (networkLimit) return networkLimit;
  if (!getSupabaseConfig()) {
    return NextResponse.json(
      { error: "La création de compte est momentanément indisponible." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | {
        email?: unknown;
        password?: unknown;
        firstName?: unknown;
        lastName?: unknown;
        displayName?: unknown;
        returnTo?: unknown;
        termsVersion?: unknown;
      }
    | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254) return NextResponse.json({ error: "Adresse e-mail invalide." }, { status: 400 });
  if (email) {
    const identityLimit = await checkAbuseLimit(request, "sign-up", email);
    if (identityLimit) return identityLimit;
  }
  const password = typeof body?.password === "string" ? body.password : "";
  const firstName =
    typeof body?.firstName === "string" ? body.firstName.trim().slice(0, 80) : "";
  const lastName =
    typeof body?.lastName === "string" ? body.lastName.trim().slice(0, 80) : "";
  const legacyDisplayName =
    typeof body?.displayName === "string" ? body.displayName.trim().slice(0, 120) : "";
  const displayName =
    [firstName, lastName].filter(Boolean).join(" ") || legacyDisplayName || "Utilisateur DroMap";
  const requestedReturnTo = typeof body?.returnTo === "string" ? body.returnTo : "/dashboard";
  const returnTo = safeReturnTo(requestedReturnTo);

  if (!email || !password) {
    return NextResponse.json(
      { error: "Renseigne une adresse e-mail et un mot de passe." },
      { status: 400 },
    );
  }
  if (!firstName && !legacyDisplayName) {
    return NextResponse.json({ error: "Renseigne ton prénom." }, { status: 400 });
  }
  if (!passwordLooksValid(password)) {
    return NextResponse.json(
      { error: "Le mot de passe doit contenir au moins 8 caractères." },
      { status: 400 },
    );
  }

  try {
    const emailExists = await securityRpc("dromap_email_exists", { p_email: email });
    if (emailExists !== false) {
      if (emailExists !== true) throw new Error("EMAIL_LOOKUP_UNAVAILABLE");
      return NextResponse.json(
        { error: "Cette adresse e-mail est déjà utilisée. Connecte-toi ou renvoie l’e-mail de confirmation.", code: "email_already_used" },
        { status: 409 },
      );
    }
    const redirectTo = `${getDromapSiteUrl()}/login?confirmed=1&returnTo=${encodeURIComponent(returnTo)}`;
    const authResponse = await supabaseAuthFetch(
      `/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo)}`,
      {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          data: {
            display_name: displayName,
            first_name: firstName || null,
            last_name: lastName || null,
            dromap_terms_version: DROMAP_TERMS_VERSION,
            dromap_terms_accepted_at: new Date().toISOString(),
            dromap_privacy_version_acknowledged: DROMAP_PRIVACY_VERSION,
          },
        }),
      },
    );
    const payload = await parseJsonResponse<SupabaseTokenPayload>(authResponse);
    if (!authResponse.ok) {
      if (payload?.code === "user_already_exists") {
        return NextResponse.json(
          { error: "Cette adresse e-mail est déjà utilisée. Connecte-toi ou renvoie l’e-mail de confirmation.", code: "email_already_used" },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          error:
            authResponse.status === 429
              ? "Trop de tentatives. Réessaie dans quelques instants."
              : authResponse.status === 422 || authResponse.status === 400
                ? "Cette adresse e-mail ne peut pas être utilisée pour créer ce compte."
                : "Création du compte impossible pour le moment.",
        },
        { status: authResponse.status },
      );
    }

    const tokens = extractTokens(payload);
    const user = tokens.user ?? payload?.user ?? null;
    if (Array.isArray(user?.identities) && user.identities.length === 0) {
      return NextResponse.json(
        { error: "Cette adresse e-mail est déjà utilisée. Connecte-toi ou renvoie l’e-mail de confirmation.", code: "email_already_used" },
        { status: 409 },
      );
    }
    if (tokens.accessToken && tokens.refreshToken && user?.id) {
      const response = NextResponse.json({
        authenticated: true,
        requiresEmailConfirmation: false,
        account: {
          userId: user.id,
          email: user.email ?? email,
          displayName,
          firstName: firstName || null,
          lastName: lastName || null,
          preferences: {},
          plan: "free",
          singleMapMaxExportProjectIds: [],
          publicMapExportProjectIds: [],
        },
      });
      return setAuthCookies(response, tokens.accessToken, tokens.refreshToken, tokens.expiresIn);
    }

    return NextResponse.json({
      authenticated: false,
      requiresEmailConfirmation: true,
      message: "Compte créé. Consulte ton e-mail pour confirmer ton adresse avant de te connecter.",
    });
  } catch {
    return NextResponse.json(
      { error: "Le service de création de compte est momentanément indisponible." },
      { status: 503 },
    );
  }
}

export const POST = withRequestSecurity(handlePOST);
