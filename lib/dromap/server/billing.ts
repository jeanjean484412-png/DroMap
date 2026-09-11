import "server-only";
import { securityRpc } from "./security-rpc";

import type Stripe from "stripe";

import type { DromapAccountPlan } from "@/lib/dromap/plans";
import {
  getSupabaseAdminKey,
  getSupabaseConfig,
  parseJsonResponse,
  supabaseRestFetch,
} from "@/lib/dromap/server/supabase-rest";
import {
  getDromapBillingIntervalFromStripePriceId,
  getDromapPlanFromStripePriceId,
} from "@/lib/dromap/server/stripe";

type BillingAccountRow = {
  user_id?: unknown;
  plan?: unknown;
  stripe_customer_id?: unknown;
  stripe_subscription_id?: unknown;
  subscription_status?: unknown;
  billing_interval?: unknown;
  current_period_end?: unknown;
  cancel_at_period_end?: unknown;
};

type EntitlementRow = {
  project_id?: unknown;
  first_downloaded_at?: unknown;
  entitlement?: unknown;
};

export type DromapBillingAccessSnapshot = {
  plan: DromapAccountPlan;
  singleMapMaxExportProjectIds: string[];
  singleMapZoneLockedProjectIds: string[];
  publicMapExportProjectIds: string[];
};

export type DromapBillingServerStatus = DromapBillingAccessSnapshot & {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  billingInterval: "month" | "year" | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeBillingInterval(value: unknown) {
  return value === "month" || value === "year" ? value : null;
}

function normalizeBillingPlan(value: unknown): DromapAccountPlan {
  return value === "free" || value === "plus" || value === "pro" || value === "tester"
    ? value
    : "free";
}

function normalizeBillingStatus(row: BillingAccountRow | null): DromapBillingServerStatus {
  return {
    plan: row ? normalizeBillingPlan(row.plan) : "free",
    singleMapMaxExportProjectIds: [],
    singleMapZoneLockedProjectIds: [],
    publicMapExportProjectIds: [],
    stripeCustomerId: cleanString(row?.stripe_customer_id),
    stripeSubscriptionId: cleanString(row?.stripe_subscription_id),
    subscriptionStatus: cleanString(row?.subscription_status),
    billingInterval: normalizeBillingInterval(row?.billing_interval),
    currentPeriodEnd: cleanString(row?.current_period_end),
    cancelAtPeriodEnd: row?.cancel_at_period_end === true,
  };
}

function getAdminHeaders(body = false) {
  const config = getSupabaseConfig();
  const adminKey = getSupabaseAdminKey();
  if (!config || !adminKey) return null;
  const headers = new Headers();
  headers.set("apikey", adminKey);
  if (!adminKey.startsWith("sb_secret_")) {
    headers.set("Authorization", `Bearer ${adminKey}`);
  }
  if (body) headers.set("Content-Type", "application/json");
  return { config, headers };
}

async function adminRestFetch(path: string, init: RequestInit = {}) {
  const setup = getAdminHeaders(Boolean(init.body));
  if (!setup) throw new Error("SUPABASE_ADMIN_NOT_CONFIGURED");
  const headers = new Headers(setup.headers);
  for (const [key, value] of new Headers(init.headers).entries()) headers.set(key, value);
  return fetch(`${setup.config.url}/rest/v1${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export async function getDromapBillingAccessForSession(
  accessToken: string,
  userId: string,
): Promise<DromapBillingAccessSnapshot | null> {
  try {
    const billingResponse = await supabaseRestFetch(
      `/dromap_billing_accounts?user_id=eq.${encodeURIComponent(userId)}&select=plan&limit=1`,
      accessToken,
      { method: "GET" },
    );
    if (!billingResponse.ok) return null;
    const billingRows = await parseJsonResponse<BillingAccountRow[]>(billingResponse);
    const row = billingRows?.[0] ?? null;

    const entitlementResponse = await supabaseRestFetch(
      `/dromap_project_entitlements?owner_id=eq.${encodeURIComponent(userId)}&select=project_id,first_downloaded_at,entitlement`,
      accessToken,
      { method: "GET" },
    );
    const entitlementRows = entitlementResponse.ok
      ? await parseJsonResponse<EntitlementRow[]>(entitlementResponse)
      : [];
    const maxExportRows = (entitlementRows ?? []).filter((item) => item.entitlement === "max-export");
    const publicMapRows = (entitlementRows ?? []).filter((item) => item.entitlement === "public-map-export");

    return {
      plan: row ? normalizeBillingPlan(row.plan) : "free",
      singleMapMaxExportProjectIds: Array.from(
        new Set(
          maxExportRows
            .map((item) => cleanString(item.project_id))
            .filter((value): value is string => Boolean(value)),
        ),
      ),
      singleMapZoneLockedProjectIds: Array.from(
        new Set(
          maxExportRows
            .filter((item) => Boolean(cleanString(item.first_downloaded_at)))
            .map((item) => cleanString(item.project_id))
            .filter((value): value is string => Boolean(value)),
        ),
      ),
      publicMapExportProjectIds: Array.from(
        new Set(
          publicMapRows
            .map((item) => cleanString(item.project_id))
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    };
  } catch {
    return null;
  }
}

export async function getDromapBillingStatusForUser(
  userId: string,
): Promise<DromapBillingServerStatus> {
  const billingResponse = await adminRestFetch(
    `/dromap_billing_accounts?user_id=eq.${encodeURIComponent(userId)}&select=user_id,plan,stripe_customer_id,stripe_subscription_id,subscription_status,billing_interval,current_period_end,cancel_at_period_end&limit=1`,
    { method: "GET" },
  );
  const billingRows = billingResponse.ok
    ? await parseJsonResponse<BillingAccountRow[]>(billingResponse)
    : [];
  const status = normalizeBillingStatus(billingRows?.[0] ?? null);

  const entitlementResponse = await adminRestFetch(
    `/dromap_project_entitlements?owner_id=eq.${encodeURIComponent(userId)}&select=project_id,first_downloaded_at,entitlement`,
    { method: "GET" },
  );
  const entitlementRows = entitlementResponse.ok
    ? await parseJsonResponse<EntitlementRow[]>(entitlementResponse)
    : [];
  const maxExportRows = (entitlementRows ?? []).filter((item) => item.entitlement === "max-export");
  const publicMapRows = (entitlementRows ?? []).filter((item) => item.entitlement === "public-map-export");
  status.singleMapMaxExportProjectIds = Array.from(
    new Set(
      maxExportRows
        .map((item) => cleanString(item.project_id))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  status.singleMapZoneLockedProjectIds = Array.from(
    new Set(
      maxExportRows
        .filter((item) => Boolean(cleanString(item.first_downloaded_at)))
        .map((item) => cleanString(item.project_id))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  status.publicMapExportProjectIds = Array.from(
    new Set(
      publicMapRows
        .map((item) => cleanString(item.project_id))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  return status;
}

export async function ensureDromapBillingAccount(userId: string) {
  const current = await getDromapBillingStatusForUser(userId);
  const existingResponse = await adminRestFetch(
    `/dromap_billing_accounts?user_id=eq.${encodeURIComponent(userId)}&select=user_id&limit=1`,
    { method: "GET" },
  );
  const existing = existingResponse.ok
    ? await parseJsonResponse<Array<{ user_id?: unknown }>>(existingResponse)
    : [];
  if (existing?.[0]) return current;

  const response = await adminRestFetch("/dromap_billing_accounts", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: userId, plan: "free" }),
  });
  if (!response.ok) throw new Error("BILLING_ACCOUNT_CREATE_FAILED");
  return getDromapBillingStatusForUser(userId);
}

export async function setDromapStripeCustomerId(userId: string, customerId: string) {
  await ensureDromapBillingAccount(userId);
  const response = await adminRestFetch(
    `/dromap_billing_accounts?user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!response.ok) throw new Error("BILLING_CUSTOMER_SAVE_FAILED");
}

export async function findDromapUserIdByStripeCustomer(customerId: string) {
  const response = await adminRestFetch(
    `/dromap_billing_accounts?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=user_id&limit=1`,
    { method: "GET" },
  );
  if (!response.ok) return null;
  const rows = await parseJsonResponse<Array<{ user_id?: unknown }>>(response);
  return cleanString(rows?.[0]?.user_id);
}

function getSubscriptionCustomerId(subscription: Stripe.Subscription) {
  return typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id ?? null;
}

function getSubscriptionPeriodEnd(subscription: Stripe.Subscription) {
  const values = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return null;
  return new Date(Math.max(...values) * 1000).toISOString();
}

function subscriptionKeepsPremiumAccess(status: Stripe.Subscription["status"]) {
  return status === "active" || status === "trialing" || status === "past_due";
}

function getSubscriptionScheduledCancelAt(subscription: Stripe.Subscription) {
  if (typeof subscription.cancel_at === "number" && Number.isFinite(subscription.cancel_at)) {
    return new Date(subscription.cancel_at * 1000).toISOString();
  }
  return null;
}

function subscriptionHasScheduledCancellation(subscription: Stripe.Subscription) {
  return subscription.cancel_at_period_end === true || Boolean(getSubscriptionScheduledCancelAt(subscription));
}

export async function syncDromapSubscriptionFromStripe(subscription: Stripe.Subscription) {
  const customerId = getSubscriptionCustomerId(subscription);
  const metadataUserId = cleanString(subscription.metadata?.dromap_user_id);
  const userId = metadataUserId || (customerId ? await findDromapUserIdByStripeCustomer(customerId) : null);
  if (!userId) return false;

  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const metadataPlan =
    subscription.metadata?.dromap_plan === "plus" ||
    subscription.metadata?.dromap_plan === "pro"
      ? subscription.metadata.dromap_plan
      : null;
  const detectedPlan = getDromapPlanFromStripePriceId(priceId) ?? metadataPlan;
  const plan = detectedPlan && subscriptionKeepsPremiumAccess(subscription.status)
    ? detectedPlan
    : "free";
  const metadataInterval =
    subscription.metadata?.dromap_interval === "month" ||
    subscription.metadata?.dromap_interval === "year"
      ? subscription.metadata.dromap_interval
      : null;
  const billingInterval =
    getDromapBillingIntervalFromStripePriceId(priceId) ?? metadataInterval;

  await ensureDromapBillingAccount(userId);
  const response = await adminRestFetch(
    `/dromap_billing_accounts?user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        plan,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        subscription_status: subscription.status,
        billing_interval: billingInterval,
        current_period_end:
          getSubscriptionScheduledCancelAt(subscription) ??
          getSubscriptionPeriodEnd(subscription),
        cancel_at_period_end: subscriptionHasScheduledCancellation(subscription),
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!response.ok) throw new Error("BILLING_SUBSCRIPTION_SAVE_FAILED");
  return true;
}

export async function grantDromapSingleMapMaxExportFromCheckout(
  session: Stripe.Checkout.Session,
) {
  const userId = cleanString(session.metadata?.dromap_user_id);
  const projectId = cleanString(session.metadata?.dromap_project_id);
  if (!userId || !projectId || session.payment_status !== "paid") return false;

  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  if (customerId) await setDromapStripeCustomerId(userId, customerId);

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const granted = await securityRpc("dromap_grant_single_map_checkout", {
    p_owner_id: userId,
    p_project_id: projectId,
    p_checkout_id: session.id,
    p_payment_intent_id: paymentIntentId,
    p_amount_total: session.amount_total ?? null,
    p_currency: session.currency ?? null,
    p_purchased_at: new Date(session.created * 1000).toISOString(),
  });
  if (granted !== true) throw new Error("SINGLE_MAP_ENTITLEMENT_SAVE_FAILED");
  return true;
}

export async function grantDromapPublicMapProjectExport(
  userId: string,
  projectId: string,
) {
  const ownsProject = await userOwnsDromapProject(userId, projectId);
  if (!ownsProject) return false;
  const response = await adminRestFetch(
    "/dromap_project_entitlements?on_conflict=owner_id,project_id,entitlement",
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        owner_id: userId,
        project_id: projectId,
        entitlement: "public-map-export",
        purchased_at: new Date().toISOString(),
        first_downloaded_at: null,
      }),
    },
  );
  if (!response.ok) throw new Error("PUBLIC_MAP_PROJECT_ENTITLEMENT_SAVE_FAILED");
  return true;
}

export async function markDromapSingleMapFirstDownload(
  userId: string,
  projectId: string,
) {
  const ownsProject = await userOwnsDromapProject(userId, projectId);
  if (!ownsProject) return false;

  const lookup = await adminRestFetch(
    `/dromap_project_entitlements?owner_id=eq.${encodeURIComponent(userId)}&project_id=eq.${encodeURIComponent(projectId)}&entitlement=eq.max-export&select=project_id,first_downloaded_at&limit=1`,
    { method: "GET" },
  );
  if (!lookup.ok) return false;
  const rows = await parseJsonResponse<EntitlementRow[]>(lookup);
  const entitlement = rows?.[0] ?? null;
  if (!entitlement || cleanString(entitlement.project_id) !== projectId) return false;
  if (cleanString(entitlement.first_downloaded_at)) return true;

  const response = await adminRestFetch(
    `/dromap_project_entitlements?owner_id=eq.${encodeURIComponent(userId)}&project_id=eq.${encodeURIComponent(projectId)}&entitlement=eq.max-export&first_downloaded_at=is.null`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ first_downloaded_at: new Date().toISOString() }),
    },
  );
  if (!response.ok) throw new Error("SINGLE_MAP_FIRST_DOWNLOAD_SAVE_FAILED");
  return true;
}

export async function userOwnsDromapProject(userId: string, projectId: string) {
  const response = await adminRestFetch(
    `/dromap_projects?owner_id=eq.${encodeURIComponent(userId)}&project_id=eq.${encodeURIComponent(projectId)}&deleted_at=is.null&select=project_id&limit=1`,
    { method: "GET" },
  );
  if (!response.ok) return false;
  const rows = await parseJsonResponse<Array<{ project_id?: unknown }>>(response);
  return cleanString(rows?.[0]?.project_id) === projectId;
}
