import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  DROMAP_RECOVERY_COOKIE,
  getAuthenticatedRequestUser,
  getSupabaseConfig,
  supabaseAuthFetch,
  verifySupabasePassword,
} from "@/lib/dromap/server/supabase-rest";

export async function POST(request: Request) {
  if (!getSupabaseConfig()) {
    return NextResponse.json({ error: "Les comptes DroMap sont momentanément indisponibles." }, { status: 503 });
  }
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { password?: unknown; currentPassword?: unknown }
    | null;
  const password = typeof body?.password === "string" ? body.password : "";
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Le nouveau mot de passe doit contenir au moins 8 caractères." },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const recoveryAuthorized = cookieStore.get(DROMAP_RECOVERY_COOKIE)?.value === "1";
  const email = typeof auth.user.email === "string" ? auth.user.email.trim().toLowerCase() : "";

  if (!recoveryAuthorized) {
    if (!currentPassword) {
      return NextResponse.json({ error: "Saisis ton mot de passe actuel." }, { status: 400 });
    }
    if (!email || !(await verifySupabasePassword(email, currentPassword))) {
      return NextResponse.json({ error: "Le mot de passe actuel est incorrect." }, { status: 403 });
    }
    if (currentPassword === password) {
      return NextResponse.json(
        { error: "Le nouveau mot de passe doit être différent de l’ancien." },
        { status: 400 },
      );
    }
  }

  try {
    const response = await supabaseAuthFetch("/auth/v1/user", {
      method: "PUT",
      headers: { Authorization: `Bearer ${auth.accessToken}` },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            response.status === 422 || response.status === 400
              ? "Ce mot de passe ne peut pas être utilisé. Choisis-en un autre."
              : "Modification du mot de passe impossible pour le moment.",
        },
        { status: response.status },
      );
    }
    const nextResponse = NextResponse.json({ ok: true });
    if (recoveryAuthorized) {
      nextResponse.cookies.set(DROMAP_RECOVERY_COOKIE, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
    }
    return nextResponse;
  } catch {
    return NextResponse.json({ error: "Le mot de passe ne peut pas être modifié pour le moment." }, { status: 503 });
  }
}
