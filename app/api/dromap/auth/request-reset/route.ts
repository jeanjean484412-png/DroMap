import { checkAbuseLimit } from "@/lib/dromap/server/abuse-limit";
import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { NextResponse } from "next/server";

import {
  getSupabaseConfig,
  supabaseAuthFetch,
} from "@/lib/dromap/server/supabase-rest";

async function handlePOST(request: Request) {
  const networkLimit = await checkAbuseLimit(request, "reset");
  if (networkLimit) return networkLimit;
  if (!getSupabaseConfig()) {
    return NextResponse.json({ error: "Les comptes DroMap sont momentanément indisponibles." }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254) return NextResponse.json({ error: "Adresse e-mail invalide." }, { status: 400 });
  if (email) {
    const identityLimit = await checkAbuseLimit(request, "reset", email);
    if (identityLimit) return identityLimit;
  }
  if (!email) {
    return NextResponse.json({ error: "Renseigne ton adresse e-mail." }, { status: 400 });
  }

  try {
    const origin = new URL(request.url).origin;
    const redirectTo = `${origin}/reset-password`;
    const authResponse = await supabaseAuthFetch(
      `/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`,
      { method: "POST", body: JSON.stringify({ email }) },
    );
    if (!authResponse.ok) {
      return NextResponse.json(
        {
          error:
            authResponse.status === 429
              ? "Trop de demandes ont été envoyées. Réessaie dans quelques instants."
              : "L’e-mail de réinitialisation ne peut pas être envoyé pour le moment.",
        },
        { status: authResponse.status },
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "L’e-mail de réinitialisation ne peut pas être envoyé pour le moment." },
      { status: 503 },
    );
  }
}

export const POST = withRequestSecurity(handlePOST);
