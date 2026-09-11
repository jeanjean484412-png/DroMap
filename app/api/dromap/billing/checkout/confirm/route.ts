import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

import {
  grantDromapSingleMapMaxExportFromCheckout,
  syncDromapSubscriptionFromStripe,
} from "@/lib/dromap/server/billing";
import { getAuthenticatedRequestUser } from "@/lib/dromap/server/supabase-rest";
import { grantDromapPublicationEntitlementFromCheckout } from "@/lib/dromap/server/publications";
import { getDromapStripeClient } from "@/lib/dromap/server/stripe";

export const runtime = "nodejs";

async function handlePOST(request: Request) {
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const stripe = getDromapStripeClient();
  if (!stripe) return NextResponse.json({ error: "Stripe n’est pas configuré." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { sessionId?: unknown } | null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
  if (!sessionId.startsWith("cs_")) {
    return NextResponse.json({ error: "Session Stripe invalide." }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });
    if (session.metadata?.dromap_user_id !== auth.user.id) {
      return NextResponse.json({ error: "Cette session de paiement ne correspond pas à ce compte." }, { status: 403 });
    }

    if (session.mode === "payment") {
      if (session.payment_status !== "paid") {
        return NextResponse.json({ ok: false, pending: true });
      }
      if (session.metadata?.dromap_purchase_kind === "public-map") {
        const granted = await grantDromapPublicationEntitlementFromCheckout(session);
        return NextResponse.json({
          ok: granted,
          kind: "public-map",
          slug: session.metadata?.dromap_publication_slug ?? null,
        });
      }
      await grantDromapSingleMapMaxExportFromCheckout(session);
      return NextResponse.json({
        ok: true,
        kind: "single-map",
        projectId: session.metadata?.dromap_project_id ?? null,
      });
    }

    if (session.mode === "subscription") {
      let subscription: Stripe.Subscription | null = null;
      if (session.subscription && typeof session.subscription !== "string") {
        subscription = session.subscription;
      } else if (typeof session.subscription === "string") {
        subscription = await stripe.subscriptions.retrieve(session.subscription);
      }
      if (!subscription) return NextResponse.json({ ok: false, pending: true });
      await syncDromapSubscriptionFromStripe(subscription);
      return NextResponse.json({
        ok: true,
        kind: "subscription",
        plan: session.metadata?.dromap_plan ?? null,
      });
    }

    return NextResponse.json({ ok: false, pending: true });
  } catch (error) {
    console.error("DroMap Stripe confirm:", error);
    return NextResponse.json({ error: "Vérification du paiement impossible." }, { status: 503 });
  }
}

export const POST = withRequestSecurity(handlePOST);
