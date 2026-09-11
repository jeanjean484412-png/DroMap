"use client";

import { useEffect, type ReactNode } from "react";
import { useDromapProductStore } from "@/stores/dromap-product";
import { resolveDromapPreferences } from "@/lib/dromap/preferences";
import { DromapPersonalLibrarySync } from "./personal-library-sync";
import { DromapSingleDeviceGuard } from "./single-device-guard";

import { DromapPageSkeleton } from "@/components/dromap-ui/page-skeleton";
let productRemoteRefreshInFlight: Promise<boolean> | null = null;
let lastProductRemoteRefreshAt = 0;
let productRemoteRefreshBackoffUntil = 0;
const PRODUCT_REMOTE_REFRESH_MIN_INTERVAL_MS = 60_000;
const PRODUCT_REMOTE_REFRESH_FAILURE_BACKOFF_MS = 45_000;

export function DromapProductBootstrap({ children }: { children: ReactNode }) {
  const hydrated = useDromapProductStore((state) => state.hydrated);
  const bootstrap = useDromapProductStore((state) => state.bootstrap);
  const userMode = useDromapProductStore((state) => state.userMode);
  const accountPreferences = useDromapProductStore((state) => state.accountPreferences);
  const refreshRemoteProjects = useDromapProductStore((state) => state.refreshRemoteProjects);
  const syncAllProjects = useDromapProductStore((state) => state.syncAllProjects);
  const purgeExpiredTrash = useDromapProductStore((state) => state.purgeExpiredTrash);
  const flushPersistence = useDromapProductStore((state) => state.flushPersistence);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!hydrated || typeof document === "undefined") return;
    const { reduceMotion } = resolveDromapPreferences(accountPreferences);
    document.documentElement.classList.toggle("dromap-reduce-motion", reduceMotion);
  }, [accountPreferences, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof navigator === "undefined" || !navigator.storage?.persist) return;
    // Le cache IndexedDB est le filet de sécurité local de DroMap, notamment hors ligne.
    // Demander un stockage persistant réduit le risque qu'un navigateur le purge sous
    // pression de stockage. L'appel reste silencieux si le navigateur refuse ou ne le
    // prend pas en charge.
    void navigator.storage.persist().catch(() => false);
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || userMode !== "authenticated") return;

    const refreshRemoteOnce = (force = false) => {
      if (!navigator.onLine) return Promise.resolve(false);
      const now = Date.now();
      if (!force && now < productRemoteRefreshBackoffUntil) {
        return productRemoteRefreshInFlight ?? Promise.resolve(false);
      }
      if (!force && now - lastProductRemoteRefreshAt < PRODUCT_REMOTE_REFRESH_MIN_INTERVAL_MS) {
        return productRemoteRefreshInFlight ?? Promise.resolve(true);
      }
      if (productRemoteRefreshInFlight) return productRemoteRefreshInFlight;
      lastProductRemoteRefreshAt = now;
      const task = refreshRemoteProjects()
        .then((ok) => {
          productRemoteRefreshBackoffUntil = ok
            ? 0
            : Date.now() + PRODUCT_REMOTE_REFRESH_FAILURE_BACKOFF_MS;
          return ok;
        })
        .finally(() => {
          productRemoteRefreshInFlight = null;
        });
      productRemoteRefreshInFlight = task;
      return task;
    };

    const handleOnline = () => {
      purgeExpiredTrash();
      void (async () => {
        await refreshRemoteOnce(true);
        purgeExpiredTrash();
        await syncAllProjects();
      })();
    };
    const handleFocus = () => {
      purgeExpiredTrash();
      if (document.visibilityState === "visible") void refreshRemoteOnce().then(() => purgeExpiredTrash());
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        purgeExpiredTrash();
        void refreshRemoteOnce().then(() => purgeExpiredTrash());
      } else {
        // Les métadonnées (renommage, corbeille, préférences...) sont elles
        // aussi sécurisées quand l'onglet passe en arrière-plan.
        void flushPersistence();
      }
    };
    const handlePageHide = () => void flushPersistence();

    // Une application laissée ouverte plusieurs jours doit aussi faire disparaître
    // un projet dès la fin de sa période de restauration, sans attendre un rechargement.
    const retentionTimer = window.setInterval(purgeExpiredTrash, 60 * 60 * 1000);

    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(retentionTimer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [flushPersistence, hydrated, purgeExpiredTrash, refreshRemoteProjects, syncAllProjects, userMode]);

  if (!hydrated) {
    return <DromapPageSkeleton />;
  }

  return (
    <>
      {children}
      <DromapPersonalLibrarySync />
      <DromapSingleDeviceGuard />
    </>
  );
}