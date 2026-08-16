"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { DromapButton } from "@/components/dromap-ui/button";
import { adoptDromapRecoverySession, changeDromapPassword, signOutDromapAccount } from "@/lib/dromap/account";
import { DromapAuthShell } from "./auth-shell";

export function DromapResetPasswordClient() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    if (!accessToken || !refreshToken) {
      setError("Ce lien de réinitialisation est incomplet ou a expiré.");
      setLoading(false);
      return;
    }
    void adoptDromapRecoverySession(
      accessToken,
      refreshToken,
      Number(hash.get("expires_in") ?? "3600"),
      "recovery",
    ).then((result) => {
      window.history.replaceState({}, "", window.location.pathname);
      if (!result.ok) {
        setError(result.error ?? "Ce lien n’est plus valide.");
        setLoading(false);
        return;
      }
      setReady(true);
      setLoading(false);
    });
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await changeDromapPassword(password);
    if (!result.ok) {
      setError(result.error ?? "Modification impossible.");
      setLoading(false);
      return;
    }
    await signOutDromapAccount();
    router.replace("/login?reset=1");
  }

  return (
    <DromapAuthShell
      title="Nouveau mot de passe"
      description="Choisis un nouveau mot de passe pour ton compte DroMap."
    >
      {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
      {loading && !ready ? <p className="text-sm text-slate-600">Validation du lien…</p> : null}
      {ready ? (
        <form className="space-y-4" onSubmit={submit}>
          <label className="block text-sm font-semibold text-slate-800">
            Nouveau mot de passe
            <input
              type="password"
              minLength={8}
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            />
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
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            />
          </label>
          <DromapButton type="submit" variant="primary" fullWidth disabled={loading}>
            {loading ? "Enregistrement…" : "Enregistrer le nouveau mot de passe"}
          </DromapButton>
        </form>
      ) : null}
    </DromapAuthShell>
  );
}
