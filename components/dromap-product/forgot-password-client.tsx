"use client";

import Link from "next/link";
import { useState } from "react";

import { DromapButton } from "@/components/dromap-ui/button";
import { requestDromapPasswordReset } from "@/lib/dromap/account";
import { DromapAuthShell } from "./auth-shell";

export function DromapForgotPasswordClient() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await requestDromapPasswordReset(email);
    if (!result.ok) {
      setError(result.error ?? "Envoi impossible.");
      setLoading(false);
      return;
    }
    setSent(true);
    setLoading(false);
  }

  return (
    <DromapAuthShell
      title="Mot de passe oublié"
      description="Indique l’adresse e-mail de ton compte. DroMap t’enverra un lien pour choisir un nouveau mot de passe."
    >
      {sent ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
            Si un compte correspond à cette adresse, un e-mail de réinitialisation vient d’être envoyé.
          </div>
          <Link href="/login" className="inline-flex w-full justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50">
            Retour à la connexion
          </Link>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
          <label className="block text-sm font-semibold text-slate-800">
            Adresse e-mail
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            />
          </label>
          <DromapButton type="submit" variant="primary" fullWidth disabled={loading}>
            {loading ? "Envoi…" : "Envoyer le lien"}
          </DromapButton>
        </form>
      )}
    </DromapAuthShell>
  );
}
