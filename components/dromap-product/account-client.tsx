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
import { useEditorCustomMarkersStore } from "@/stores/editor-custom-markers";
import { useEditorLayersStore } from "@/stores/editor-layers";
import { useEditorGeoJsonLayersStore } from "@/stores/editor-geojson-layers";
import { getDromapAccountPlanLabel } from "@/lib/dromap/plans";
import {
  createDromapBillingPortalSession,
  getDromapBillingStatus,
  type DromapBillingStatus,
} from "@/lib/dromap/billing";

type AccountSection = "overview" | "profile" | "billing" | "usage" | "security";


function getAccountInitials(firstName: string | null, lastName: string | null, displayName: string) {
  const parts = [firstName, lastName].filter(Boolean) as string[];
  const source = parts.length > 0 ? parts : displayName.split(/\s+/).filter(Boolean);
  return source.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || "D";
}

function AccountSectionIcon({ section }: { section: AccountSection }) {
  const common = "h-5 w-5";
  if (section === "overview") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={common} aria-hidden="true"><path d="M4 5.5h6v6H4zM14 5.5h6v6h-6zM4 15.5h6v3H4zM14 15.5h6v3h-6z" strokeLinejoin="round" /></svg>;
  }
  if (section === "profile") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={common} aria-hidden="true"><circle cx="12" cy="8" r="3.2" /><path d="M5.5 19c.8-3.2 3.2-5 6.5-5s5.7 1.8 6.5 5" strokeLinecap="round" /></svg>;
  }
  if (section === "billing") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={common} aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="M3.5 9h17M7 14h3.5" strokeLinecap="round" /></svg>;
  }
  if (section === "usage") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={common} aria-hidden="true"><path d="M5 18V10M12 18V5M19 18v-7" strokeLinecap="round" /><path d="M3.5 18.5h17" strokeLinecap="round" /></svg>;
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={common} aria-hidden="true"><path d="M12 3.5 19 6v5.2c0 4.2-2.4 7.4-7 9.3-4.6-1.9-7-5.1-7-9.3V6l7-2.5Z" strokeLinejoin="round" /><path d="M9.2 12.2 11 14l3.8-4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function getSubscriptionStatusLabel(status: string) {
  if (status === "active") return "Actif";
  if (status === "trialing") return "Période d’essai";
  if (status === "past_due") return "Paiement à régulariser";
  if (status === "unpaid") return "Impayé";
  if (status === "canceled") return "Résilié";
  if (status === "incomplete") return "Paiement incomplet";
  if (status === "incomplete_expired") return "Paiement expiré";
  if (status === "paused") return "Suspendu";
  return status;
}

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
  const accountPlan = useDromapProductStore((state) => state.accountPlan);
  const backendConfigured = useDromapProductStore((state) => state.accountBackendConfigured);
  const lastSyncError = useDromapProductStore((state) => state.lastSyncError);
  const projects = useDromapProductStore((state) => state.projects);
  const setAccountProfile = useDromapProductStore((state) => state.setAccountProfile);
  const signOutAccount = useDromapProductStore((state) => state.signOutAccount);
  const forgetAccountLocally = useDromapProductStore((state) => state.forgetAccountLocally);
  const syncAllProjects = useDromapProductStore((state) => state.syncAllProjects);

  const customMarkerCount = useEditorCustomMarkersStore(
    (state) => state.customMarkers.filter((marker) => !marker.hiddenFromLibrary).length,
  );
  const savedLayerCount = useEditorLayersStore((state) => state.savedLayers.length);
  const savedGeoJsonLayerCount = useEditorGeoJsonLayersStore((state) => state.savedGeoJsonLayers.length);

  const [firstNameDraft, setFirstNameDraft] = useState(accountFirstName ?? accountName.split(/\s+/)[0] ?? "");
  const [lastNameDraft, setLastNameDraft] = useState(accountLastName ?? accountName.split(/\s+/).slice(1).join(" "));
  const [newEmail, setNewEmail] = useState("");
  const [emailCurrentPassword, setEmailCurrentPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [usage, setUsage] = useState<DromapAccountUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [billingStatus, setBillingStatus] = useState<DromapBillingStatus | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteCurrentPassword, setDeleteCurrentPassword] = useState("");
  const [activeSection, setActiveSection] = useState<AccountSection>("overview");

  useEffect(() => {
    setFirstNameDraft(accountFirstName ?? accountName.split(/\s+/)[0] ?? "");
    setLastNameDraft(accountLastName ?? accountName.split(/\s+/).slice(1).join(" "));
  }, [accountFirstName, accountLastName, accountName]);

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

  async function refreshBilling() {
    if (userMode !== "authenticated") return;
    setBillingLoading(true);
    const result = await getDromapBillingStatus();
    setBillingLoading(false);
    if (result.ok && result.data) setBillingStatus(result.data);
  }

  useEffect(() => {
    void refreshBilling();
  }, [userMode, accountPlan]);

  async function openBillingPortal() {
    setBillingLoading(true);
    setError(null);
    const result = await createDromapBillingPortalSession();
    if (!result.ok || !result.data?.url) {
      setBillingLoading(false);
      setError(result.error ?? "Le portail de facturation n’a pas pu être ouvert.");
      return;
    }
    window.location.assign(result.data.url);
  }

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
        <div className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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
            <Link href="/signup" className="inline-flex min-h-10 items-center justify-center rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-500">
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

  const feedbackToast = message || error ? (
    <div
      role={error ? "alert" : "status"}
      aria-live="assertive"
      className={`fixed left-1/2 top-6 z-[100000] w-[min(92vw,34rem)] -translate-x-1/2 rounded-2xl border px-4 py-3 text-sm font-bold shadow-lg ${
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

  const initials = getAccountInitials(accountFirstName, accountLastName, accountName);
  const activeProjectsCount = usage?.activeProjects ?? projects.filter((project) => !project.deletedAt).length;
  const trashedProjectsCount = usage?.trashedProjects ?? projects.filter((project) => Boolean(project.deletedAt)).length;
  const personalLibraryCount = customMarkerCount + savedLayerCount + savedGeoJsonLayerCount;
  const syncHealthy = pendingSyncCount === 0 && !lastSyncError;

  const accountSections: Array<{ id: AccountSection; label: string; description: string }> = [
    { id: "overview", label: "Vue d’ensemble", description: "L’essentiel de ton compte" },
    { id: "profile", label: "Profil", description: "Nom et identité" },
    { id: "billing", label: "Formule & facturation", description: "Abonnement et paiements" },
    { id: "usage", label: "Utilisation & données", description: "Projets, stockage et synchro" },
    { id: "security", label: "Sécurité", description: "E-mail, mot de passe et compte" },
  ];

  return (
    <>
      {feedbackToast}
      <DromapProductShell
        title="Compte"
        description="Gère ton profil, ta formule, tes données et la sécurité de ton compte DroMap."
        actions={<DromapButton onClick={() => void logout()} disabled={working}>Se déconnecter</DromapButton>}
      >
        <div className="max-w-6xl">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="grid lg:grid-cols-[260px_minmax(0,1fr)]">
              <aside className="border-b border-slate-200 bg-slate-50/80 p-4 lg:border-b-0 lg:border-r lg:p-5">
                <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-black text-white">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-950">{accountName || "Compte DroMap"}</div>
                      <div className="truncate text-xs text-slate-500">{accountEmail ?? "—"}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-black text-teal-700">
                      {getDromapAccountPlanLabel(accountPlan)}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${syncHealthy ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                      {syncHealthy ? "Synchronisé" : "À synchroniser"}
                    </span>
                  </div>
                </div>

                <nav className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1" aria-label="Réglages du compte">
                  {accountSections.map((section) => {
                    const selected = activeSection === section.id;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => setActiveSection(section.id)}
                        className={[
                          "flex min-h-[58px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                          selected
                            ? "bg-slate-950 text-white shadow-sm"
                            : "text-slate-700 hover:bg-white hover:text-slate-950",
                        ].join(" ")}
                        aria-current={selected ? "page" : undefined}
                      >
                        <span className={selected ? "text-white" : "text-slate-500"}><AccountSectionIcon section={section.id} /></span>
                        <span className="min-w-0">
                          <span className="block text-sm font-black">{section.label}</span>
                          <span className={`mt-0.5 block text-[11px] leading-4 ${selected ? "text-slate-300" : "text-slate-500"}`}>{section.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </nav>
              </aside>

              <main className="min-w-0 bg-white p-5 sm:p-7 lg:p-8">
                {activeSection === "overview" ? (
                  <div className="space-y-6">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-600">Compte DroMap</p>
                      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Bonjour {accountFirstName || firstNameDraft || accountName.split(/\s+/)[0] || ""}</h2>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Retrouve ici les informations importantes de ton compte et accède rapidement aux réglages dont tu as besoin.</p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-[#123a59] p-6 text-white shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-5">
                        <div className="flex min-w-0 items-center gap-4">
                          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl font-black ring-1 ring-white/15">{initials}</div>
                          <div className="min-w-0">
                            <div className="truncate text-xl font-black">{accountName || "Compte DroMap"}</div>
                            <div className="mt-1 truncate text-sm text-slate-300">{accountEmail ?? "—"}</div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black ring-1 ring-white/10">Formule {getDromapAccountPlanLabel(accountPlan)}</span>
                              <span className={`rounded-full px-3 py-1 text-xs font-black ${syncHealthy ? "bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-300/20" : "bg-amber-400/15 text-amber-100 ring-1 ring-amber-300/20"}`}>
                                {syncHealthy ? "Tout est synchronisé" : `${pendingSyncCount} projet${pendingSyncCount > 1 ? "s" : ""} à synchroniser`}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => setActiveSection("profile")} className="rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-slate-100">Modifier le profil</button>
                          <button type="button" onClick={() => setActiveSection("billing")} className="rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-black text-white hover:bg-white/10">Gérer la formule</button>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <button type="button" onClick={() => setActiveSection("usage")} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-slate-300 hover:bg-white">
                        <div className="text-xs font-black uppercase tracking-wide text-slate-500">Projets actifs</div>
                        <div className="mt-2 text-3xl font-black text-slate-950">{activeProjectsCount}</div>
                        <div className="mt-1 text-xs text-slate-500">Voir l’utilisation →</div>
                      </button>
                      <button type="button" onClick={() => setActiveSection("usage")} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-slate-300 hover:bg-white">
                        <div className="text-xs font-black uppercase tracking-wide text-slate-500">Bibliothèque</div>
                        <div className="mt-2 text-3xl font-black text-slate-950">{personalLibraryCount}</div>
                        <div className="mt-1 text-xs text-slate-500">éléments personnels</div>
                      </button>
                      <button type="button" onClick={() => setActiveSection("usage")} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-slate-300 hover:bg-white">
                        <div className="text-xs font-black uppercase tracking-wide text-slate-500">Données en ligne</div>
                        <div className="mt-2 text-2xl font-black text-slate-950">{usage ? formatBytes(usage.totalBytes) : "—"}</div>
                        <div className="mt-1 text-xs text-slate-500">taille utile estimée</div>
                      </button>
                      <button type="button" onClick={() => setActiveSection("security")} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-slate-300 hover:bg-white">
                        <div className="text-xs font-black uppercase tracking-wide text-slate-500">Sécurité</div>
                        <div className="mt-2 text-lg font-black text-slate-950">Compte protégé</div>
                        <div className="mt-1 text-xs text-slate-500">E-mail et mot de passe →</div>
                      </button>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-xs font-black uppercase tracking-wide text-teal-600">Formule actuelle</div>
                            <div className="mt-1 text-lg font-black text-slate-950">{getDromapAccountPlanLabel(accountPlan)}</div>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                              {billingStatus?.cancelAtPeriodEnd && billingStatus.currentPeriodEnd
                                ? `Résilié — avantages actifs jusqu’au ${new Date(billingStatus.currentPeriodEnd).toLocaleDateString("fr-FR")} inclus.`
                                : billingStatus?.subscriptionStatus
                                  ? `Abonnement ${getSubscriptionStatusLabel(billingStatus.subscriptionStatus).toLowerCase()}${billingStatus.billingInterval === "year" ? " · annuel" : billingStatus.billingInterval === "month" ? " · mensuel" : ""}.`
                                  : accountPlan === "tester" ? "Accès de test complet actuellement actif." : "Aucun abonnement payant actif."}
                            </p>
                          </div>
                          <button type="button" onClick={() => setActiveSection("billing")} className="shrink-0 rounded-xl border border-teal-200 bg-white px-3 py-2 text-xs font-black text-teal-700 hover:bg-teal-50">Détails</button>
                        </div>
                      </div>

                      <div className={`rounded-2xl border p-5 ${syncHealthy ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/70"}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className={`text-xs font-black uppercase tracking-wide ${syncHealthy ? "text-emerald-700" : "text-amber-800"}`}>Synchronisation</div>
                            <div className="mt-1 text-lg font-black text-slate-950">{syncHealthy ? "Tout est à jour" : "Une action est nécessaire"}</div>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{pendingSyncCount > 0 ? `${pendingSyncCount} projet${pendingSyncCount > 1 ? "s" : ""} en attente de synchronisation.` : lastSyncError ? "La dernière synchronisation a rencontré un problème." : "Tes projets enregistrés sont synchronisés avec ton compte."}</p>
                          </div>
                          <button type="button" onClick={() => setActiveSection("usage")} className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">Voir</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {activeSection === "profile" ? (
                  <div className="max-w-3xl space-y-6">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-600">Profil</p>
                      <h2 className="mt-2 text-2xl font-black text-slate-950">Tes informations personnelles</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-600">Ces informations suivent ton compte sur tous tes appareils et permettent d’identifier clairement ton espace DroMap.</p>
                    </div>
                    <section className="rounded-2xl border border-slate-200 p-5 sm:p-6">
                      <div className="flex items-center gap-4 border-b border-slate-100 pb-5">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-950 text-lg font-black text-white">{initials}</div>
                        <div>
                          <div className="font-black text-slate-950">{accountName || "Compte DroMap"}</div>
                          <div className="mt-1 text-sm text-slate-500">{accountEmail ?? "—"}</div>
                        </div>
                      </div>
                      <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        <label className="block text-sm font-semibold text-slate-800" htmlFor="account-first-name">
                          Prénom
                          <input id="account-first-name" value={firstNameDraft} onChange={(event) => setFirstNameDraft(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100" />
                        </label>
                        <label className="block text-sm font-semibold text-slate-800" htmlFor="account-last-name">
                          Nom
                          <input id="account-last-name" value={lastNameDraft} onChange={(event) => setLastNameDraft(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100" />
                        </label>
                      </div>
                      <label className="mt-4 block text-sm font-semibold text-slate-800">Adresse e-mail du compte</label>
                      <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                        <span className="truncate">{accountEmail ?? "—"}</span>
                        <button type="button" onClick={() => setActiveSection("security")} className="shrink-0 text-xs font-black text-teal-700 hover:text-teal-600">Modifier</button>
                      </div>
                      <DromapButton variant="primary" className="mt-5" disabled={working} onClick={async () => {
                        setWorking(true); setMessage(null); setError(null);
                        const ok = await setAccountProfile(firstNameDraft, lastNameDraft);
                        setWorking(false);
                        if (ok) setMessage("Profil enregistré."); else setError("Le profil n’a pas pu être enregistré.");
                      }}>Enregistrer le profil</DromapButton>
                    </section>
                  </div>
                ) : null}

                {activeSection === "billing" ? (
                  <div className="space-y-6">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-600">Formule & facturation</p>
                      <h2 className="mt-2 text-2xl font-black text-slate-950">Ton abonnement DroMap</h2>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Consulte ta formule actuelle, sa période de facturation et accède au portail sécurisé Stripe pour les paiements et la résiliation.</p>
                    </div>
                    <section className="overflow-hidden rounded-2xl border border-teal-200 bg-[#f7fbfa] shadow-sm">
                      <div className="p-6 sm:p-7">
                        <div className="flex flex-wrap items-start justify-between gap-5">
                          <div>
                            <div className="text-xs font-black uppercase tracking-wide text-teal-600">Formule actuelle</div>
                            <div className="mt-2 text-3xl font-black tracking-tight text-slate-950">{getDromapAccountPlanLabel(accountPlan)}</div>
                            <div className="mt-4 space-y-1.5 text-sm leading-6 text-slate-600">
                              {billingStatus?.subscriptionStatus ? (
                                <p>Abonnement Stripe : <strong className={billingStatus.cancelAtPeriodEnd ? "text-amber-800" : "text-slate-800"}>{billingStatus.cancelAtPeriodEnd ? "Résilié — actif jusqu’à la fin de la période" : getSubscriptionStatusLabel(billingStatus.subscriptionStatus)}</strong>{billingStatus.billingInterval === "year" ? " · annuel" : billingStatus.billingInterval === "month" ? " · mensuel" : ""}.</p>
                              ) : accountPlan === "tester" ? <p>Accès de test conservé pour ce compte pendant la mise en place de la facturation.</p> : <p>Aucun abonnement payant actif.</p>}
                              {billingStatus?.currentPeriodEnd ? <p>{billingStatus.cancelAtPeriodEnd ? "Avantages disponibles jusqu’au" : "Prochaine échéance"} : <strong className="text-slate-800">{new Date(billingStatus.currentPeriodEnd).toLocaleDateString("fr-FR")}{billingStatus.cancelAtPeriodEnd ? " inclus" : ""}</strong>.</p> : null}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Link href="/pricing" className="inline-flex min-h-10 items-center justify-center rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-500">Voir les formules</Link>
                            {billingStatus?.stripeCustomerId ? <DromapButton variant="secondary" disabled={billingLoading} onClick={() => void openBillingPortal()}>{billingLoading ? "Ouverture…" : "Gérer mon abonnement"}</DromapButton> : null}
                          </div>
                        </div>
                      </div>
                      {billingStatus?.cancelAtPeriodEnd && billingStatus.currentPeriodEnd ? (
                        <div className="border-t border-amber-200 bg-amber-50 px-6 py-4 text-sm leading-6 text-amber-950"><strong>Résiliation enregistrée.</strong> Ton abonnement ne sera pas renouvelé. Tu conserves les avantages {getDromapAccountPlanLabel(accountPlan)} jusqu’au {new Date(billingStatus.currentPeriodEnd).toLocaleDateString("fr-FR")} inclus.</div>
                      ) : billingStatus?.subscriptionStatus === "canceled" ? (
                        <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 text-sm leading-6 text-slate-800"><strong>Abonnement terminé.</strong> Les avantages payants ne sont plus actifs sur ce compte.</div>
                      ) : null}
                    </section>
                    {billingStatus?.testMode ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950"><strong>Mode test Stripe.</strong> Aucun paiement réel n’est encaissé dans cet environnement.</div> : null}
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200 p-5"><div className="text-xs font-black uppercase tracking-wide text-slate-500">Plan</div><div className="mt-2 text-lg font-black text-slate-950">{getDromapAccountPlanLabel(accountPlan)}</div><p className="mt-2 text-xs leading-5 text-slate-500">Les fonctionnalités disponibles dans DroMap dépendent de cette formule.</p></div>
                      <div className="rounded-2xl border border-slate-200 p-5"><div className="text-xs font-black uppercase tracking-wide text-slate-500">Périodicité</div><div className="mt-2 text-lg font-black text-slate-950">{billingStatus?.billingInterval === "year" ? "Annuelle" : billingStatus?.billingInterval === "month" ? "Mensuelle" : "—"}</div><p className="mt-2 text-xs leading-5 text-slate-500">Gérée de façon sécurisée depuis le portail Stripe.</p></div>
                      <div className="rounded-2xl border border-slate-200 p-5"><div className="text-xs font-black uppercase tracking-wide text-slate-500">État</div><div className="mt-2 text-lg font-black text-slate-950">{billingStatus?.cancelAtPeriodEnd ? "Résilié" : billingStatus?.subscriptionStatus ? getSubscriptionStatusLabel(billingStatus.subscriptionStatus) : accountPlan === "tester" ? "Test" : "Sans abonnement"}</div><p className="mt-2 text-xs leading-5 text-slate-500">Le statut est resynchronisé avec Stripe.</p></div>
                    </div>
                  </div>
                ) : null}

                {activeSection === "usage" ? (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-teal-600">Utilisation & données</p><h2 className="mt-2 text-2xl font-black text-slate-950">Tes projets et ta bibliothèque</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Une vue claire de ce que ton compte contient et de l’état de synchronisation avec DroMap.</p></div><DromapButton disabled={usageLoading} onClick={() => void refreshUsage()}>{usageLoading ? "Actualisation…" : "Actualiser"}</DromapButton></div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-500">Projets</div><div className="mt-2 text-3xl font-black text-slate-950">{activeProjectsCount}</div></div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-500">Corbeille</div><div className="mt-2 text-3xl font-black text-slate-950">{trashedProjectsCount}</div></div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-500">Bibliothèque</div><div className="mt-2 text-3xl font-black text-slate-950">{personalLibraryCount}</div><div className="mt-1 text-xs text-slate-500">éléments personnels</div></div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-500">Données en ligne</div><div className="mt-2 text-2xl font-black text-slate-950">{usage ? formatBytes(usage.totalBytes) : "—"}</div><div className="mt-1 text-xs text-slate-500">taille utile estimée</div></div>
                    </div>
                    <section className="rounded-2xl border border-slate-200 p-5 sm:p-6">
                      <h3 className="font-black text-slate-950">Bibliothèque personnelle</h3><p className="mt-1 text-sm text-slate-600">Éléments réutilisables enregistrés dans ton compte.</p>
                      <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-slate-200 px-4 py-3 text-sm"><strong className="text-slate-950">{customMarkerCount}</strong><span className="mt-1 block text-xs text-slate-500">marqueur{customMarkerCount > 1 ? "s" : ""} personnel{customMarkerCount > 1 ? "s" : ""}</span></div><div className="rounded-xl border border-slate-200 px-4 py-3 text-sm"><strong className="text-slate-950">{savedLayerCount}</strong><span className="mt-1 block text-xs text-slate-500">calque{savedLayerCount > 1 ? "s" : ""} DroMap enregistré{savedLayerCount > 1 ? "s" : ""}</span></div><div className="rounded-xl border border-slate-200 px-4 py-3 text-sm"><strong className="text-slate-950">{savedGeoJsonLayerCount}</strong><span className="mt-1 block text-xs text-slate-500">calque{savedGeoJsonLayerCount > 1 ? "s" : ""} GeoJSON enregistré{savedGeoJsonLayerCount > 1 ? "s" : ""}</span></div></div>
                    </section>
                    <section className={`rounded-2xl border p-5 sm:p-6 ${syncHealthy ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/60"}`}>
                      <div className="flex flex-wrap items-start justify-between gap-4"><div><div className={`text-xs font-black uppercase tracking-wide ${syncHealthy ? "text-emerald-700" : "text-amber-800"}`}>Synchronisation</div><h3 className="mt-1 text-lg font-black text-slate-950">{syncHealthy ? "Tous les projets enregistrés sont synchronisés" : "Synchronisation à vérifier"}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{pendingSyncCount > 0 ? `${pendingSyncCount} projet${pendingSyncCount > 1 ? "s" : ""} en attente de synchronisation.` : "Les modifications sont conservées localement puis synchronisées avec ton compte."}</p>{lastSyncError ? <p className="mt-2 text-xs leading-5 text-amber-800">{lastSyncError}</p> : null}</div><DromapButton disabled={working} onClick={async () => { setWorking(true); setError(null); const ok = await syncAllProjects(); setWorking(false); if (ok) { setMessage("Synchronisation terminée."); void refreshUsage(); } else setError("Certains projets n’ont pas pu être synchronisés."); }}>Synchroniser maintenant</DromapButton></div>
                    </section>
                  </div>
                ) : null}

                {activeSection === "security" ? (
                  <div className="max-w-3xl space-y-6">
                    <div><p className="text-xs font-black uppercase tracking-[0.18em] text-teal-600">Sécurité</p><h2 className="mt-2 text-2xl font-black text-slate-950">Connexion et protection du compte</h2><p className="mt-2 text-sm leading-6 text-slate-600">Gère ton adresse de connexion, ton mot de passe et les actions sensibles du compte.</p></div>
                    <section className="rounded-2xl border border-slate-200 p-5 sm:p-6">
                      <div className="flex items-start gap-4"><div className="rounded-xl bg-slate-100 p-2.5 text-slate-600"><AccountSectionIcon section="security" /></div><div><h3 className="font-black text-slate-950">Changer l’adresse e-mail</h3><p className="mt-1 text-sm leading-6 text-slate-600">Adresse actuelle : <strong className="text-slate-800">{accountEmail ?? "—"}</strong>. Une confirmation sera envoyée avant que la nouvelle adresse devienne active.</p></div></div>
                      <label className="mt-5 block text-sm font-semibold text-slate-800">Nouvelle adresse e-mail<input type="email" autoComplete="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100" /></label>
                      <label className="mt-4 block text-sm font-semibold text-slate-800">Mot de passe actuel<input type="password" autoComplete="current-password" value={emailCurrentPassword} onChange={(event) => setEmailCurrentPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100" /></label>
                      <DromapButton className="mt-4" onClick={() => void saveEmailChange()} disabled={working || !newEmail}>Changer l’adresse e-mail</DromapButton>
                    </section>
                    <section className="rounded-2xl border border-slate-200 p-5 sm:p-6">
                      <h3 className="font-black text-slate-950">Changer le mot de passe</h3><p className="mt-1 text-sm leading-6 text-slate-600">Choisis un nouveau mot de passe d’au moins 8 caractères.</p>
                      <label className="mt-5 block text-sm font-semibold text-slate-800">Mot de passe actuel<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100" /></label>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold text-slate-800">Nouveau mot de passe<input type="password" minLength={8} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100" /></label><label className="block text-sm font-semibold text-slate-800">Confirmer le mot de passe<input type="password" minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100" /></label></div>
                      <DromapButton className="mt-4" onClick={() => void savePassword()} disabled={working || !newPassword}>Modifier le mot de passe</DromapButton>
                    </section>
                    <section className="rounded-2xl border border-red-200 bg-red-50/40 p-5 sm:p-6"><h3 className="font-black text-red-900">Supprimer le compte</h3><p className="mt-2 text-sm leading-6 text-slate-700">Cette action supprime définitivement ton compte, tes projets en ligne et ta bibliothèque personnelle. Elle est irréversible.</p><DromapButton variant="danger" className="mt-4" onClick={() => setDeleteOpen(true)}>Supprimer mon compte</DromapButton></section>
                  </div>
                ) : null}
              </main>
            </div>
          </div>
        </div>

        <DromapDialog
          open={deleteOpen}
          title="Supprimer définitivement le compte ?"
          description="Tous les projets et les éléments personnels enregistrés en ligne avec ce compte seront supprimés."
          onClose={() => { setDeleteOpen(false); setDeleteConfirmation(""); setDeleteCurrentPassword(""); }}
          footer={
            <>
              <DromapButton onClick={() => setDeleteOpen(false)}>Annuler</DromapButton>
              <DromapButton variant="danger" disabled={working || deleteConfirmation !== "SUPPRIMER" || !deleteCurrentPassword} onClick={async () => {
                setWorking(true); setError(null);
                const result = await deleteDromapAccount(deleteConfirmation, deleteCurrentPassword);
                setWorking(false);
                if (!result.ok) { setError(result.error ?? "Suppression du compte impossible."); setDeleteOpen(false); return; }
                useEditorCustomMarkersStore.getState().replaceCustomMarkers([]);
                useEditorLayersStore.getState().replaceSavedLayers([]);
                useEditorGeoJsonLayersStore.getState().replaceSavedGeoJsonLayers([]);
                if (typeof window !== "undefined") {
                  window.localStorage.removeItem("dromap-personal-library-sync-v1");
                  if (accountUserId) window.localStorage.removeItem(`dromap-personal-library-sync-v2:${accountUserId}`);
                  window.localStorage.removeItem("dromap-personal-library-local-owner-v1");
                }
                forgetAccountLocally(); router.replace("/dashboard");
              }}>Supprimer définitivement</DromapButton>
            </>
          }
        >
          <label className="block text-sm font-semibold text-slate-800">Mot de passe actuel<input type="password" autoComplete="current-password" value={deleteCurrentPassword} onChange={(event) => setDeleteCurrentPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-red-300 px-3 py-2.5 outline-none focus:border-red-500 focus:ring-4 focus:ring-red-100" /></label>
          <p className="mt-4 text-sm leading-6 text-slate-700">Saisis <strong>SUPPRIMER</strong> pour confirmer.</p>
          <input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} className="mt-3 w-full rounded-xl border border-red-300 bg-white px-3 py-2.5 font-semibold text-slate-950 caret-red-600 outline-none placeholder:text-slate-400 focus:border-red-500 focus:ring-4 focus:ring-red-100" autoFocus />
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
