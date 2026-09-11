import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { NextResponse } from "next/server";

import { DROMAP_TERMS_VERSION } from "@/lib/dromap/legal-public";

import {
  ensureDromapBillingAccount,
  getDromapBillingStatusForUser,
  setDromapStripeCustomerId,
  userOwnsDromapProject,
} from "@/lib/dromap/server/billing";
import { getAuthenticatedRequestUser } from "@/lib/dromap/server/supabase-rest";
import { readPublicationBySlug, readPublicationEntitlement } from "@/lib/dromap/server/publications";
import { dromapPublicationModeAllowsExport, normalizeDromapPublicationAccessMode } from "@/lib/dromap/publications";
import {
  getDromapStripeClient,
  getDromapStripeSingleMapPriceId,
  getDromapStripeSubscriptionPriceId,
  isDromapStripeAutomaticTaxEnabled,
  isDromapStripeConfigured,
  type DromapStripeBillingInterval,
  type DromapStripeSubscriptionPlan,
} from "@/lib/dromap/server/stripe";

export const runtime = "nodejs";

type CheckoutBody =
  | {
      kind?: unknown;
      projectId?: unknown;
      repurchase?: unknown;
      termsVersion?: unknown;
    }
  | {
      kind?: unknown;
      slug?: unknown;
      termsVersion?: unknown;
    }
  | {
      kind?: unknown;
      plan?: unknown;
      interval?: unknown;
      termsVersion?: unknown;
    };

function isPlan(value: unknown): value is DromapStripeSubscriptionPlan {
  return value === "plus" || value === "pro";
}

function isInterval(value: unknown): value is DromapStripeBillingInterval {
  return value === "month" || value === "year";
}

function safeProjectId(value: unknown) {
  if (typeof value !== "string") return null;
  const projectId = value.trim();
  return projectId && projectId.length <= 180 ? projectId : null;
}

async function getOrCreateCustomer(
  userId: string,
  email: string,
  displayName: string,
) {
  const stripe = getDromapStripeClient();
  if (!stripe) throw new Error("STRIPE_NOT_CONFIGURED");
  const billing = await ensureDromapBillingAccount(userId);
  if (billing.stripeCustomerId) return billing.stripeCustomerId;

  const customer = await stripe.customers.create({
    email: email || undefined,
    name: displayName || undefined,
    metadata: { dromap_user_id: userId },
  });
  await setDromapStripeCustomerId(userId, customer.id);
  return customer.id;
}

async function handlePOST(request: Request) {
  if (!isDromapStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe n’est pas encore configuré sur ce serveur." },
      { status: 503 },
    );
  }

  const auth = await getAuthenticatedRequestUser();
  if (!auth) {
    return NextResponse.json({ error: "Crée ou connecte ton compte avant de payer." }, { status: 401 });
  }

  const stripe = getDromapStripeClient();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe est momentanément indisponible." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as CheckoutBody | null;
  const kind = body && typeof body.kind === "string" ? body.kind : "";
  const origin = new URL(request.url).origin;
  const displayName =
    typeof auth.user.user_metadata?.display_name === "string"
      ? auth.user.user_metadata.display_name.trim()
      : "";

  try {
    const customerId = await getOrCreateCustomer(
      auth.user.id,
      auth.user.email?.trim() ?? "",
      displayName,
    );
    const automaticTax = isDromapStripeAutomaticTaxEnabled();

    if (kind === "single-map") {
      const projectId = safeProjectId((body as { projectId?: unknown })?.projectId);
      if (!projectId) {
        return NextResponse.json({ error: "Projet manquant pour cet achat." }, { status: 400 });
      }

      const ownsProject = await userOwnsDromapProject(auth.user.id, projectId);
      if (!ownsProject) {
        return NextResponse.json(
          {
            error:
              "Ce projet n’est pas encore enregistré en ligne. Reviens dans l’éditeur, enregistre-le puis réessaie.",
          },
          { status: 409 },
        );
      }

      const repurchase =
        (body as { repurchase?: unknown })?.repurchase === true;
      const billing = await getDromapBillingStatusForUser(auth.user.id);
      if (billing.plan === "plus" || billing.plan === "pro" || billing.plan === "tester") {
        return NextResponse.json(
          { error: "La qualité maximale est déjà incluse dans ta formule actuelle." },
          { status: 409 },
        );
      }
      if (billing.singleMapMaxExportProjectIds.includes(projectId) && !repurchase) {
        return NextResponse.json(
          { error: "L’Export Max est déjà débloqué pour cette carte." },
          { status: 409 },
        );
      }

      const priceId = getDromapStripeSingleMapPriceId();
      if (!priceId) {
        return NextResponse.json({ error: "Le prix Export Max n’est pas configuré." }, { status: 503 });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: customerId,
        client_reference_id: auth.user.id,
        line_items: [{ price: priceId, quantity: 1 }],
        automatic_tax: { enabled: automaticTax },
        customer_update: automaticTax ? { address: "auto" } : undefined,
        consent_collection: { terms_of_service: "required" },
        metadata: {
          dromap_user_id: auth.user.id,
          dromap_purchase_kind: "single-map",
          dromap_project_id: projectId,
          dromap_repurchase: repurchase ? "true" : "false",
          dromap_terms_version: DROMAP_TERMS_VERSION,
        },
        payment_intent_data: {
          metadata: {
            dromap_user_id: auth.user.id,
            dromap_purchase_kind: "single-map",
            dromap_project_id: projectId,
            dromap_repurchase: repurchase ? "true" : "false",
            dromap_terms_version: DROMAP_TERMS_VERSION,
          },
        },
        success_url: `${origin}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/pricing?checkout=cancelled&purchase=single-map&projectId=${encodeURIComponent(projectId)}${repurchase ? "&repurchase=1" : ""}`,
      });

      if (!session.url) throw new Error("STRIPE_CHECKOUT_URL_MISSING");
      return NextResponse.json({ url: session.url });
    }


    if (kind === "public-map") {
      const slugRaw = (body as { slug?: unknown })?.slug;
      const slug = typeof slugRaw === "string" ? slugRaw.trim().slice(0, 160) : "";
      if (!slug) {
        return NextResponse.json({ error: "Carte publique manquante pour cet achat." }, { status: 400 });
      }
      const publication = await readPublicationBySlug(slug);
      if (!publication) {
        return NextResponse.json({ error: "Cette carte publique n’est plus disponible." }, { status: 404 });
      }
      const accessMode = normalizeDromapPublicationAccessMode(publication.access_mode);
      if (!dromapPublicationModeAllowsExport(accessMode)) {
        return NextResponse.json({ error: "Le créateur n’autorise pas l’achat de droits d’export pour cette carte." }, { status: 403 });
      }
      const billing = await getDromapBillingStatusForUser(auth.user.id);
      if (billing.plan === "plus" || billing.plan === "pro" || billing.plan === "tester") {
        return NextResponse.json({ error: "Ton abonnement donne déjà accès aux droits autorisés par le créateur." }, { status: 409 });
      }
      const existingEntitlement = await readPublicationEntitlement(auth.user.id, slug);
      if (existingEntitlement) {
        return NextResponse.json({ error: "Cette carte est déjà achetée sur ton compte." }, { status: 409 });
      }
      const priceId = getDromapStripeSingleMapPriceId();
      if (!priceId) {
        return NextResponse.json({ error: "Le prix d’achat à l’unité n’est pas configuré." }, { status: 503 });
      }
      const metadata = {
        dromap_user_id: auth.user.id,
        dromap_purchase_kind: "public-map",
        dromap_publication_slug: slug,
        dromap_terms_version: DROMAP_TERMS_VERSION,
      };
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: customerId,
        client_reference_id: auth.user.id,
        line_items: [{ price: priceId, quantity: 1 }],
        automatic_tax: { enabled: automaticTax },
        customer_update: automaticTax ? { address: "auto" } : undefined,
        consent_collection: { terms_of_service: "required" },
        metadata,
        payment_intent_data: { metadata },
        success_url: `${origin}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/library/${encodeURIComponent(slug)}?checkout=cancelled`,
      });
      if (!session.url) throw new Error("STRIPE_CHECKOUT_URL_MISSING");
      return NextResponse.json({ url: session.url });
    }

    if (kind === "subscription") {
      const plan = (body as { plan?: unknown })?.plan;
      const interval = (body as { interval?: unknown })?.interval;
      if (!isPlan(plan) || !isInterval(interval)) {
        return NextResponse.json({ error: "Formule ou période invalide." }, { status: 400 });
      }

      const billing = await getDromapBillingStatusForUser(auth.user.id);
      if (
        billing.stripeSubscriptionId &&
        (billing.subscriptionStatus === "active" ||
          billing.subscriptionStatus === "trialing" ||
          billing.subscriptionStatus === "past_due")
      ) {
        return NextResponse.json(
          {
            error:
              "Un abonnement Stripe est déjà actif sur ce compte. Utilise « Gérer mon abonnement » pour le modifier.",
          },
          { status: 409 },
        );
      }

      const priceId = getDromapStripeSubscriptionPriceId(plan, interval);
      if (!priceId) {
        return NextResponse.json({ error: "Ce prix d’abonnement n’est pas configuré." }, { status: 503 });
      }

      const metadata = {
        dromap_user_id: auth.user.id,
        dromap_purchase_kind: "subscription",
        dromap_plan: plan,
        dromap_interval: interval,
        dromap_terms_version: DROMAP_TERMS_VERSION,
      };
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        client_reference_id: auth.user.id,
        line_items: [{ price: priceId, quantity: 1 }],
        automatic_tax: { enabled: automaticTax },
        customer_update: automaticTax ? { address: "auto" } : undefined,
        consent_collection: { terms_of_service: "required" },
        metadata,
        subscription_data: { metadata },
        success_url: `${origin}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/pricing?checkout=cancelled&plan=${plan}`,
      });

      if (!session.url) throw new Error("STRIPE_CHECKOUT_URL_MISSING");
      return NextResponse.json({ url: session.url });
    }

    return NextResponse.json({ error: "Type d’achat invalide." }, { status: 400 });
  } catch (error) {
    console.error("DroMap Stripe checkout:", error);
    return NextResponse.json(
      { error: "Impossible d’ouvrir le paiement Stripe pour le moment." },
      { status: 503 },
    );
  }
}

export const POST = withRequestSecurity(handlePOST);
