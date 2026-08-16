import { NextResponse } from "next/server";

import {
  clearAuthCookies,
  getAuthenticatedRequestUser,
  getSupabaseConfig,
  getSupabaseAdminKey,
  supabaseAuthFetch,
  verifySupabasePassword,
} from "@/lib/dromap/server/supabase-rest";

export async function DELETE(request: Request) {
  if (!getSupabaseConfig()) {
    return NextResponse.json({ error: "Les comptes DroMap sont momentanément indisponibles." }, { status: 503 });
  }
  const adminKey = getSupabaseAdminKey();
  if (!adminKey) {
    return NextResponse.json(
      { error: "La suppression de compte est momentanément indisponible." },
      { status: 503 },
    );
  }
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { passwordConfirmation?: unknown; currentPassword?: unknown }
    | null;
  const confirmation = typeof body?.passwordConfirmation === "string" ? body.passwordConfirmation : "";
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  if (confirmation !== "SUPPRIMER") {
    return NextResponse.json(
      { error: "Saisis SUPPRIMER pour confirmer la suppression définitive du compte." },
      { status: 400 },
    );
  }
  if (!currentPassword) {
    return NextResponse.json({ error: "Saisis ton mot de passe actuel." }, { status: 400 });
  }
  const email = typeof auth.user.email === "string" ? auth.user.email.trim().toLowerCase() : "";
  if (!email || !(await verifySupabasePassword(email, currentPassword))) {
    return NextResponse.json({ error: "Le mot de passe actuel est incorrect." }, { status: 403 });
  }

  try {
    const response = await supabaseAuthFetch(
      `/auth/v1/admin/users/${encodeURIComponent(auth.user.id)}`,
      { method: "DELETE" },
      adminKey,
    );
    if (!response.ok) {
      return NextResponse.json(
        { error: "Suppression du compte impossible pour le moment." },
        { status: response.status },
      );
    }
    return clearAuthCookies(NextResponse.json({ ok: true }));
  } catch {
    return NextResponse.json({ error: "Le compte ne peut pas être supprimé pour le moment." }, { status: 503 });
  }
}
