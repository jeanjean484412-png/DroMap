import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { NextResponse } from "next/server";

import { getDromapBillingStatusForUser } from "@/lib/dromap/server/billing";
import { getAuthenticatedRequestUser } from "@/lib/dromap/server/supabase-rest";
import { getDromapStripeClient } from "@/lib/dromap/server/stripe";

export const runtime = "nodejs";

async function handlePOST(request: Request) {
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const stripe = getDromapStripeClient();
  if (!stripe) return NextResponse.json({ error: "Stripe n’est pas configuré." }, { status: 503 });

  try {
    const billing = await getDromapBillingStatusForUser(auth.user.id);
    if (!billing.stripeCustomerId) {
      return NextResponse.json(
        { error: "Aucune facturation Stripe n’est encore associée à ce compte." },
        { status: 409 },
      );
    }
    const origin = new URL(request.url).origin;
    const session = await stripe.billingPortal.sessions.create({
      customer: billing.stripeCustomerId,
      return_url: `${origin}/account`,
      locale: "fr",
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("DroMap Stripe portal:", error);
    return NextResponse.json(
      { error: "Le portail de facturation Stripe n’est pas disponible pour le moment." },
      { status: 503 },
    );
  }
}

export const POST = withRequestSecurity(handlePOST);
