"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { DromapButton } from "@/components/dromap-ui/button";
import { signUpDromapAccount } from "@/lib/dromap/account";
import { DROMAP_TERMS_VERSION } from "@/lib/dromap/legal-public";
import { useDromapProductStore } from "@/stores/dromap-product";
import { DromapProductBootstrap } from "./product-bootstrap";
import { DromapAuthShell } from "./auth-shell";

import { safeReturnTo } from "@/lib/dromap/safe-return-to";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activateAccount = useDromapProductStore((state) => state.activateAuthenticatedAccount);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const returnTo = safeReturnTo(searchParams.get("returnTo"));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await signUpDromapAccount(
      email,
      password,
      firstName,
      lastName,
      returnTo,
      DROMAP_TERMS_VERSION,
    );
    if (!result.ok || !result.data) {
      setError(result.error ?? "Création du compte impossible.");
      setLoading(false);
      return;
    }
    if (result.data.authenticated && result.data.account) {
      await activateAccount(result.data.account);
      router.replace(returnTo);
      return;
    }
    if (result.data.requiresEmailConfirmation) {
      setConfirmationSent(true);
      setLoading(false);
      return;
    }
    setError("Le compte a été créé, mais la connexion n’a pas pu être ouverte.");
    setLoading(false);
  }

  if (confirmationSent) {
    return (
      <DromapAuthShell
        title="Confirme ton adresse e-mail"
        description="Ton compte est créé. Clique sur le lien reçu par e-mail, puis connecte-toi à DroMap."
      >
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
          Le projet que tu utilisais en invité reste conservé sur cet appareil et sera transféré automatiquement dès ta première connexion.
        </div>
        <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="mt-5 inline-flex w-full justify-center rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-500">
          Aller à la connexion
        </Link>
      </DromapAuthShell>
    );
  }

  return (
    <DromapAuthShell
      title="Créer un compte"
      description="Conserve tes projets en ligne et retrouve-les sur tes autres appareils. Ton projet invité actuel sera transféré automatiquement."
    >
      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      ) : null}
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-800">
            Prénom
            <input
              type="text"
              autoComplete="given-name"
              required
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            Nom
            <input
              type="text"
              autoComplete="family-name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
            />
          </label>
        </div>
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
            minLength={8}
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">8 caractères minimum.</span>
        </label>
        <label className="block text-sm font-semibold text-slate-800">
          Confirmer le mot de passe
          <input
            type="password"
            minLength={8}
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
          />
        </label>
        <p className="text-xs leading-5 text-slate-500">
          En créant ton compte, tu acceptes les <Link href="/conditions-generales" target="_blank" className="font-bold text-teal-700 hover:underline">conditions générales d’utilisation</Link> et reconnais avoir pris connaissance de la <Link href="/confidentialite" target="_blank" className="font-bold text-teal-700 hover:underline">politique de confidentialité</Link>. Les conditions de vente sont acceptées séparément sur Stripe lorsqu’un paiement est effectué.
        </p>
        <DromapButton type="submit" variant="primary" fullWidth disabled={loading}>
          {loading ? "Création…" : "Créer mon compte"}
        </DromapButton>
      </form>
      <p className="mt-5 text-center text-sm text-slate-600">
        Déjà un compte ?{" "}
        <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="font-bold text-teal-700 hover:text-teal-600">
          Se connecter
        </Link>
      </p>
    </DromapAuthShell>
  );
}

export function DromapSignupClient() {
  return (
    <DromapProductBootstrap>
      <SignupForm />
    </DromapProductBootstrap>
  );
}
