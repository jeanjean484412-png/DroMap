"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { DromapProductBootstrap } from "./product-bootstrap";
import { DromapProductShell } from "./product-shell";
import { DromapButton } from "@/components/dromap-ui/button";
import { DromapDialog } from "@/components/dromap-ui/dialog";
import {
  adoptDromapRecoverySession,
  changeDromapPassword,
  deleteDromapAccount,
  getDromapAccountUsage,
  requestDromapEmailChange,
  type DromapAccountUsage,
} from "@/lib/dromap/account";
import { useDromapProductStore } from "@/stores/dromap-product";
import { useEditorTestCustomMarkersStore } from "@/stores/editor-test-custom-markers";
import { useEditorTestLayersStore } from "@/stores/editor-test-layers";
import { useEditorTestGeoJsonLayersStore } from "@/stores/editor-test-geojson-layers";

type ProjectSortPreference = "updated-desc" | "name-asc" | "created-desc";

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 o";
  const units = ["o", "Ko", "Mo", "Go"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: value >= 10 ? 1 : 2 }).format(value)} ${units[unitIndex]}`;
}

function AccountContent() {
  const router = useRouter();
  const userMode = useDromapProductStore((state) => state.userMode);
  const accountName = useDromapProductStore((state) => state.accountName);
  const accountFirstName = useDromapProductStore((state) => state.accountFirstName);
  const accountLastName = useDromapProductStore((state) => state.accountLastName);
  const accountEmail = useDromapProductStore((state) => state.accountEmail);
  const accountUserId = useDromapProductStore((state) => state.accountUserId);
  const accountPreferences = useDromapProductStore((state) => state.accountPreferences);
  const backendConfigured = useDromapProductStore((state) => state.accountBackendConfigured);
  const lastSyncError = useDromapProductStore((state) => state.lastSyncError);
  const projects = useDromapProductStore((state) => state.projects);
  const setAccountProfile = useDromapProductStore((state) => state.setAccountProfile);
  const signOutAccount = useDromapProductStore((state) => state.signOutAccount);
  const forgetAccountLocally = useDromapProductStore((state) => state.forgetAccountLocally);
  const syncAllProjects = useDromapProductStore((state) => state.syncAllProjects);

  const customMarkerCount = useEditorTestCustomMarkersStore(
    (state) => state.customMarkers.filter((marker) => !marker.hiddenFromLibrary).length,
  );
  const savedLayerCount = useEditorTestLayersStore((state) => state.savedLayers.length);
  const savedGeoJsonLayerCount = useEditorTestGeoJsonLayersStore((state) => state.savedGeoJsonLayers.length);

  const [firstNameDraft, setFirstNameDraft] = useState(accountFirstName ?? accountName.split(/\s+/)[0] ?? "");
  const [lastNameDraft, setLastNameDraft] = useState(accountLastName ?? accountName.split(/\s+/).slice(1).join(" "));
  const [projectSortDraft, setProjectSortDraft] = useState<ProjectSortPreference>("updated-desc");
  const [newEmail, setNewEmail] = useState("");
  const [emailCurrentPassword, setEmailCurrentPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [usage, setUsage] = useState<DromapAccountUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteCurrentPassword, setDeleteCurrentPassword] = useState("");

  useEffect(() => {
    setFirstNameDraft(accountFirstName ?? accountName.split(/\s+/)[0] ?? "");
    setLastNameDraft(accountLastName ?? accountName.split(/\s+/).slice(1).join(" "));
  }, [accountFirstName, accountLastName, accountName]);

  useEffect(() => {
    const value = accountPreferences.projectSort;
    setProjectSortDraft(
      value === "name-asc" || value === "created-desc" ? value : "updated-desc",
    );
  }, [accountPreferences]);

  useEffect(() => {
    if (!message && !error) return;
    const timeoutId = window.setTimeout(() => {
      setMessage(null);
      setError(null);
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [message, error]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const confirmed = url.searchParams.get("email-change") === "confirmed";
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const expiresIn = Number(hash.get("expires_in") ?? "3600");
    const pendingEmail = window.localStorage.getItem("dromap-pending-email-change-v1");

    if (!confirmed && (!accessToken || !refreshToken)) return;

    let cancelled = false;
    void (async () => {
      if (accessToken && refreshToken) {
        await adoptDromapRecoverySession(
          accessToken,
          refreshToken,
          Number.isFinite(expiresIn) ? expiresIn : 3600,
          "login",
        );
      }

      await useDromapProductStore.getState().refreshAccountSession();
      if (cancelled) return;

      const currentEmail = useDromapProductStore.getState().accountEmail?.toLowerCase() ?? "";
      if (pendingEmail && currentEmail === pendingEmail.toLowerCase()) {
        window.localStorage.removeItem("dromap-pending-email-change-v1");
        setMessage(`Adresse e-mail modifiée : ${pendingEmail}.`);
      } else if (confirmed) {
        setMessage(
          pendingEmail
            ? "Une confirmation a été reçue. Si Supabase a aussi envoyé un message à ton ancienne adresse, confirme également celui-ci : le changement devient actif après les confirmations requises."
            : "Confirmation reçue. La session du compte a été actualisée.",
        );
      }

      url.searchParams.delete("email-change");
      url.hash = "";
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshUsage() {
    if (userMode !== "authenticated") return;
    setUsageLoading(true);
    const result = await getDromapAccountUsage();
    setUsageLoading(false);
    if (result.ok && result.data) setUsage(result.data);
  }

  useEffect(() => {
    void refreshUsage();
  }, [userMode]);

  const pendingSyncCount = projects.filter(
    (project) =>
      project.status !== "trashed" &&
      (project.status === "sync-pending" ||
        project.status === "unsaved" ||
        project.pendingChanges > 0),
  ).length;

  if (userMode === "guest") {
    return (
      <DromapProductShell
        title="Compte"
        description="Crée un compte pour conserver tes projets en ligne et les retrouver sur plusieurs appareils."
      >
        <div className="max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-slate-950">Tu utilises DroMap en invité</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Ton projet temporaire reste enregistré sur cet appareil. Si tu crées un compte, il sera transféré automatiquement sans perdre ton travail.
              </p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">Invité</span>
          </div>

          {backendConfigured === false ? (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Les comptes DroMap sont momentanément indisponibles.
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/signup" className="inline-flex min-h-10 items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500">
              Créer un compte
            </Link>
            <Link href="/login" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50">
              Se connecter
            </Link>
          </div>
        </div>
      </DromapProductShell>
    );
  }

  async function savePassword() {
    if (newPassword.length < 8) {
      setError("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    if (!currentPassword) {
      setError("Saisis ton mot de passe actuel.");
      return;
    }
    setWorking(true);
    setError(null);
    setMessage(null);
    const result = await changeDromapPassword(newPassword, currentPassword);
    setWorking(false);
    if (!result.ok) {
      setError(result.error ?? "Modification du mot de passe impossible.");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setMessage("Mot de passe modifié.");
  }

  async function saveEmailChange() {
    const safeEmail = newEmail.trim().toLowerCase();
    if (!safeEmail || !safeEmail.includes("@")) {
      setError("Renseigne une nouvelle adresse e-mail valide.");
      return;
    }
    if (!emailCurrentPassword) {
      setError("Saisis ton mot de passe actuel pour changer d’adresse e-mail.");
      return;
    }
    setWorking(true);
    setError(null);
    setMessage(null);
    const result = await requestDromapEmailChange(safeEmail, emailCurrentPassword);
    setWorking(false);
    if (!result.ok) {
      setError(result.error ?? "Le changement d’adresse e-mail est impossible.");
      return;
    }
    window.localStorage.setItem("dromap-pending-email-change-v1", safeEmail);
    setNewEmail("");
    setEmailCurrentPassword("");
    setMessage(result.data?.message ?? "Demande de changement d’adresse e-mail envoyée.");
  }

  async function logout() {
    setWorking(true);
    setError(null);
    setMessage(null);
    const result = await signOutAccount();
    setWorking(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace("/dashboard");
  }

  async function savePreferences() {
    setWorking(true);
    setError(null);
    setMessage(null);
    const nextPreferences = { ...accountPreferences, projectSort: projectSortDraft };
    const ok = await setAccountProfile(
      accountFirstName ?? firstNameDraft,
      accountLastName ?? lastNameDraft,
      nextPreferences,
    );
    setWorking(false);
    if (ok) setMessage("Préférences enregistrées.");
    else setError("Les préférences n’ont pas pu être enregistrées.");
  }

  const feedbackToast = message || error ? (
    <div
      role={error ? "alert" : "status"}
      aria-live="assertive"
      className={`fixed left-1/2 top-6 z-[100000] w-[min(92vw,34rem)] -translate-x-1/2 rounded-2xl border px-4 py-3 text-sm font-bold shadow-2xl backdrop-blur ${
        error
          ? "border-red-300 bg-red-600 text-white"
          : "border-emerald-300 bg-emerald-600 text-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span>{error ?? message}</span>
        <button
          type="button"
          onClick={() => { setError(null); setMessage(null); }}
          className="shrink-0 rounded-lg px-2 py-0.5 text-lg leading-none text-white/90 hover:bg-white/15"
          aria-label="Fermer le message"
        >
          ×
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      {feedbackToast}
      <DromapProductShell
      title="Compte"
      description="Profil, préférences, utilisation, sécurité et synchronisation de ton compte DroMap."
      actions={<DromapButton onClick={() => void logout()} disabled={working}>Se déconnecter</DromapButton>}
    >
      <div className="grid max-w-5xl gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-black text-slate-950">Profil</h2>
          <p className="mt-1 text-sm text-slate-600">Ces informations suivent ton compte sur tous tes appareils.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-800" htmlFor="account-first-name">
              Prénom
              <input
                id="account-first-name"
                value={firstNameDraft}
                onChange={(event) => setFirstNameDraft(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-800" htmlFor="account-last-name">
              Nom
              <input
                id="account-last-name"
                value={lastNameDraft}
                onChange={(event) => setLastNameDraft(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              />
            </label>
          </div>
          <label className="mt-4 block text-sm font-semibold text-slate-800">Adresse e-mail</label>
          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">{accountEmail ?? "—"}</div>
          <DromapButton
            variant="primary"
            className="mt-4"
            disabled={working}
            onClick={async () => {
              setWorking(true);
              setMessage(null);
              setError(null);
              const ok = await setAccountProfile(firstNameDraft, lastNameDraft);
              setWorking(false);
              if (ok) setMessage("Profil enregistré.");
              else setError("Le profil n’a pas pu être enregistré.");
            }}
          >
            Enregistrer le profil
          </DromapButton>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-black text-slate-950">Préférences</h2>
          <p className="mt-1 text-sm text-slate-600">Ces choix sont enregistrés avec ton compte.</p>
          <label className="mt-5 block text-sm font-semibold text-slate-800" htmlFor="account-project-sort">
            Trier les projets du tableau de bord
          </label>
          <select
            id="account-project-sort"
            value={projectSortDraft}
            onChange={(event) => setProjectSortDraft(event.target.value as ProjectSortPreference)}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
          >
            <option value="updated-desc">Dernière modification</option>
            <option value="name-asc">Nom du projet</option>
            <option value="created-desc">Date de création</option>
          </select>
          <p className="mt-2 text-xs leading-5 text-slate-500">Le choix est repris automatiquement sur les autres appareils connectés au même compte.</p>
          <DromapButton className="mt-4" variant="primary" disabled={working} onClick={() => void savePreferences()}>
            Enregistrer les préférences
          </DromapButton>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-black text-slate-950">Utilisation du compte</h2>
              <p className="mt-1 text-sm text-slate-600">Vue d’ensemble de tes projets et de ta bibliothèque personnelle.</p>
            </div>
            <DromapButton disabled={usageLoading} onClick={() => void refreshUsage()}>
              {usageLoading ? "Actualisation…" : "Actualiser"}
            </DromapButton>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Projets</div>
              <div className="mt-1 text-2xl font-black text-slate-950">{usage?.activeProjects ?? projects.filter((project) => !project.deletedAt).length}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Corbeille</div>
              <div className="mt-1 text-2xl font-black text-slate-950">{usage?.trashedProjects ?? projects.filter((project) => Boolean(project.deletedAt)).length}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Bibliothèque</div>
              <div className="mt-1 text-2xl font-black text-slate-950">{customMarkerCount + savedLayerCount + savedGeoJsonLayerCount}</div>
              <div className="mt-1 text-xs text-slate-500">éléments personnels</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Données en ligne</div>
              <div className="mt-1 text-xl font-black text-slate-950">{usage ? formatBytes(usage.totalBytes) : "—"}</div>
              <div className="mt-1 text-xs text-slate-500">taille utile estimée</div>
            </div>
          </div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 px-4 py-3"><strong>{customMarkerCount}</strong> marqueur{customMarkerCount > 1 ? "s" : ""} personnel{customMarkerCount > 1 ? "s" : ""}</div>
            <div className="rounded-xl border border-slate-200 px-4 py-3"><strong>{savedLayerCount}</strong> calque{savedLayerCount > 1 ? "s" : ""} DroMap enregistré{savedLayerCount > 1 ? "s" : ""}</div>
            <div className="rounded-xl border border-slate-200 px-4 py-3"><strong>{savedGeoJsonLayerCount}</strong> calque{savedGeoJsonLayerCount > 1 ? "s" : ""} GeoJSON enregistré{savedGeoJsonLayerCount > 1 ? "s" : ""}</div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-black text-slate-950">Synchronisation</h2>
          <p className="mt-1 text-sm text-slate-600">Les modifications sont conservées localement puis synchronisées avec ton compte.</p>
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            {pendingSyncCount > 0
              ? `${pendingSyncCount} projet${pendingSyncCount > 1 ? "s" : ""} en attente de synchronisation.`
              : "Tous les projets enregistrés sont synchronisés."}
          </div>
          {lastSyncError ? <p className="mt-3 text-xs leading-5 text-amber-700">{lastSyncError}</p> : null}
          <DromapButton
            className="mt-4"
            disabled={working}
            onClick={async () => {
              setWorking(true);
              setError(null);
              const ok = await syncAllProjects();
              setWorking(false);
              if (ok) {
                setMessage("Synchronisation terminée.");
                void refreshUsage();
              } else setError("Certains projets n’ont pas pu être synchronisés.");
            }}
          >
            Synchroniser maintenant
          </DromapButton>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-black text-slate-950">Sécurité</h2>
          <p className="mt-1 text-sm text-slate-600">Adresse de connexion et mot de passe.</p>

          <div className="mt-5 border-b border-slate-200 pb-5">
            <h3 className="text-sm font-black text-slate-900">Changer l’adresse e-mail</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">Une confirmation sera envoyée avant que la nouvelle adresse devienne active.</p>
            <label className="mt-3 block text-sm font-semibold text-slate-800">Nouvelle adresse e-mail</label>
            <input
              type="email"
              autoComplete="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            />
            <label className="mt-3 block text-sm font-semibold text-slate-800">Mot de passe actuel</label>
            <input
              type="password"
              autoComplete="current-password"
              value={emailCurrentPassword}
              onChange={(event) => setEmailCurrentPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            />
            <DromapButton className="mt-3" onClick={() => void saveEmailChange()} disabled={working || !newEmail}>
              Changer l’adresse e-mail
            </DromapButton>
          </div>

          <div className="pt-5">
            <h3 className="text-sm font-black text-slate-900">Changer le mot de passe</h3>
            <label className="mt-3 block text-sm font-semibold text-slate-800">Mot de passe actuel</label>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            />
            <label className="mt-4 block text-sm font-semibold text-slate-800">Nouveau mot de passe</label>
            <input
              type="password"
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            />
            <label className="mt-4 block text-sm font-semibold text-slate-800">Confirmer le mot de passe</label>
            <input
              type="password"
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            />
            <DromapButton className="mt-4" onClick={() => void savePassword()} disabled={working || !newPassword}>
              Modifier le mot de passe
            </DromapButton>
          </div>
        </section>

        <section className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="font-black text-red-800">Supprimer le compte</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Cette action supprime définitivement ton compte, tes projets en ligne et ta bibliothèque personnelle. Elle est irréversible.
          </p>
          <DromapButton variant="danger" className="mt-4" onClick={() => setDeleteOpen(true)}>
            Supprimer mon compte
          </DromapButton>
        </section>
      </div>

      <DromapDialog
        open={deleteOpen}
        title="Supprimer définitivement le compte ?"
        description="Tous les projets et les éléments personnels enregistrés en ligne avec ce compte seront supprimés."
        onClose={() => {
          setDeleteOpen(false);
          setDeleteConfirmation("");
          setDeleteCurrentPassword("");
        }}
        footer={
          <>
            <DromapButton onClick={() => setDeleteOpen(false)}>Annuler</DromapButton>
            <DromapButton
              variant="danger"
              disabled={working || deleteConfirmation !== "SUPPRIMER" || !deleteCurrentPassword}
              onClick={async () => {
                setWorking(true);
                setError(null);
                const result = await deleteDromapAccount(deleteConfirmation, deleteCurrentPassword);
                setWorking(false);
                if (!result.ok) {
                  setError(result.error ?? "Suppression du compte impossible.");
                  setDeleteOpen(false);
                  return;
                }
                useEditorTestCustomMarkersStore.getState().replaceCustomMarkers([]);
                useEditorTestLayersStore.getState().replaceSavedLayers([]);
                useEditorTestGeoJsonLayersStore.getState().replaceSavedGeoJsonLayers([]);
                if (typeof window !== "undefined") {
                  window.localStorage.removeItem("dromap-personal-library-sync-v1");
                  if (accountUserId) window.localStorage.removeItem(`dromap-personal-library-sync-v2:${accountUserId}`);
                  window.localStorage.removeItem("dromap-personal-library-local-owner-v1");
                }
                forgetAccountLocally();
                router.replace("/dashboard");
              }}
            >
              Supprimer définitivement
            </DromapButton>
          </>
        }
      >
        <label className="block text-sm font-semibold text-slate-800">
          Mot de passe actuel
          <input
            type="password"
            autoComplete="current-password"
            value={deleteCurrentPassword}
            onChange={(event) => setDeleteCurrentPassword(event.target.value)}
            className="mt-2 w-full rounded-xl border border-red-300 px-3 py-2.5 outline-none focus:border-red-500 focus:ring-4 focus:ring-red-100"
          />
        </label>
        <p className="mt-4 text-sm leading-6 text-slate-700">Saisis <strong>SUPPRIMER</strong> pour confirmer.</p>
        <input
          value={deleteConfirmation}
          onChange={(event) => setDeleteConfirmation(event.target.value)}
          className="mt-3 w-full rounded-xl border border-red-300 px-3 py-2.5 outline-none focus:border-red-500 focus:ring-4 focus:ring-red-100"
          autoFocus
        />
      </DromapDialog>
    </DromapProductShell>
    </>
  );
}

export function DromapAccountClient() {
  return (
    <DromapProductBootstrap>
      <AccountContent />
    </DromapProductBootstrap>
  );
}
