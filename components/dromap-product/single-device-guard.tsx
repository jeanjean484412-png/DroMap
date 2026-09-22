"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useDromapProductStore } from "@/stores/dromap-product";

const DEVICE_ID_KEY = "dromap-device-id-v1";
const HEARTBEAT_MS = 30_000;

function getDeviceId() {
  let value = window.localStorage.getItem(DEVICE_ID_KEY);
  if (value) return value;
  value = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `device:${crypto.randomUUID()}`
    : `device:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(DEVICE_ID_KEY, value);
  return value;
}

export function DromapSingleDeviceGuard() {
  const userMode = useDromapProductStore((state) => state.userMode);
  const accountUserId = useDromapProductStore((state) => state.accountUserId);
  const signOutAccount = useDromapProductStore((state) => state.signOutAccount);
  const refreshAccountSession = useDromapProductStore((state) => state.refreshAccountSession);
  const [blocked, setBlocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const deviceIdRef = useRef<string | null>(null);

  const claim = useCallback(async (heartbeat = false) => {
    if (userMode !== "authenticated" || !accountUserId) return;
    const deviceId = deviceIdRef.current ?? getDeviceId();
    deviceIdRef.current = deviceId;
    if (!heartbeat) setChecking(true);
    try {
      const response = await fetch("/api/dromap/account/device-session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, heartbeat, accountUserId }),
      });
      const payload = (await response.json().catch(() => null)) as { code?: unknown } | null;
      if (response.status === 409 && payload?.code === "ACCOUNT_SESSION_CHANGED") {
        setBlocked(false);
        await refreshAccountSession();
        return;
      }
      setBlocked(response.status === 409 && payload?.code === "DEVICE_LEASE_CONFLICT");
    } catch {
      // Une panne réseau ne verrouille pas DroMap : le mode hors ligne reste utilisable.
    } finally {
      if (!heartbeat) setChecking(false);
    }
  }, [accountUserId, refreshAccountSession, userMode]);

  const release = useCallback(async (keepalive = false) => {
    const deviceId = deviceIdRef.current;
    if (!deviceId || userMode !== "authenticated") return;
    try {
      await fetch("/api/dromap/account/device-session", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
        keepalive,
      });
    } catch {
      // Le bail expirera automatiquement si la fermeture coupe la requête.
    }
  }, [userMode]);


  useEffect(() => {
    if (userMode !== "authenticated") {
      setBlocked(false);
      return;
    }
    void claim(false);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void claim(true);
    }, HEARTBEAT_MS);
    const handleOnline = () => void claim(false);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void claim(false);
    };
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      // Ne pas libérer le bail à chaque changement de route : le bootstrap est
      // remonté page par page. Le bail est libéré lors d’une vraie déconnexion
      // et expire tout seul si le navigateur est fermé brutalement.
    };
  }, [claim, release, userMode]);

  if (!blocked) return null;

  return (
    <div className="fixed inset-0 z-[100000] grid place-items-center bg-slate-950/55 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/60 bg-white p-6 text-center shadow-lg">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-2xl">⚠</div>
        <h2 className="mt-4 text-xl font-black text-slate-950">Compte déjà ouvert ailleurs</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          DroMap autorise un seul appareil actif à la fois pour éviter les conflits de sauvegarde. Ferme DroMap sur l’autre appareil, puis réessaie ici.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button type="button" onClick={() => void claim(false)} disabled={checking} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-500 disabled:opacity-60">
            {checking ? "Vérification…" : "Réessayer"}
          </button>
          <button type="button" onClick={() => void (async () => { await release(); await signOutAccount(); })()} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}
