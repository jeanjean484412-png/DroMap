import { checkAbuseLimit } from "@/lib/dromap/server/abuse-limit";
import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { getSupabaseConfig, supabaseAuthFetch } from "@/lib/dromap/server/supabase-rest";
import { NextResponse } from "next/server";
import { getDromapSiteUrl } from "@/lib/dromap/site-url";

async function handlePOST(request: Request) {
  const networkLimit = await checkAbuseLimit(request, "confirmation");
  if (networkLimit) return networkLimit;
  if (!getSupabaseConfig()) {
    return NextResponse.json({ error: "Les comptes DroMap sont momentanément indisponibles." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254) {
    return NextResponse.json({ error: "Renseigne une adresse e-mail valide." }, { status: 400 });
  }
  const identityLimit = await checkAbuseLimit(request, "confirmation", email);
  if (identityLimit) return identityLimit;

  try {
    const redirectTo = `${getDromapSiteUrl()}/login?confirmed=1`;
    const response = await supabaseAuthFetch(
      `/auth/v1/resend?redirect_to=${encodeURIComponent(redirectTo)}`,
      { method: "POST", body: JSON.stringify({ type: "signup", email }) },
    );
    if (response.status === 429) {
      return NextResponse.json({ error: "Trop de demandes. Réessaie dans quelques instants." }, { status: 429 });
    }
    if (!response.ok && response.status !== 400 && response.status !== 404 && response.status !== 422) {
      return NextResponse.json({ error: "L’e-mail de confirmation ne peut pas être envoyé pour le moment." }, { status: 503 });
    }
    // Même réponse pour une adresse inconnue, déjà confirmée ou encore en attente.
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "L’e-mail de confirmation ne peut pas être envoyé pour le moment." }, { status: 503 });
  }
}

export const POST = withRequestSecurity(handlePOST);
