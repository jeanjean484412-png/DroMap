"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { DromapProductBootstrap } from "./product-bootstrap";
import { DromapProductShell } from "./product-shell";
import {
  confirmDromapCheckout,
  createDromapSingleMapCheckout,
  createDromapSubscriptionCheckout,
} from "@/lib/dromap/billing";
import { useDromapProductStore } from "@/stores/dromap-product";
import {
  DROMAP_PLAN_DEFINITIONS,
  getDromapAccountPlanLabel,
  type DromapPlanDefinition,
} from "@/lib/dromap/plans";

function formatEuro(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function planHighlightsList(plan: DromapPlanDefinition) {
  return (
    <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-600">
      {plan.highlights.map((highlight) => (
        <li key={highlight} className="flex gap-2">
          <span aria-hidden="true" className="text-slate-300">—</span>
          <span>{highlight}</span>
        </li>
      ))}
    </ul>
  );
}

function PricingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userMode = useDromapProductStore((state) => state.userMode);
  const accountPlan = useDromapProductStore((state) => state.accountPlan);
  const singleMapMaxExportProjectIds = useDromapProductStore(
    (state) => state.singleMapMaxExportProjectIds,
  );
  const refreshAccountSession = useDromapProductStore(
    (state) => state.refreshAccountSession,
  );
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirmedSessionRef = useRef<string | null>(null);

  const purchaseIntent = searchParams.get("purchase");
  const planIntent = searchParams.get("plan");
  const projectId = searchParams.get("projectId");
  const repurchaseIntent = searchParams.get("repurchase") === "1";
  const checkoutState = searchParams.get("checkout");
  const sessionId = searchParams.get("session_id");
  const singleMapIntent = purchaseIntent === "single-map";
  const premiumPlan =
    accountPlan === "plus" || accountPlan === "pro" || accountPlan === "tester";
  const singleMapAlreadyPurchased = Boolean(
    projectId && singleMapMaxExportProjectIds.includes(projectId),
  );
  const singleMapAlreadyIncluded =
    premiumPlan || (singleMapAlreadyPurchased && !repurchaseIntent);

  const plansById = useMemo(
    () => new Map(DROMAP_PLAN_DEFINITIONS.map((plan) => [plan.id, plan])),
    [],
  );
  const guestPlan = plansById.get("guest")!;
  const freePlan = plansById.get("free")!;
  const plusPlan = plansById.get("plus")!;
  const proPlan = plansById.get("pro")!;
  const singleMapPlan = plansById.get("single-map")!;

  const pricingReturnPath = useMemo(() => {
    const params = new URLSearchParams();
    if (purchaseIntent) params.set("purchase", purchaseIntent);
    if (planIntent) params.set("plan", planIntent);
    if (projectId) params.set("projectId", projectId);
    if (repurchaseIntent) params.set("repurchase", "1");
    const query = params.toString();
    return query ? `/pricing?${query}` : "/pricing";
  }, [planIntent, projectId, purchaseIntent, repurchaseIntent]);

  useEffect(() => {
    if (checkoutState === "cancelled") {
      setMessage("Paiement annulé. Aucun changement n’a été appliqué.");
    }
  }, [checkoutState]);

  useEffect(() => {
    if (
      checkoutState !== "success" ||
      !sessionId ||
      userMode !== "authenticated" ||
      confirmedSessionRef.current === sessionId
    ) {
      return;
    }
    confirmedSessionRef.current = sessionId;
    setWorkingId("confirm");
    setError(null);
    setMessage("Vérification du paiement…");

    void (async () => {
      const result = await confirmDromapCheckout(sessionId);
      if (!result.ok) {
        setWorkingId(null);
        setMessage(null);
        setError(result.error ?? "Le paiement n’a pas encore pu être confirmé.");
        return;
      }
      await refreshAccountSession();
      setWorkingId(null);
      if (result.data?.kind === "single-map" && projectId) {
        setMessage("Export Max débloqué pour cette carte.");
        router.replace(`/projects/${encodeURIComponent(projectId)}/render`);
        return;
      }
      setMessage("Abonnement activé. Tes nouveaux droits sont disponibles.");
      router.replace(pricingReturnPath, { scroll: false });
    })();
  }, [checkoutState, pricingReturnPath, refreshAccountSession, router, sessionId, userMode, projectId]);

  async function startSubscription(plan: "plus" | "pro") {
    if (userMode !== "authenticated") {
      const returnTo = `/pricing?plan=${plan}`;
      router.push(`/signup?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    setWorkingId(`${plan}-${interval}`);
    setError(null);
    setMessage(null);
    const result = await createDromapSubscriptionCheckout(plan, interval);
    if (!result.ok || !result.data?.url) {
      setWorkingId(null);
      setError(result.error ?? "Impossible d’ouvrir le paiement Stripe.");
      return;
    }
    window.location.assign(result.data.url);
  }

  async function startSingleMapPurchase() {
    if (!projectId) {
      setError(null);
      if (userMode !== "authenticated") {
        router.push(
          `/signup?returnTo=${encodeURIComponent("/dashboard?selectFor=single-map")}`,
        );
        return;
      }
      router.push("/dashboard?selectFor=single-map");
      return;
    }
    if (userMode !== "authenticated") {
      const returnTo = `/pricing?purchase=single-map&projectId=${encodeURIComponent(projectId)}${repurchaseIntent ? "&repurchase=1" : ""}`;
      router.push(`/signup?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    if (singleMapAlreadyPurchased && !repurchaseIntent) {
      setMessage("L’Export Max est déjà débloqué pour cette carte.");
      return;
    }
    setWorkingId("single-map");
    setError(null);
    setMessage(null);
    const result = await createDromapSingleMapCheckout(projectId, {
      repurchase: repurchaseIntent,
    });
    if (!result.ok || !result.data?.url) {
      setWorkingId(null);
      setError(result.error ?? "Impossible d’ouvrir le paiement Stripe.");
      return;
    }
    window.location.assign(result.data.url);
  }

  function recurringPrice(plan: DromapPlanDefinition) {
    if (plan.monthlyPriceEur === null || plan.monthlyPriceEur <= 0) return null;
    return interval === "year" ? plan.yearlyPriceEur : plan.monthlyPriceEur;
  }

  function subscriptionHighlighted(planId: "plus" | "pro") {
    return planIntent === planId || (!planIntent && planId === "plus");
  }

  function renderCurrentPlanState(planId: DromapPlanDefinition["id"]) {
    if (planId === "guest") {
      if (userMode === "guest") {
        return (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-black text-emerald-800">
            Mode actuel
          </div>
        );
      }
      return null;
    }

    if (planId === "free") {
      if (userMode === "authenticated" && accountPlan === "free") {
        return (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-black text-emerald-800">
            Formule actuelle
          </div>
        );
      }
      return null;
    }

    if ((planId === "plus" || planId === "pro") && userMode === "authenticated" && accountPlan === planId) {
      return (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-black text-emerald-800">
          Formule actuelle
        </div>
      );
    }

    if (planId === "single-map" && userMode === "authenticated" && singleMapAlreadyIncluded) {
      return (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-black text-emerald-800">
          {premiumPlan ? "Inclus dans la formule actuelle" : "Déjà débloqué"}
        </div>
      );
    }

    return null;
  }

  const plusPrice = recurringPrice(plusPlan);
  const proPrice = recurringPrice(proPlan);

  const comparisonRows = [
    {
      label: "Exports",
      plus: "Formats avancés et haute qualité.",
      pro: "Identiques à Plus.",
    },
    {
      label: "Édition avancée",
      plus: "Marqueurs personnalisés, bibliothèques, légende avancée et export de données.",
      pro: "Toutes les fonctions de Plus.",
    },
    {
      label: "Assistant et données",
      plus: "Assistant IA, import des bâtiments et fonctions premium associées.",
      pro: "Identiques à Plus avec quotas plus élevés.",
    },
    {
      label: "Bibliothèque publique",
      plus: "Publication et téléchargement des cartes publiques.",
      pro: "Publication et téléchargement des cartes publiques.",
    },
    {
      label: "Usage intensif",
      plus: "Adapté à un usage régulier.",
      pro: "Quotas renforcés et priorité sur les fonctions professionnelles futures.",
    },
  ] as const;

  return (
    <DromapProductShell
      title="Formules"
      description="Choisissez un accès gratuit, un abonnement, ou débloquez Export Max sur une seule carte."
    >
      <div className="mx-auto max-w-7xl space-y-6">
        {singleMapIntent ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-6 text-emerald-950">
            <strong>Export Max pour cette carte.</strong> Le paiement unique débloque les formats visuels, la qualité maximale, le détail du fond et l’affichage des écritures du fond pour ce projet, sans abonnement.
          </div>
        ) : planIntent === "plus" || planIntent === "pro" ? (
          <div className="rounded-2xl border border-[#cfe7e3] bg-[#eef9f7] px-5 py-4 text-sm leading-6 text-[#123a59]">
            <strong>Abonnement DroMap.</strong> Comparez Plus et Pro pour choisir la formule adaptée au rythme de production.
          </div>
        ) : null}

        {userMode === "authenticated" && accountPlan === "tester" ? (
          <div className="rounded-2xl border border-[#cfe7e3] bg-[#eef9f7] px-5 py-4 text-sm leading-6 text-[#123a59]">
            <strong>Accès de test actif.</strong> Le compte actuel conserve toutes les fonctions tant qu’aucune formule Stripe ne l’a remplacé.
          </div>
        ) : null}

        {message ? (
          <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-900">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-900">
            {error}
          </div>
        ) : null}

        <div className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-600 shadow-sm">
          Le paiement est finalisé sur la page sécurisée de Stripe. Les <Link href="/conditions-generales" target="_blank" className="font-bold text-[#123a59] hover:underline">conditions générales applicables à la commande</Link> y sont présentées et leur acceptation est demandée juste avant le paiement.
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="max-w-3xl">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-[#2b8e88]">Accès gratuit</div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Essayer DroMap, puis créer un compte si nécessaire.</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Le parcours gratuit est séparé entre l’essai sans compte et le compte gratuit, pour distinguer clairement l’usage temporaire et la sauvegarde en ligne.
            </p>
          </div>

          <div className={`mt-8 grid gap-4 ${userMode === "authenticated" ? "lg:grid-cols-1" : "lg:grid-cols-2"}`}>
            {userMode !== "authenticated" ? (
              <article className="rounded-[1.5rem] border border-slate-200 bg-[#fbfcfb] p-5">
                <div className="text-sm font-black text-slate-950">{guestPlan.name}</div>
                <p className="mt-1 text-sm leading-6 text-slate-600">{guestPlan.shortDescription}</p>
                <div className="mt-5 text-3xl font-black text-slate-950">Gratuit</div>
                {planHighlightsList(guestPlan)}
                <div className="mt-6">
                  {renderCurrentPlanState("guest") ?? (
                    <Link
                      href="/dashboard"
                      className="flex min-h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50"
                    >
                      Continuer sans compte
                    </Link>
                  )}
                </div>
              </article>
            ) : null}

            <article className="rounded-[1.5rem] border border-slate-200 bg-[#fbfcfb] p-5">
              <div className="text-sm font-black text-slate-950">{freePlan.name}</div>
              <p className="mt-1 text-sm leading-6 text-slate-600">{freePlan.shortDescription}</p>
              <div className="mt-5 text-3xl font-black text-slate-950">Gratuit</div>
              {planHighlightsList(freePlan)}
              <div className="mt-6">
                {renderCurrentPlanState("free") ?? (
                  userMode === "guest" ? (
                    <Link
                      href="/signup"
                      className="flex min-h-11 items-center justify-center rounded-full bg-[#123a59] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f304a]"
                    >
                      Créer un compte gratuit
                    </Link>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-500">
                      Incluse avec le compte
                    </div>
                  )
                )}
              </div>
            </article>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[#2b8e88]">Abonnements</div>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Plus et Pro pour les usages premium.</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Les abonnements sont comparés ensemble. Pro inclut la base fonctionnelle de Plus, avec des capacités renforcées pour un usage intensif.
              </p>
            </div>

            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setInterval("month")}
                className={[
                  "rounded-full px-4 py-2 text-sm font-black transition",
                  interval === "month" ? "bg-[#123a59] text-white" : "text-slate-600 hover:bg-white",
                ].join(" ")}
              >
                Mensuel
              </button>
              <button
                type="button"
                onClick={() => setInterval("year")}
                className={[
                  "rounded-full px-4 py-2 text-sm font-black transition",
                  interval === "year" ? "bg-[#123a59] text-white" : "text-slate-600 hover:bg-white",
                ].join(" ")}
              >
                Annuel
              </button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            {[plusPlan, proPlan].map((plan) => {
              const price = recurringPrice(plan);
              const highlighted = subscriptionHighlighted(plan.id as "plus" | "pro");
              const currentState = renderCurrentPlanState(plan.id);
              return (
                <article
                  key={plan.id}
                  className={[
                    "rounded-[1.5rem] border p-5",
                    highlighted ? "border-[#cfe7e3] bg-[#f7fcfb]" : "border-slate-200 bg-[#fbfcfb]",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-black text-slate-950">{plan.name}</div>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{plan.shortDescription}</p>
                    </div>
                    {highlighted ? (
                      <span className="rounded-full border border-[#cfe7e3] bg-[#eef9f7] px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-[#123a59]">
                        Recommandé
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-5">
                    {price !== null ? (
                      <div>
                        <span className="text-4xl font-black tracking-tight text-slate-950">{formatEuro(price)}</span>
                        <span className="ml-2 text-sm font-semibold text-slate-500">/ {interval === "year" ? "an" : "mois"}</span>
                      </div>
                    ) : null}
                  </div>

                  {planHighlightsList(plan)}

                  <div className="mt-6">
                    {currentState ?? (
                      <button
                        type="button"
                        disabled={workingId !== null}
                        onClick={() => void startSubscription(plan.id as "plus" | "pro")}
                        className="flex min-h-11 w-full items-center justify-center rounded-full bg-[#123a59] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f304a] disabled:cursor-wait disabled:opacity-60"
                      >
                        {workingId === `${plan.id}-${interval}` ? "Ouverture de Stripe…" : `Choisir ${plan.name}`}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-8 overflow-x-auto rounded-[1.5rem] border border-slate-200">
            <table className="min-w-[44rem] border-collapse bg-white text-sm">
              <thead className="bg-[#fbfcfb]">
                <tr>
                  <th className="border-b border-slate-200 px-4 py-3 text-left font-black text-slate-950">Comparaison</th>
                  <th className="border-b border-slate-200 px-4 py-3 text-left font-black text-slate-950">Plus {plusPrice !== null ? `· ${formatEuro(plusPrice)} / ${interval === "year" ? "an" : "mois"}` : ""}</th>
                  <th className="border-b border-slate-200 px-4 py-3 text-left font-black text-slate-950">Pro {proPrice !== null ? `· ${formatEuro(proPrice)} / ${interval === "year" ? "an" : "mois"}` : ""}</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.label} className="align-top even:bg-[#fcfdfd]">
                    <th className="border-b border-slate-200 px-4 py-4 text-left font-semibold text-slate-900">{row.label}</th>
                    <td className="border-b border-slate-200 px-4 py-4 leading-6 text-slate-600">{row.plus}</td>
                    <td className="border-b border-slate-200 px-4 py-4 leading-6 text-slate-600">{row.pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_14rem] lg:items-start">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[#2b8e88]">Achat ponctuel</div>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Export Max à l’unité.</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Cette option est séparée des abonnements car il ne s’agit pas d’une formule récurrente : elle débloque la qualité maximale sur une seule carte.
              </p>
              {planHighlightsList(singleMapPlan)}
            </div>

            <article className={`rounded-[1.5rem] border p-5 ${singleMapIntent ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-[#fbfcfb]"}`}>
              <div className="text-sm font-black text-slate-950">{singleMapPlan.name}</div>
              <p className="mt-1 text-sm leading-6 text-slate-600">{singleMapPlan.shortDescription}</p>
              <div className="mt-5">
                <span className="text-4xl font-black tracking-tight text-slate-950">{formatEuro(singleMapPlan.oneTimePriceEur ?? 0)}</span>
                <span className="ml-2 text-sm font-semibold text-slate-500">par carte</span>
              </div>
              <div className="mt-6">
                {renderCurrentPlanState("single-map") ?? (
                  <button
                    type="button"
                    disabled={workingId !== null}
                    onClick={() => void startSingleMapPurchase()}
                    className="flex min-h-11 w-full items-center justify-center rounded-full bg-[#123a59] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f304a] disabled:cursor-wait disabled:opacity-60"
                  >
                    {workingId === "single-map"
                      ? "Ouverture de Stripe…"
                      : repurchaseIntent
                        ? "Racheter cette carte — 3 €"
                        : projectId
                          ? "Acheter cette carte — 3 €"
                          : "Choisir une carte à débloquer"}
                  </button>
                )}
              </div>
            </article>
          </div>
        </section>

        {userMode === "authenticated" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs leading-5 text-slate-500">
            <span>Formule actuelle : {getDromapAccountPlanLabel(accountPlan)}.</span>
            <span>Paiement sécurisé sur la page hébergée par Stripe.</span>
          </div>
        ) : null}
      </div>
    </DromapProductShell>
  );
}

export function DromapPricingClient() {
  return (
    <DromapProductBootstrap>
      <PricingContent />
    </DromapProductBootstrap>
  );
}
