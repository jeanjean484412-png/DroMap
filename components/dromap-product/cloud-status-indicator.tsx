"use client";

import { useEffect, useMemo, useState } from "react";

import { useDromapProductStore } from "@/stores/dromap-product";

export function DromapCloudStatusIndicator({ compact = false }: { compact?: boolean }) {
  const userMode = useDromapProductStore((state) => state.userMode);
  const projects = useDromapProductStore((state) => state.projects);
  const lastSyncError = useDromapProductStore((state) => state.lastSyncError);
  const syncAllProjects = useDromapProductStore((state) => state.syncAllProjects);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const pendingCount = useMemo(
    () =>
      projects.filter(
        (project) =>
          project.status !== "trashed" &&
          (project.status === "sync-pending" ||
            project.status === "unsaved" ||
            project.pendingChanges > 0),
      ).length,
    [projects],
  );

  if (userMode === "guest") {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600"
        title="Ce projet est conservé sur cet appareil."
      >
        <span className="h-2 w-2 rounded-full bg-slate-400" aria-hidden="true" />
        {compact ? "Local" : "Enregistré sur cet appareil"}
      </span>
    );
  }

  const hasProblem = !online || pendingCount > 0 || Boolean(lastSyncError);
  const label = !online
    ? compact
      ? "Hors ligne"
      : "Hors ligne · sauvegarde locale"
    : pendingCount > 0
      ? compact
        ? `${pendingCount} en attente`
        : `${pendingCount} projet${pendingCount > 1 ? "s" : ""} à synchroniser`
      : lastSyncError
        ? compact
          ? "À resynchroniser"
          : "Synchronisation à reprendre"
        : compact
          ? "Synchronisé"
          : "Compte synchronisé";

  async function retrySync() {
    if (!online || working) return;
    setWorking(true);
    try {
      await syncAllProjects();
    } finally {
      setWorking(false);
    }
  }

  if (hasProblem && online) {
    return (
      <button
        type="button"
        onClick={() => void retrySync()}
        disabled={working}
        className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-800 transition hover:bg-amber-100 disabled:cursor-wait disabled:opacity-70"
        title={lastSyncError ?? "Cliquer pour relancer la synchronisation."}
      >
        <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
        {working ? "Synchronisation…" : label}
      </button>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
        online
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
      title={online ? "Tes changements enregistrés sont synchronisés en ligne." : "DroMap continue de conserver les changements sur cet appareil."}
    >
      <span
        className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-amber-500"}`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
