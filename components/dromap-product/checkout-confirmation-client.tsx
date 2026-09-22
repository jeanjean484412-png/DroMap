"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { confirmDromapCheckout, type DromapCheckoutConfirmation } from "@/lib/dromap/billing";
import { useDromapProductStore } from "@/stores/dromap-product";
import { DromapLogoMark } from "./dromap-brand";

type ConfirmationState =
  | { status: "checking" }
  | { status: "missing" }
  | { status: "auth"; sessionId: string }
  | { status: "pending"; sessionId: string }
  | { status: "error"; message: string }
  | {
      status: "success";
      data: DromapCheckoutConfirmation;
      accountSessionRefreshed: boolean;
    };

async function refreshConfirmedCheckoutAccess() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (await useDromapProductStore.getState().refreshAccountSession()) {
        return true;
      }
    } catch (error) {
      console.error("Impossible de recharger immédiatement les droits DroMap.", error);
    }

    if (attempt < 2) {
      await new Promise((resolve) => window.setTimeout(resolve, 200 * (attempt + 1)));
    }
  }

  return false;
}

function destinationFor(data: DromapCheckoutConfirmation) {
  if (data.kind === "single-map" && data.projectId) {
    return {
      href: `/projects/${encodeURIComponent(data.projectId)}/render`,
      label: "Ouvrir le rendu final",
      secondaryHref: "/dashboard",
      secondaryLabel: "Mes projets",
      message: "Export Max est débloqué pour cette carte.",
    };
  }
  if (data.kind === "public-map" && data.slug) {
    return {
      href: `/library/${encodeURIComponent(data.slug)}`,
      label: "Ouvrir la carte",
      secondaryHref: "/library",
      secondaryLabel: "Cartes publiques",
      message: "Les droits autorisés par le créateur sont débloqués sur le compte.",
    };
  }
  return {
    href: "/account",
    label: "Voir le compte",
    secondaryHref: "/dashboard",
    secondaryLabel: "Mes projets",
    message: "Abonnement activé. Les nouveaux droits DroMap sont disponibles.",
  };
}

export function DromapCheckoutConfirmationClient() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id")?.trim() ?? "";
  const [state, setState] = useState<ConfirmationState>(
    sessionId ? { status: "checking" } : { status: "missing" },
  );
  const confirmedSessionRef = useRef<string | null>(null);

  const verify = useCallback(async () => {
    if (!sessionId || !sessionId.startsWith("cs_")) {
      setState({ status: "missing" });
      return;
    }

    setState({ status: "checking" });
    const result = await confirmDromapCheckout(sessionId);

    if (!result.ok) {
      if (result.status === 401) {
        setState({ status: "auth", sessionId });
        return;
      }
      setState({ status: "error", message: result.error ?? "La vérification du paiement a échoué." });
      return;
    }

    const data = result.data;
    if (data?.pending || data?.ok === false) {
      setState({ status: "pending", sessionId });
      return;
    }
    if (!data?.ok || !data.kind) {
      setState({ status: "error", message: "Le paiement n’a pas pu être confirmé." });
      return;
    }

    const accountSessionRefreshed = await refreshConfirmedCheckoutAccess();
    setState({ status: "success", data, accountSessionRefreshed });
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || confirmedSessionRef.current === sessionId) return;
    confirmedSessionRef.current = sessionId;
    void verify();
  }, [sessionId, verify]);

  const destination = useMemo(
    () => (state.status === "success" ? destinationFor(state.data) : null),
    [state],
  );

  const loginReturnTo = sessionId
    ? `/confirmation?session_id=${encodeURIComponent(sessionId)}`
    : "/confirmation";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f9f8] px-6 py-12">
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white px-7 py-8 text-center shadow-sm sm:px-10 sm:py-10">
        <Link href="/" aria-label="Accueil DroMap" className="inline-flex items-center justify-center gap-3">
          <span className="grid h-14 w-14 place-items-center rounded-xl border border-[#b9ddd7] bg-[#e9f6f3]">
            <DromapLogoMark className="h-11 w-11 object-contain" />
          </span>
          <span className="text-2xl font-bold tracking-tight text-[#123a59]">DroMap</span>
        </Link>

        {state.status === "checking" ? (
          <>
            <div className="mx-auto mt-9 h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-[#2b8e88]" aria-hidden="true" />
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-950">Vérification du paiement</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              La confirmation Stripe est en cours. Les droits ne sont activés qu’après vérification du paiement.
            </p>
          </>
        ) : null}

        {state.status === "success" && destination ? (
          <>
            <div className="mx-auto mt-9 grid h-12 w-12 place-items-center rounded-full bg-[#eef9f7] text-[#2b8e88]" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12 4 4L19 6" />
              </svg>
            </div>
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-950">Paiement confirmé</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">{destination.message}</p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href={destination.href}
                onClick={(event) => {
                  if (state.accountSessionRefreshed) return;
                  event.preventDefault();
                  window.location.assign(destination.href);
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#123a59] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f314b]"
              >
                {destination.label}
              </Link>
              <Link
                href={destination.secondaryHref}
                onClick={(event) => {
                  if (state.accountSessionRefreshed) return;
                  event.preventDefault();
                  window.location.assign(destination.secondaryHref);
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-[#2b8e88] hover:text-[#123a59]"
              >
                {destination.secondaryLabel}
              </Link>
            </div>
          </>
        ) : null}

        {state.status === "pending" ? (
          <>
            <h1 className="mt-9 text-2xl font-bold tracking-tight text-slate-950">Activation en cours</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Le paiement a été reçu mais Stripe n’a pas encore confirmé son état final. Aucun droit n’est accordé tant que la vérification n’est pas terminée.
            </p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => void verify()}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#123a59] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f314b]"
              >
                Réessayer la vérification
              </button>
              <Link href="/" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-[#2b8e88] hover:text-[#123a59]">
                Retour à DroMap
              </Link>
            </div>
          </>
        ) : null}

        {state.status === "auth" ? (
          <>
            <h1 className="mt-9 text-2xl font-bold tracking-tight text-slate-950">Connexion requise</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              La session DroMap doit correspondre au compte ayant effectué le paiement avant d’activer les droits.
            </p>
            <div className="mt-7">
              <Link
                href={`/login?returnTo=${encodeURIComponent(loginReturnTo)}`}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#123a59] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f314b]"
              >
                Se connecter
              </Link>
            </div>
          </>
        ) : null}

        {state.status === "missing" ? (
          <>
            <h1 className="mt-9 text-2xl font-bold tracking-tight text-slate-950">Confirmation indisponible</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Aucune session de paiement valide n’est associée à cette adresse.
            </p>
            <div className="mt-7">
              <Link href="/" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#123a59] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f314b]">
                Retour à DroMap
              </Link>
            </div>
          </>
        ) : null}

        {state.status === "error" ? (
          <>
            <h1 className="mt-9 text-2xl font-bold tracking-tight text-slate-950">Vérification impossible</h1>
            <p className="mt-3 text-sm leading-6 text-red-700" role="alert">{state.message}</p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => void verify()}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#123a59] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f314b]"
              >
                Réessayer
              </button>
              <Link href="/help" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-[#2b8e88] hover:text-[#123a59]">
                Centre d’aide
              </Link>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
