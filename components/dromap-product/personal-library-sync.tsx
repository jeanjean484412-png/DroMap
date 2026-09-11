"use client";

import { useEffect, useRef } from "react";

import {
  fetchRemoteLibraryManifest,
  fetchRemotePersonalLibrary,
  putRemotePersonalLibrary,
  RemoteLibraryConflictError,
  type DromapLibraryTombstones,
  type DromapPersonalLibraryPayload,
} from "@/lib/dromap/remote-library";
import { useDromapProductStore } from "@/stores/dromap-product";
import {
  useEditorCustomMarkersStore,
  type DroMapCustomMarkerDefinition,
} from "@/stores/editor-custom-markers";
import {
  useEditorLayersStore,
  type DroMapSavedLayer,
} from "@/stores/editor-layers";
import {
  useEditorGeoJsonLayersStore,
  type DromapSavedGeoJsonLayer,
} from "@/stores/editor-geojson-layers";

const LIBRARY_SYNC_META_KEY_PREFIX = "dromap-personal-library-sync-v3";
const LEGACY_LIBRARY_SYNC_META_KEY = "dromap-personal-library-sync-v2";
const LIBRARY_LOCAL_OWNER_KEY = "dromap-personal-library-local-owner-v1";
const SAVED_LAYERS_STORAGE_KEY = "dromap-editor-test-saved-layers-v1";
const SAVED_GEOJSON_LAYERS_STORAGE_KEY = "dromap-editor-test-saved-geojson-layers-v1";
const REMOTE_CHECK_INTERVAL_MS = 120_000;
const REMOTE_CHECK_THROTTLE_MS = 45_000;
const REMOTE_RETRY_AFTER_FAILURE_MS = 30_000;
const lastRemoteCheckAtByOwner = new Map<string, number>();

type LocalLibrarySyncMeta = {
  remoteRevision: string | null;
  updatedAt: string;
  tombstones: DromapLibraryTombstones;
  syncedSignature: string;
};

function emptyTombstones(): DromapLibraryTombstones {
  return { customMarkers: {}, savedLayers: {}, savedGeoJsonLayers: {} };
}

function nowIso() {
  return new Date().toISOString();
}

function metaStorageKey(ownerId: string) {
  return `${LIBRARY_SYNC_META_KEY_PREFIX}:${ownerId}`;
}

function normalizeMeta(parsed: Partial<LocalLibrarySyncMeta> | null | undefined): LocalLibrarySyncMeta {
  const tombstones = parsed?.tombstones && typeof parsed.tombstones === "object"
    ? parsed.tombstones
    : emptyTombstones();
  return {
    remoteRevision: typeof parsed?.remoteRevision === "string" ? parsed.remoteRevision : null,
    updatedAt: typeof parsed?.updatedAt === "string" ? parsed.updatedAt : "",
    syncedSignature: typeof parsed?.syncedSignature === "string" ? parsed.syncedSignature : "",
    tombstones: {
      customMarkers: tombstones.customMarkers ?? {},
      savedLayers: tombstones.savedLayers ?? {},
      savedGeoJsonLayers: tombstones.savedGeoJsonLayers ?? {},
    },
  };
}

function readMeta(ownerId: string): LocalLibrarySyncMeta {
  if (typeof window === "undefined") return normalizeMeta(null);
  try {
    const key = metaStorageKey(ownerId);
    let raw = window.localStorage.getItem(key);
    if (!raw) raw = window.localStorage.getItem(`${LEGACY_LIBRARY_SYNC_META_KEY}:${ownerId}`);
    return raw ? normalizeMeta(JSON.parse(raw) as Partial<LocalLibrarySyncMeta>) : normalizeMeta(null);
  } catch {
    return normalizeMeta(null);
  }
}

function writeMeta(ownerId: string, meta: LocalLibrarySyncMeta) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(metaStorageKey(ownerId), JSON.stringify(meta));
  } catch {
    // Le fonctionnement de l’éditeur ne dépend pas de ces métadonnées.
  }
}

function itemTimestamp(item: DroMapCustomMarkerDefinition | DroMapSavedLayer | DromapSavedGeoJsonLayer) {
  if ("updatedAt" in item && typeof item.updatedAt === "string" && item.updatedAt) return item.updatedAt;
  if ("savedAt" in item && typeof item.savedAt === "string") return item.savedAt;
  return "";
}

function newestTimestamp(...values: string[]) {
  return values.filter(Boolean).sort().at(-1) ?? "";
}

function stableSignature(payload: DromapPersonalLibraryPayload) {
  // La date globale updatedAt est volontairement exclue : elle ne doit pas
  // déclencher un upload si le contenu réel de la bibliothèque n’a pas changé.
  const source = JSON.stringify({
    customMarkers: payload.customMarkers,
    savedLayers: payload.savedLayers,
    savedGeoJsonLayers: payload.savedGeoJsonLayers,
    tombstones: payload.tombstones,
  });
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${source.length}:${(hash >>> 0).toString(36)}`;
}

function buildLocalPayload(meta: LocalLibrarySyncMeta): DromapPersonalLibraryPayload {
  const customMarkers = useEditorCustomMarkersStore.getState().customMarkers;
  const savedLayers = useEditorLayersStore.getState().savedLayers;
  const savedGeoJsonLayers = useEditorGeoJsonLayersStore.getState().savedGeoJsonLayers;
  const newestItem = newestTimestamp(
    ...customMarkers.map(itemTimestamp),
    ...savedLayers.map(itemTimestamp),
    ...savedGeoJsonLayers.map(itemTimestamp),
  );
  return {
    schemaVersion: 1,
    updatedAt: newestTimestamp(meta.updatedAt, newestItem) || nowIso(),
    customMarkers,
    savedLayers,
    savedGeoJsonLayers,
    tombstones: meta.tombstones,
  };
}

function mergeCollection<T extends { id: string }>(
  localItems: T[],
  remoteItems: T[],
  localTombstones: Record<string, string>,
  remoteTombstones: Record<string, string>,
) {
  const ids = new Set<string>([
    ...localItems.map((item) => item.id),
    ...remoteItems.map((item) => item.id),
    ...Object.keys(localTombstones),
    ...Object.keys(remoteTombstones),
  ]);
  const localMap = new Map(localItems.map((item) => [item.id, item] as const));
  const remoteMap = new Map(remoteItems.map((item) => [item.id, item] as const));
  const items: T[] = [];
  const tombstones: Record<string, string> = {};

  for (const id of ids) {
    const local = localMap.get(id);
    const remote = remoteMap.get(id);
    const localTime = local ? itemTimestamp(local as never) : "";
    const remoteTime = remote ? itemTimestamp(remote as never) : "";
    const tombstoneTime = newestTimestamp(localTombstones[id] ?? "", remoteTombstones[id] ?? "");
    const itemTime = newestTimestamp(localTime, remoteTime);

    if (tombstoneTime && (!itemTime || tombstoneTime.localeCompare(itemTime) >= 0)) {
      tombstones[id] = tombstoneTime;
      continue;
    }
    if (local && remote) items.push(localTime.localeCompare(remoteTime) >= 0 ? local : remote);
    else if (local) items.push(local);
    else if (remote) items.push(remote);
  }

  items.sort((a, b) => itemTimestamp(b as never).localeCompare(itemTimestamp(a as never)));
  return { items, tombstones };
}

function mergePayloads(
  local: DromapPersonalLibraryPayload,
  remote: DromapPersonalLibraryPayload,
): DromapPersonalLibraryPayload {
  const customMarkers = mergeCollection(
    local.customMarkers,
    remote.customMarkers ?? [],
    local.tombstones.customMarkers,
    remote.tombstones?.customMarkers ?? {},
  );
  const savedLayers = mergeCollection(
    local.savedLayers,
    remote.savedLayers ?? [],
    local.tombstones.savedLayers,
    remote.tombstones?.savedLayers ?? {},
  );
  const savedGeoJsonLayers = mergeCollection(
    local.savedGeoJsonLayers,
    remote.savedGeoJsonLayers ?? [],
    local.tombstones.savedGeoJsonLayers,
    remote.tombstones?.savedGeoJsonLayers ?? {},
  );
  return {
    schemaVersion: 1,
    updatedAt: newestTimestamp(local.updatedAt, remote.updatedAt) || nowIso(),
    customMarkers: customMarkers.items,
    savedLayers: savedLayers.items,
    savedGeoJsonLayers: savedGeoJsonLayers.items,
    tombstones: {
      customMarkers: customMarkers.tombstones,
      savedLayers: savedLayers.tombstones,
      savedGeoJsonLayers: savedGeoJsonLayers.tombstones,
    },
  };
}

function applyPayload(payload: DromapPersonalLibraryPayload) {
  useEditorCustomMarkersStore.getState().replaceCustomMarkers(payload.customMarkers ?? []);
  useEditorLayersStore.getState().replaceSavedLayers(payload.savedLayers ?? []);
  useEditorGeoJsonLayersStore.getState().replaceSavedGeoJsonLayers(payload.savedGeoJsonLayers ?? []);
}

function collectRemovedIds<T extends { id: string }>(before: T[], after: T[]) {
  const afterIds = new Set(after.map((item) => item.id));
  return before.filter((item) => !afterIds.has(item.id)).map((item) => item.id);
}

export function DromapPersonalLibrarySync() {
  const userMode = useDromapProductStore((state) => state.userMode);
  const accountUserId = useDromapProductStore((state) => state.accountUserId);
  const initializedRef = useRef(false);
  const suppressRef = useRef(false);
  const syncTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const syncInFlightRef = useRef<Promise<void> | null>(null);
  const retryAfterRef = useRef(0);
  const rerunRef = useRef(false);
  const previousRef = useRef({
    customMarkers: [] as DroMapCustomMarkerDefinition[],
    savedLayers: [] as DroMapSavedLayer[],
    savedGeoJsonLayers: [] as DromapSavedGeoJsonLayer[],
  });

  useEffect(() => {
    if (userMode !== "authenticated" || !accountUserId) {
      initializedRef.current = false;
      if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
      syncTimerRef.current = null;
      retryTimerRef.current = null;
      retryAfterRef.current = 0;
      return;
    }

    const customStore = useEditorCustomMarkersStore.getState();
    customStore.setLibraryPersistenceEnabled(true);
    const previousOwner = window.localStorage.getItem(LIBRARY_LOCAL_OWNER_KEY);
    const ownerChanged = Boolean(previousOwner && previousOwner !== accountUserId);
    if (ownerChanged) {
      suppressRef.current = true;
      customStore.replaceCustomMarkers([]);
      useEditorLayersStore.getState().replaceSavedLayers([]);
      useEditorGeoJsonLayersStore.getState().replaceSavedGeoJsonLayers([]);
      window.localStorage.setItem(SAVED_LAYERS_STORAGE_KEY, "[]");
      window.localStorage.setItem(SAVED_GEOJSON_LAYERS_STORAGE_KEY, "[]");
      queueMicrotask(() => { suppressRef.current = false; });
    } else {
      customStore.loadFromStorage();
      useEditorLayersStore.getState().loadSavedLayersFromStorage();
      useEditorGeoJsonLayersStore.getState().loadSavedGeoJsonLayersFromStorage();
    }
    window.localStorage.setItem(LIBRARY_LOCAL_OWNER_KEY, accountUserId);

    let cancelled = false;
    const channel = typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(`dromap-personal-library:${accountUserId}`)
      : null;

    const saveMetaFromPayload = (revision: string, payload: DromapPersonalLibraryPayload) => {
      writeMeta(accountUserId, {
        remoteRevision: revision,
        updatedAt: payload.updatedAt,
        tombstones: payload.tombstones,
        syncedSignature: stableSignature(payload),
      });
    };

    const synchronize = async () => {
      if (!navigator.onLine) return;
      if (syncInFlightRef.current) {
        rerunRef.current = true;
        return syncInFlightRef.current;
      }

      const task = (async () => {
        do {
          rerunRef.current = false;
          let meta = readMeta(accountUserId);
          let localPayload = buildLocalPayload(meta);
          const localSignature = stableSignature(localPayload);
          const localChangedBeforeFetch = localSignature !== meta.syncedSignature;
          const lastRemoteCheckAt = lastRemoteCheckAtByOwner.get(accountUserId) ?? 0;

          // Le bootstrap est remonté sur plusieurs routes. Si rien n’a changé
          // localement, ne pas refaire immédiatement le même aller-retour Supabase.
          if (!localChangedBeforeFetch && Date.now() - lastRemoteCheckAt < REMOTE_CHECK_THROTTLE_MS) {
            continue;
          }

          try {
            if (Date.now() < retryAfterRef.current) {
              continue;
            }

            // Quand la bibliothèque locale a changé et qu'on connaît déjà la
            // révision distante, tenter directement l'upload optimiste. Avec le
            // verrou mono-appareil, le GET préalable du manifeste est inutile
            // dans le cas normal. Un 409 retombe sur le merge de sécurité plus bas.
            if (localChangedBeforeFetch && meta.remoteRevision) {
              const uploaded = await putRemotePersonalLibrary(localPayload, meta.remoteRevision);
              saveMetaFromPayload(uploaded.revision, localPayload);
              retryAfterRef.current = 0;
              channel?.postMessage({ type: "remote-updated", revision: uploaded.revision });
              continue;
            }

            const manifest = await fetchRemoteLibraryManifest();
            lastRemoteCheckAtByOwner.set(accountUserId, Date.now());
            retryAfterRef.current = 0;
            if (cancelled) return;

            if (!manifest) {
              const created = await putRemotePersonalLibrary(localPayload, null);
              saveMetaFromPayload(created.revision, localPayload);
              channel?.postMessage({ type: "remote-updated", revision: created.revision });
              continue;
            }

            const remoteChanged = manifest.revision !== meta.remoteRevision;
            const localChanged = localSignature !== meta.syncedSignature;

            if (!remoteChanged && !localChanged) continue;

            if (!remoteChanged && localChanged) {
              const uploaded = await putRemotePersonalLibrary(localPayload, manifest.revision);
              saveMetaFromPayload(uploaded.revision, localPayload);
              channel?.postMessage({ type: "remote-updated", revision: uploaded.revision });
              continue;
            }

            const remote = await fetchRemotePersonalLibrary(manifest);
            if (!remote || cancelled) return;
            const merged = mergePayloads(localPayload, remote.payload);
            suppressRef.current = true;
            applyPayload(merged);
            queueMicrotask(() => { suppressRef.current = false; });

            if (stableSignature(merged) === stableSignature(remote.payload)) {
              saveMetaFromPayload(remote.manifest.revision, merged);
              continue;
            }

            const uploaded = await putRemotePersonalLibrary(merged, remote.manifest.revision);
            saveMetaFromPayload(uploaded.revision, merged);
            channel?.postMessage({ type: "remote-updated", revision: uploaded.revision });
          } catch (error) {
            if (error instanceof RemoteLibraryConflictError && error.current) {
              try {
                const latest = await fetchRemotePersonalLibrary(error.current);
                if (latest) {
                  localPayload = mergePayloads(localPayload, latest.payload);
                  suppressRef.current = true;
                  applyPayload(localPayload);
                  queueMicrotask(() => { suppressRef.current = false; });
                  const manifest = await putRemotePersonalLibrary(localPayload, latest.manifest.revision);
                  saveMetaFromPayload(manifest.revision, localPayload);
                  retryAfterRef.current = 0;
                  channel?.postMessage({ type: "remote-updated", revision: manifest.revision });
                  continue;
                }
              } catch {
                // Une nouvelle tentative sera faite automatiquement plus tard.
              }
            }

            retryAfterRef.current = Date.now() + REMOTE_RETRY_AFTER_FAILURE_MS;
            if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
            retryTimerRef.current = window.setTimeout(() => {
              retryTimerRef.current = null;
              if (!cancelled && navigator.onLine) void synchronize();
            }, REMOTE_RETRY_AFTER_FAILURE_MS);
          }
        } while (rerunRef.current && !cancelled);
      })();

      syncInFlightRef.current = task;
      try { await task; } finally { syncInFlightRef.current = null; }
    };

    const scheduleSync = () => {
      if (!initializedRef.current || suppressRef.current || cancelled) return;
      const before = previousRef.current;
      const current = {
        customMarkers: useEditorCustomMarkersStore.getState().customMarkers,
        savedLayers: useEditorLayersStore.getState().savedLayers,
        savedGeoJsonLayers: useEditorGeoJsonLayersStore.getState().savedGeoJsonLayers,
      };
      const meta = readMeta(accountUserId);
      const timestamp = nowIso();
      for (const id of collectRemovedIds(before.customMarkers, current.customMarkers)) meta.tombstones.customMarkers[id] = timestamp;
      for (const id of collectRemovedIds(before.savedLayers, current.savedLayers)) meta.tombstones.savedLayers[id] = timestamp;
      for (const id of collectRemovedIds(before.savedGeoJsonLayers, current.savedGeoJsonLayers)) meta.tombstones.savedGeoJsonLayers[id] = timestamp;
      meta.updatedAt = timestamp;
      writeMeta(accountUserId, meta);
      previousRef.current = current;
      if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = window.setTimeout(() => {
        syncTimerRef.current = null;
        void synchronize();
      }, 800);
    };

    const unsubscribeMarkers = useEditorCustomMarkersStore.subscribe((state, previous) => {
      if (state.customMarkers !== previous.customMarkers) scheduleSync();
    });
    const unsubscribeLayers = useEditorLayersStore.subscribe((state, previous) => {
      if (state.savedLayers !== previous.savedLayers) scheduleSync();
    });
    const unsubscribeGeoJson = useEditorGeoJsonLayersStore.subscribe((state, previous) => {
      if (state.savedGeoJsonLayers !== previous.savedGeoJsonLayers) scheduleSync();
    });

    void (async () => {
      await synchronize();
      if (cancelled) return;
      previousRef.current = {
        customMarkers: useEditorCustomMarkersStore.getState().customMarkers,
        savedLayers: useEditorLayersStore.getState().savedLayers,
        savedGeoJsonLayers: useEditorGeoJsonLayersStore.getState().savedGeoJsonLayers,
      };
      initializedRef.current = true;
    })();

    const handleOnline = () => {
      retryAfterRef.current = 0;
      lastRemoteCheckAtByOwner.set(accountUserId, 0);
      void synchronize();
    };
    const handleFocus = () => {
      if (document.visibilityState === "visible") void synchronize();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void synchronize();
    };
    if (channel) channel.onmessage = () => {
      lastRemoteCheckAtByOwner.set(accountUserId, 0);
      void synchronize();
    };
    const remotePoll = window.setInterval(() => {
      if (document.visibilityState === "visible") void synchronize();
    }, REMOTE_CHECK_INTERVAL_MS);

    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      unsubscribeMarkers();
      unsubscribeLayers();
      unsubscribeGeoJson();
      window.clearInterval(remotePoll);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      channel?.close();
      if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
    };
  }, [accountUserId, userMode]);

  return null;
}
