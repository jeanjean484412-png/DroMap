"use client";

import Link from "next/link";
import { useState } from "react";

import { DromapButton } from "@/components/dromap-ui/button";
import { resendDromapSignupConfirmation } from "@/lib/dromap/account";
import { DromapAuthShell } from "./auth-shell";

export function DromapResendConfirmationClient() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await resendDromapSignupConfirmation(email);
      if (!result.ok) {
        setError(result.error ?? "Envoi impossible pour le moment.");
        return;
      }
      setSent(true);
    } catch {
      setError("Envoi impossible pour le moment. Réessaie plus tard.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DromapAuthShell
      title="Renvoyer l’e-mail de confirmation"
      description="Indique l’adresse utilisée lors de ton inscription pour recevoir un nouveau lien de confirmation."
    >
      {sent ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
            Si cette adresse correspond à un compte en attente, un nouveau lien de confirmation a été demandé. Vérifie aussi les courriers indésirables.
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
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
            />
          </label>
          <DromapButton type="submit" variant="primary" fullWidth disabled={loading}>
            {loading ? "Envoi…" : "Renvoyer le lien"}
          </DromapButton>
          <Link href="/login" className="block text-center text-sm font-semibold text-teal-700 hover:text-teal-600">
            Retour à la connexion
          </Link>
        </form>
      )}
    </DromapAuthShell>
  );
}
