"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getDromapSession, type DromapAccountSession } from "@/lib/dromap/account";

type SessionState =
  | { status: "loading"; account: null }
  | { status: "guest"; account: null }
  | { status: "unavailable"; account: null }
  | { status: "authenticated"; account: DromapAccountSession };

export function DromapHomeAccountActions() {
  const [session, setSession] = useState<SessionState>({ status: "loading", account: null });

  useEffect(() => {
    let cancelled = false;

    void getDromapSession().then((result) => {
      if (cancelled) return;
      if (result.authenticated && result.account) {
        setSession({ status: "authenticated", account: result.account });
      } else if (result.error) {
        // Une panne temporaire de l'API ne prouve pas que l'utilisateur est
        // déconnecté. Garder l'accès au compte évite d'afficher « Connexion »
        // à tort ; les pages privées revérifient toujours la session côté serveur.
        setSession({ status: "unavailable", account: null });
      } else {
        setSession({ status: "guest", account: null });
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (session.status === "loading") {
    return (
      <span
        className="inline-flex min-w-[6.5rem] items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold text-slate-400"
        aria-label="Vérification de la session"
      >
        Compte…
      </span>
    );
  }

  if (session.status === "authenticated" || session.status === "unavailable") {
    const accountLabel = session.status === "authenticated" && session.account.firstName?.trim()
      ? `Mon compte — ${session.account.firstName.trim()}`
      : "Mon compte";

    return (
      <Link
        href="/account"
        aria-label={accountLabel}
        className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
      >
        Mon compte
      </Link>
    );
  }

  return (
    <Link
      href="/login"
      className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
    >
      Connexion
    </Link>
  );
}
