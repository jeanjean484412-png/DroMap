import { NextResponse } from "next/server";

import {
  getAuthenticatedRequestUser,
  getSupabaseConfig,
  parseJsonResponse,
  supabaseAuthFetch,
  supabaseRestFetch,
} from "@/lib/dromap/server/supabase-rest";

export async function PATCH(request: Request) {
  if (!getSupabaseConfig()) {
    return NextResponse.json(
      { error: "Les comptes DroMap sont momentanément indisponibles." },
      { status: 503 },
    );
  }
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { firstName?: unknown; lastName?: unknown; preferences?: unknown }
    | null;
  const firstName =
    typeof body?.firstName === "string" ? body.firstName.trim().slice(0, 80) : "";
  const lastName =
    typeof body?.lastName === "string" ? body.lastName.trim().slice(0, 80) : "";
  const preferences =
    body?.preferences && typeof body.preferences === "object" && !Array.isArray(body.preferences)
      ? (body.preferences as Record<string, unknown>)
      : {};
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || "Utilisateur DroMap";

  if (!firstName) {
    return NextResponse.json({ error: "Le prénom ne peut pas être vide." }, { status: 400 });
  }

  try {
    const profileResponse = await supabaseRestFetch(
      `/dromap_profiles?user_id=eq.${encodeURIComponent(auth.user.id)}`,
      auth.accessToken,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          display_name: displayName,
          first_name: firstName,
          last_name: lastName || null,
          preferences,
          updated_at: new Date().toISOString(),
        }),
      },
    );
    if (!profileResponse.ok) {
      const payload = await parseJsonResponse(profileResponse);
      console.warn("DroMap: mise à jour du profil refusée", payload);
      return NextResponse.json({ error: "Le profil n’a pas pu être enregistré." }, { status: 502 });
    }

    await supabaseAuthFetch("/auth/v1/user", {
      method: "PUT",
      headers: { Authorization: `Bearer ${auth.accessToken}` },
      body: JSON.stringify({
        data: {
          display_name: displayName,
          first_name: firstName,
          last_name: lastName || null,
        },
      }),
    }).catch(() => null);

    return NextResponse.json({
      ok: true,
      displayName,
      firstName,
      lastName: lastName || null,
      preferences,
    });
  } catch {
    return NextResponse.json(
      { error: "Le profil ne peut pas être enregistré pour le moment." },
      { status: 503 },
    );
  }
}
