"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const CONSENT_KEY = "dromap-audience-consent-v1";
const CONSENT_DURATION = 180 * 24 * 60 * 60 * 1000;
type Choice = "accepted" | "refused" | null;

function readChoice(): Choice {
  try {
    const value = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "null");
    if (!value || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()) return null;
    return value.choice === "accepted" || value.choice === "refused" ? value.choice : null;
  } catch { return null; }
}

const PRIVATE_PATH_PREFIXES = [
  "/dashboard",
  "/account",
  "/settings",
  "/trash",
  "/projects",
  "/editor",
  "/confirmation",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
] as const;

function isPrivatePath(pathname: string) {
  return PRIVATE_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function DromapWebAnalytics() {
  const sessionRefusal = useRef(false);
  const [choice, setChoice] = useState<Choice>(null);
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    const refresh = () => { setChoice(sessionRefusal.current ? "refused" : readChoice()); setReady(true); };
    const initial = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("storage", refresh);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  function choose(next: Exclude<Choice, null>) {
    let saved = false;
    sessionRefusal.current = next === "refused";
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice: next, expiresAt: Date.now() + CONSENT_DURATION }));
      saved = true;
    } catch {
      // Sans mémorisation du consentement, la mesure reste désactivée.
      sessionRefusal.current = true;
    }
    setChoice(saved ? next : "refused");
    setSettingsOpen(false);
    // Retirer également le script déjà chargé après un retrait de consentement.
    if (saved && choice === "accepted" && next === "refused") window.location.reload();
  }

  return (
    <>
    {ready && choice === "accepted" && <Analytics
      beforeSend={(event: BeforeSendEvent) => {
        if (sessionRefusal.current || readChoice() !== "accepted") return null;
        try {
          const safeUrl = new URL(event.url, window.location.origin);
          const pathname = safeUrl.pathname;

          if (isPrivatePath(pathname)) {
            return null;
          }
          // Ne jamais envoyer une recherche, un jeton ou un paramètre personnel.
          safeUrl.search = "";
          safeUrl.hash = "";
          if (pathname.startsWith("/library/")) safeUrl.pathname = "/library/[carte]";
          return { ...event, url: safeUrl.toString() };
        } catch {
          return null;
        }
      }}
    />}
    {ready && (choice === null || settingsOpen) ? (
      <section aria-label="Préférences de confidentialité" className="fixed bottom-4 left-4 right-4 z-[10000] mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-800 shadow-xl">
        <h2 className="font-semibold">Votre choix pour la mesure d’audience</h2>
        <p className="mt-2 leading-6">Les cookies de connexion et la sauvegarde locale sont nécessaires au service. Acceptez-vous aussi Vercel Analytics pour mesurer la fréquentation des pages publiques ? Ce choix est facultatif et modifiable à tout moment.</p>
        <Link href="/confidentialite#cookies" className="mt-2 inline-block underline">En savoir plus</Link>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={() => choose("refused")} className="rounded-lg border border-slate-400 px-4 py-2 font-semibold">Refuser</button>
          <button type="button" onClick={() => choose("accepted")} className="rounded-lg border border-slate-400 px-4 py-2 font-semibold">Accepter</button>
        </div>
      </section>
    ) : ready ? <button type="button" onClick={() => setSettingsOpen(true)} className="fixed bottom-2 left-2 z-[10000] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm">Confidentialité</button> : null}
    </>
  );
}
