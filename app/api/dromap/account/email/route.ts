import { NextResponse } from "next/server";

import {
  getAuthenticatedRequestUser,
  getSupabaseConfig,
  parseJsonResponse,
  supabaseAuthFetch,
  verifySupabasePassword,
} from "@/lib/dromap/server/supabase-rest";

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function POST(request: Request) {
  if (!getSupabaseConfig()) {
    return NextResponse.json(
      { error: "Les comptes DroMap sont momentanément indisponibles." },
      { status: 503 },
    );
  }

  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { email?: unknown; currentPassword?: unknown }
    | null;
  const email = normalizeEmail(body?.email);
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const currentEmail = normalizeEmail(auth.user.email);

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Renseigne une adresse e-mail valide." }, { status: 400 });
  }
  if (email === currentEmail) {
    return NextResponse.json({ error: "Cette adresse est déjà celle de ton compte." }, { status: 400 });
  }
  if (!currentPassword) {
    return NextResponse.json({ error: "Saisis ton mot de passe actuel." }, { status: 400 });
  }
  if (!currentEmail || !(await verifySupabasePassword(currentEmail, currentPassword))) {
    return NextResponse.json({ error: "Le mot de passe actuel est incorrect." }, { status: 403 });
  }

  try {
    const origin = new URL(request.url).origin;
    const redirectTo = `${origin}/account?email-change=confirmed`;
    const response = await supabaseAuthFetch(
      `/auth/v1/user?redirect_to=${encodeURIComponent(redirectTo)}`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${auth.accessToken}` },
        body: JSON.stringify({ email }),
      },
    );
    const payload = await parseJsonResponse<Record<string, unknown>>(response);
    if (!response.ok) {
      console.warn("DroMap: changement d’adresse e-mail refusé", payload);
      return NextResponse.json(
        {
          error:
            response.status === 429
              ? "Trop de demandes ont été envoyées. Réessaie dans quelques instants."
              : response.status === 400 || response.status === 422
                ? "Cette adresse e-mail ne peut pas être utilisée."
                : "Le changement d’adresse e-mail est impossible pour le moment.",
        },
        { status: response.status },
      );
    }

    return NextResponse.json({
      ok: true,
      pendingEmail: email,
      message:
        "Demande envoyée. Par sécurité, Supabase peut demander une confirmation sur l’ancienne ET la nouvelle adresse. Confirme tous les messages reçus pour finaliser le changement.",
    });
  } catch {
    return NextResponse.json(
      { error: "Le changement d’adresse e-mail est impossible pour le moment." },
      { status: 503 },
    );
  }
}
