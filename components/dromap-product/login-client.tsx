"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { DromapButton } from "@/components/dromap-ui/button";
import { adoptDromapRecoverySession, signInDromapAccount } from "@/lib/dromap/account";
import { useDromapProductStore } from "@/stores/dromap-product";
import { DromapProductBootstrap } from "./product-bootstrap";
import { DromapAuthShell } from "./auth-shell";

import { safeReturnTo } from "@/lib/dromap/safe-return-to";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activateAccount = useDromapProductStore((state) => state.activateAuthenticatedAccount);
  const refreshAccountSession = useDromapProductStore((state) => state.refreshAccountSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(searchParams.get("confirmed") === "1");
  const passwordReset = searchParams.get("reset") === "1";
  const returnTo = safeReturnTo(searchParams.get("returnTo"));

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    if (!accessToken || !refreshToken) return;

    setLoading(true);
    setError(null);
    void adoptDromapRecoverySession(
      accessToken,
      refreshToken,
      Number(hash.get("expires_in") ?? "3600"),
    ).then(async (result) => {
      window.history.replaceState({}, "", window.location.pathname + window.location.search);
      if (!result.ok) {
        setError(result.error ?? "Validation du lien impossible.");
        setLoading(false);
        return;
      }
      const ok = await refreshAccountSession();
      if (ok) router.replace(returnTo);
      else {
        setError("Le compte a été confirmé, mais la session n’a pas pu être ouverte.");
        setLoading(false);
      }
    });
  }, [refreshAccountSession, returnTo, router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await signInDromapAccount(email, password);
    if (!result.ok || !result.data?.account) {
      setError(result.error ?? "Connexion impossible.");
      setLoading(false);
      return;
    }
    await activateAccount(result.data.account);
    router.replace(returnTo);
  }

  return (
    <DromapAuthShell
      title="Se connecter"
      description="Retrouve tes projets DroMap sauvegardés en ligne sur tous tes appareils."
    >
      {passwordReset ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Mot de passe modifié. Tu peux maintenant te connecter.
        </div>
      ) : null}
      {confirmed ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Adresse e-mail confirmée. Tu peux maintenant te connecter.
          <button type="button" className="ml-2 font-bold" onClick={() => setConfirmed(false)}>×</button>
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      ) : null}
      <form className="space-y-4" onSubmit={submit}>
        <label className="block text-sm font-semibold text-slate-800">
          Adresse e-mail
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
          />
        </label>
        <label className="block text-sm font-semibold text-slate-800">
          Mot de passe
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
          />
        </label>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm font-semibold text-teal-700 hover:text-teal-600">
            Mot de passe oublié ?
          </Link>
        </div>
        <DromapButton type="submit" variant="primary" fullWidth disabled={loading}>
          {loading ? "Connexion…" : "Se connecter"}
        </DromapButton>
      </form>
      <p className="mt-5 text-center text-sm text-slate-600">
        Pas encore de compte ?{" "}
        <Link href={`/signup?returnTo=${encodeURIComponent(returnTo)}`} className="font-bold text-teal-700 hover:text-teal-600">
          Créer un compte
        </Link>
      </p>
      <p className="mt-3 text-center text-xs text-slate-500">
        <Link href="/dashboard" className="font-semibold hover:text-slate-800">Continuer sans compte</Link>
      </p>
    </DromapAuthShell>
  );
}

export function DromapLoginClient() {
  return (
    <DromapProductBootstrap>
      <LoginForm />
    </DromapProductBootstrap>
  );
}
