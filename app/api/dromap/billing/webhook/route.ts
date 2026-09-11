import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

import {
  grantDromapSingleMapMaxExportFromCheckout,
  syncDromapSubscriptionFromStripe,
} from "@/lib/dromap/server/billing";
import { grantDromapPublicationEntitlementFromCheckout } from "@/lib/dromap/server/publications";
import {
  getDromapStripeClient,
  getDromapStripeWebhookSecret,
} from "@/lib/dromap/server/stripe";

export const runtime = "nodejs";

async function handleCheckoutSession(stripe: Stripe, session: Stripe.Checkout.Session) {
  if (session.mode === "payment" && session.payment_status === "paid") {
    if (session.metadata?.dromap_purchase_kind === "public-map") {
      await grantDromapPublicationEntitlementFromCheckout(session);
    } else {
      await grantDromapSingleMapMaxExportFromCheckout(session);
    }
    return;
  }

  if (session.mode === "subscription" && session.subscription) {
    const subscription =
      typeof session.subscription === "string"
        ? await stripe.subscriptions.retrieve(session.subscription)
        : session.subscription;
    await syncDromapSubscriptionFromStripe(subscription);
  }
}

async function handlePOST(request: Request) {
  const stripe = getDromapStripeClient();
  const webhookSecret = getDromapStripeWebhookSecret();
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Webhook Stripe non configuré." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Signature Stripe manquante." }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("DroMap Stripe webhook signature:", error);
    return NextResponse.json({ error: "Signature Stripe invalide." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await handleCheckoutSession(stripe, event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncDromapSubscriptionFromStripe(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
  } catch (error) {
    console.error(`DroMap Stripe webhook ${event.type}:`, error);
    // Stripe doit pouvoir réessayer si la persistance DroMap a échoué.
    return NextResponse.json({ error: "Traitement du webhook impossible." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const POST = withRequestSecurity(handlePOST);
