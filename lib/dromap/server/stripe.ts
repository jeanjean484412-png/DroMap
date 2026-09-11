import "server-only";

import Stripe from "stripe";

export type DromapStripeSubscriptionPlan = "plus" | "pro";
export type DromapStripeBillingInterval = "month" | "year";

type DromapStripePriceConfig = {
  plusMonthly: string | null;
  plusYearly: string | null;
  proMonthly: string | null;
  proYearly: string | null;
  singleMap: string | null;
};

let stripeClient: Stripe | null | undefined;

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

export function getDromapStripeSecretKey() {
  return readEnv("STRIPE_SECRET_KEY");
}

export function getDromapStripeWebhookSecret() {
  return readEnv("STRIPE_WEBHOOK_SECRET");
}

export function getDromapStripePriceConfig(): DromapStripePriceConfig {
  return {
    plusMonthly: readEnv("STRIPE_PRICE_PLUS_MONTHLY"),
    plusYearly: readEnv("STRIPE_PRICE_PLUS_YEARLY"),
    proMonthly: readEnv("STRIPE_PRICE_PRO_MONTHLY"),
    proYearly: readEnv("STRIPE_PRICE_PRO_YEARLY"),
    singleMap: readEnv("STRIPE_PRICE_SINGLE_MAP"),
  };
}

export function getDromapStripeClient() {
  if (stripeClient !== undefined) return stripeClient;
  const secretKey = getDromapStripeSecretKey();
  stripeClient = secretKey ? new Stripe(secretKey) : null;
  return stripeClient;
}

export function isDromapStripeConfigured() {
  const prices = getDromapStripePriceConfig();
  return Boolean(
    getDromapStripeSecretKey() &&
      prices.plusMonthly &&
      prices.plusYearly &&
      prices.proMonthly &&
      prices.proYearly &&
      prices.singleMap,
  );
}

export function isDromapStripeTestMode() {
  return getDromapStripeSecretKey()?.startsWith("sk_test_") === true;
}

export function isDromapStripeAutomaticTaxEnabled() {
  const value = process.env.STRIPE_AUTOMATIC_TAX?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function getDromapStripeSubscriptionPriceId(
  plan: DromapStripeSubscriptionPlan,
  interval: DromapStripeBillingInterval,
) {
  const prices = getDromapStripePriceConfig();
  if (plan === "plus") {
    return interval === "year" ? prices.plusYearly : prices.plusMonthly;
  }
  return interval === "year" ? prices.proYearly : prices.proMonthly;
}

export function getDromapStripeSingleMapPriceId() {
  return getDromapStripePriceConfig().singleMap;
}

export function getDromapPlanFromStripePriceId(priceId: string | null | undefined) {
  if (!priceId) return null;
  const prices = getDromapStripePriceConfig();
  if (priceId === prices.plusMonthly || priceId === prices.plusYearly) return "plus" as const;
  if (priceId === prices.proMonthly || priceId === prices.proYearly) return "pro" as const;
  return null;
}

export function getDromapBillingIntervalFromStripePriceId(
  priceId: string | null | undefined,
) {
  if (!priceId) return null;
  const prices = getDromapStripePriceConfig();
  if (priceId === prices.plusMonthly || priceId === prices.proMonthly) return "month" as const;
  if (priceId === prices.plusYearly || priceId === prices.proYearly) return "year" as const;
  return null;
}
