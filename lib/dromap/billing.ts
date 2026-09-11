import type { DromapAccountPlan } from "@/lib/dromap/plans";

export type DromapCheckoutConfirmation = {
  ok?: boolean;
  pending?: boolean;
  kind?: "single-map" | "public-map" | "subscription";
  projectId?: string | null;
  slug?: string | null;
  plan?: "plus" | "pro" | null;
};

export type DromapBillingStatus = {
  configured: boolean;
  testMode: boolean;
  plan: DromapAccountPlan;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  billingInterval: "month" | "year" | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  singleMapMaxExportProjectIds: string[];
  singleMapZoneLockedProjectIds: string[];
  publicMapExportProjectIds: string[];
};

type ApiResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
};

async function readApiJson<T>(response: Response): Promise<ApiResult<T>> {
  let data: T | null = null;
  try {
    data = (await response.json()) as T;
  } catch {
    data = null;
  }
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const error =
    record && typeof record.error === "string"
      ? record.error
      : response.ok
        ? null
        : "L’opération de facturation a échoué.";
  return { ok: response.ok, status: response.status, data, error };
}

export async function getDromapBillingStatus() {
  const response = await fetch("/api/dromap/billing/status", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  return readApiJson<DromapBillingStatus>(response);
}

export async function createDromapSubscriptionCheckout(
  plan: "plus" | "pro",
  interval: "month" | "year",
  _termsVersion?: string,
) {
  const response = await fetch("/api/dromap/billing/checkout", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "subscription", plan, interval }),
  });
  return readApiJson<{ url?: string }>(response);
}

export async function createDromapSingleMapCheckout(
  projectId: string,
  options: { repurchase?: boolean; termsVersion?: string } = {},
) {
  const response = await fetch("/api/dromap/billing/checkout", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "single-map",
      projectId,
      repurchase: options.repurchase === true,
    }),
  });
  return readApiJson<{ url?: string }>(response);
}

export async function createDromapPublicMapCheckout(slug: string, _termsVersion?: string) {
  const response = await fetch("/api/dromap/billing/checkout", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "public-map", slug }),
  });
  return readApiJson<{ url?: string }>(response);
}

export async function confirmDromapCheckout(sessionId: string) {
  const response = await fetch("/api/dromap/billing/checkout/confirm", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  return readApiJson<DromapCheckoutConfirmation>(response);
}

export async function createDromapBillingPortalSession() {
  const response = await fetch("/api/dromap/billing/portal", {
    method: "POST",
    credentials: "same-origin",
  });
  return readApiJson<{ url?: string }>(response);
}

export async function markDromapSingleMapDownloaded(projectId: string) {
  const response = await fetch("/api/dromap/billing/single-map/downloaded", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
  return readApiJson<{ ok?: boolean; alreadyLocked?: boolean }>(response);
}
