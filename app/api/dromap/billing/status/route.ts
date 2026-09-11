import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { NextResponse } from "next/server";

import {
  getDromapBillingStatusForUser,
  syncDromapSubscriptionFromStripe,
} from "@/lib/dromap/server/billing";
import { getAuthenticatedRequestUser } from "@/lib/dromap/server/supabase-rest";
import {
  getDromapStripeClient,
  isDromapStripeConfigured,
  isDromapStripeTestMode,
} from "@/lib/dromap/server/stripe";

export const runtime = "nodejs";

async function handleGET() {
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });

  try {
    let status = await getDromapBillingStatusForUser(auth.user.id);

    // Le portail Stripe peut modifier/résilier un abonnement alors qu’un
    // webhook local n’est pas lancé. Quand un abonnement Stripe est connu,
    // on relit donc sa source de vérité avant d’afficher la facturation.
    if (status.stripeSubscriptionId) {
      const stripe = getDromapStripeClient();
      if (stripe) {
        try {
          const subscription = await stripe.subscriptions.retrieve(
            status.stripeSubscriptionId,
          );
          await syncDromapSubscriptionFromStripe(subscription);
          status = await getDromapBillingStatusForUser(auth.user.id);
        } catch (stripeError) {
          console.warn("DroMap billing status Stripe refresh:", stripeError);
        }
      }
    }

    return NextResponse.json({
      configured: isDromapStripeConfigured(),
      testMode: isDromapStripeTestMode(),
      ...status,
    });
  } catch (error) {
    console.error("DroMap billing status:", error);
    return NextResponse.json(
      { error: "État de facturation indisponible pour le moment." },
      { status: 503 },
    );
  }
}

export const GET = withRequestSecurity(handleGET);
