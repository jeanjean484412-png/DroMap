"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

import { createDromapEditorProjectSnapshot } from "@/lib/dromap/editor-project-persistence";
import { createDromapProjectThumbnailDataUrl } from "@/lib/dromap/project-thumbnail";
import { retainOpenEditorProject, useDromapProductStore } from "@/stores/dromap-product";
import { useEditorFeaturesStore } from "@/stores/editor-features";
import { useEditorLayersStore } from "@/stores/editor-layers";
import { useEditorGeoJsonLayersStore } from "@/stores/editor-geojson-layers";
import { useEditorWorkspaceStore } from "@/stores/editor-workspace";
import { useEditorBasemapStore } from "@/stores/editor-basemap";
import { useEditorMapLabelsStore } from "@/stores/editor-map-labels";
import { useEditorCustomMarkersStore } from "@/stores/editor-custom-markers";
import { useEditorToolShortcutsStore } from "@/stores/editor-tool-shortcuts";
import { useEditorExportStore } from "@/stores/editor-export";

type SaveReason = "manual" | "automatic" | "navigation" | "unload";
type ThumbnailSnapshot = Parameters<typeof createDromapProjectThumbnailDataUrl>[0];

const latestThumbnailJobs = new Map<string, object>();

type ProjectSaveContextValue = {
  saveNow: (reason?: SaveReason) => Promise<boolean>;
};

const ProjectSaveContext = createContext<ProjectSaveContextValue>({
  saveNow: async () => true,
});

function isTourSimulationActive() {
  return (
    typeof document !== "undefined" &&
    document.documentElement.dataset.dromapTourSimulation === "true"
  );
}

function restoreTourSimulationBeforePersistence() {
  if (typeof window === "undefined" || !isTourSimulationActive()) return;
  window.dispatchEvent(new Event("dromap:tour-restore-simulation"));
}

function exportStateChanged(
  current: ReturnType<typeof useEditorExportStore.getState>,
  previous: ReturnType<typeof useEditorExportStore.getState>,
) {
  const ignored = new Set(["isExportPanelOpen", "isImportPanelOpen"]);
  return Object.keys(current).some((key) => {
    if (ignored.has(key)) return false;
    const typedKey = key as keyof typeof current;
    return current[typedKey] !== previous[typedKey];
  });
}

export function DromapProjectAutosaveProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const markProjectDirty = useDromapProductStore(
    (state) => state.markProjectDirty,
  );
  const markProjectSaving = useDromapProductStore(
    (state) => state.markProjectSaving,
  );
  const checkpointProjectSnapshot = useDromapProductStore(
    (state) => state.checkpointProjectSnapshot,
  );
  const saveProjectSnapshot = useDromapProductStore(
    (state) => state.saveProjectSnapshot,
  );
  const flushPersistence = useDromapProductStore(
    (state) => state.flushPersistence,
  );
  const setProjectThumbnail = useDromapProductStore(
    (state) => state.setProjectThumbnail,
  );

  const gestureTimerRef = useRef<number | null>(null);
  const mountedAtRef = useRef(0);
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const persistencePendingRef = useRef(0);
  const changeGenerationRef = useRef(0);
  const countedGenerationRef = useRef(0);
  const checkpointedGenerationRef = useRef(0);

  const generateThumbnail = useCallback((
    snapshot?: ThumbnailSnapshot,
    canPublish: () => boolean = () => true,
  ) => {
    const job = {};
    latestThumbnailJobs.set(projectId, job);
    void createDromapProjectThumbnailDataUrl(snapshot)
      .then((dataUrl) => {
        if (dataUrl && canPublish() && latestThumbnailJobs.get(projectId) === job) {
          setProjectThumbnail(projectId, dataUrl);
        }
      })
      .catch((error) => console.warn("DroMap : génération de la miniature impossible.", error))
      .finally(() => {
        if (latestThumbnailJobs.get(projectId) === job) latestThumbnailJobs.delete(projectId);
      });
  }, [projectId, setProjectThumbnail]);

  useEffect(() => {
    if (mountedAtRef.current === 0) mountedAtRef.current = Date.now();
  }, []);

  useEffect(() => retainOpenEditorProject(projectId), [projectId]);

  const enqueuePersistence = useCallback(<T,>(task: () => Promise<T>) => {
    persistencePendingRef.current += 1;
    const run = persistenceQueueRef.current.then(task, task);
    persistenceQueueRef.current = run
      .then(() => undefined, () => undefined)
      .finally(() => {
        persistencePendingRef.current = Math.max(
          0,
          persistencePendingRef.current - 1,
        );
      });
    return run;
  }, []);

  const countPendingGeneration = useCallback(() => {
    const generation = changeGenerationRef.current;
    if (generation <= countedGenerationRef.current) {
      return useDromapProductStore
        .getState()
        .projects.find((item) => item.id === projectId)?.pendingChanges ?? 0;
    }

    countedGenerationRef.current = generation;
    return markProjectDirty(projectId);
  }, [markProjectDirty, projectId]);

  const performSave = useCallback(
    async (
      reason: SaveReason,
      snapshotOverride?: ReturnType<typeof createDromapEditorProjectSnapshot>,
      generationOverride?: number,
    ) => {
      // Les états fictifs du tutoriel ne doivent jamais entrer dans une sauvegarde.
      if (isTourSimulationActive()) return true;

      markProjectSaving(projectId);
      if (reason === "manual" || reason === "navigation") {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 40));
      }

      const generation = generationOverride ?? changeGenerationRef.current;
      const snapshot = snapshotOverride ?? createDromapEditorProjectSnapshot();
      if (!(await saveProjectSnapshot(projectId, snapshot))) return false;
      checkpointedGenerationRef.current = Math.max(
        checkpointedGenerationRef.current,
        generation,
      );

      if (reason === "manual" || reason === "navigation") {
        // La miniature est utile au dashboard mais ne doit jamais bloquer une
        // sauvegarde locale ni le retour vers une autre page.
        generateThumbnail(snapshot);
      }
      return true;
    },
    [generateThumbnail, markProjectSaving, projectId, saveProjectSnapshot],
  );

  const saveNow = useCallback(
    async (reason: SaveReason = "manual") => {
      restoreTourSimulationBeforePersistence();
      if (isTourSimulationActive()) return true;

      if (gestureTimerRef.current !== null) {
        window.clearTimeout(gestureTimerRef.current);
        gestureTimerRef.current = null;
      }

      // Une navigation ou un clic sur Enregistrer doit inclure le dernier geste,
      // même s'il vient juste de se terminer et n'a pas encore atteint le délai
      // normal du checkpoint.
      countPendingGeneration();
      const generation = changeGenerationRef.current;

      return enqueuePersistence(() => performSave(reason, undefined, generation));
    },
    [countPendingGeneration, enqueuePersistence, performSave],
  );

  useEffect(() => {
    const hasThumbnail = () => Boolean(useDromapProductStore
      .getState()
      .projects.find((item) => item.id === projectId)?.thumbnailDataUrl);

    if (hasThumbnail()) return;

    let cancelled = false;
    let timerId: number | null = null;
    let idleId: number | null = null;

    const generateWhenStable = () => {
      if (cancelled || hasThumbnail()) return;
      if (isTourSimulationActive() || latestThumbnailJobs.has(projectId)) {
        timerId = window.setTimeout(generateWhenStable, 700);
        return;
      }

      generateThumbnail(undefined, () => !cancelled);
    };

    timerId = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(generateWhenStable, { timeout: 1000 });
      } else {
        generateWhenStable();
      }
    }, 1400);
    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
      if (idleId !== null) window.cancelIdleCallback(idleId);
    };
  }, [generateThumbnail, projectId]);

  useEffect(() => {
    const checkpointCurrentEditor = (
      generation: number,
      triggerAutomaticSave: boolean,
    ) => {
      if (isTourSimulationActive()) return;
      const snapshot = createDromapEditorProjectSnapshot();

      void enqueuePersistence(async () => {
        if (generation <= checkpointedGenerationRef.current) return;
        const project = useDromapProductStore
          .getState()
          .projects.find((item) => item.id === projectId);
        if (triggerAutomaticSave && (project?.pendingChanges ?? 0) >= 5 && project?.status !== "trashed") {
          await performSave("automatic", snapshot, generation);
        }
        if (generation > checkpointedGenerationRef.current && await checkpointProjectSnapshot(projectId, snapshot)) {
          checkpointedGenerationRef.current = generation;
        }
      });
    };

    const scheduleSignificantChange = () => {
      if (isTourSimulationActive()) return;
      if (Date.now() - mountedAtRef.current < 900) return;

      changeGenerationRef.current += 1;
      if (gestureTimerRef.current !== null) {
        window.clearTimeout(gestureTimerRef.current);
        countedGenerationRef.current = changeGenerationRef.current;
      } else {
        countPendingGeneration();
      }

      // Chaque geste terminé reçoit rapidement un checkpoint IndexedDB. Les
      // cinq changements restent la cadence normale d'envoi vers le cloud.
      gestureTimerRef.current = window.setTimeout(() => {
        gestureTimerRef.current = null;
        const generation = changeGenerationRef.current;
        const changeCount = countPendingGeneration();
        checkpointCurrentEditor(generation, changeCount >= 5);
      }, 500);
    };

    const unsubscribeFeatures = useEditorFeaturesStore.subscribe(
      (state, previous) => {
        if (state.features !== previous.features) scheduleSignificantChange();
      },
    );
    const unsubscribeLayers = useEditorLayersStore.subscribe(
      (state, previous) => {
        if (
          state.layers !== previous.layers ||
          state.activeLayerId !== previous.activeLayerId
        ) {
          scheduleSignificantChange();
        }
      },
    );
    const unsubscribeGeoJson = useEditorGeoJsonLayersStore.subscribe(
      (state, previous) => {
        if (state.geoJsonLayers !== previous.geoJsonLayers) {
          scheduleSignificantChange();
        }
      },
    );
    const unsubscribeWorkspace = useEditorWorkspaceStore.subscribe(
      (state, previous) => {
        if (
          state.workspaceBounds !== previous.workspaceBounds ||
          state.workspaceBasemapZoom !== previous.workspaceBasemapZoom ||
          state.workspaceBasemapBaseZoom !== previous.workspaceBasemapBaseZoom ||
          (state.pendingFitToWorkspace && !previous.pendingFitToWorkspace)
        ) {
          scheduleSignificantChange();
        }
      },
    );
    const unsubscribeBasemap = useEditorBasemapStore.subscribe(
      (state, previous) => {
        if (
          state.basemapId !== previous.basemapId ||
          state.showCountryNeighborContext !==
            previous.showCountryNeighborContext
        ) {
          scheduleSignificantChange();
        }
      },
    );
    const unsubscribeLabels = useEditorMapLabelsStore.subscribe(
      (state, previous) => {
        if (
          state.showAllFeatureLabels !== previous.showAllFeatureLabels ||
          state.showAllGeoJsonFeatureLabels !==
            previous.showAllGeoJsonFeatureLabels ||
          state.featureMapLabelScale !== previous.featureMapLabelScale ||
          state.featureMapLabelOutlineWidth !==
            previous.featureMapLabelOutlineWidth
        ) {
          scheduleSignificantChange();
        }
      },
    );
    const unsubscribeMarkers = useEditorCustomMarkersStore.subscribe(
      (state, previous) => {
        if (state.customMarkers !== previous.customMarkers) {
          scheduleSignificantChange();
        }
      },
    );
    const unsubscribeShortcuts = useEditorToolShortcutsStore.subscribe(
      (state, previous) => {
        if (state.shortcuts !== previous.shortcuts) scheduleSignificantChange();
      },
    );
    const unsubscribeExport = useEditorExportStore.subscribe(
      (state, previous) => {
        if (exportStateChanged(state, previous)) scheduleSignificantChange();
      },
    );

    const checkpointBeforeLeaving = () => {
      restoreTourSimulationBeforePersistence();
      if (isTourSimulationActive()) return;

      if (gestureTimerRef.current !== null) {
        window.clearTimeout(gestureTimerRef.current);
        gestureTimerRef.current = null;
      }

      const generation = changeGenerationRef.current;
      if (generation > countedGenerationRef.current) {
        countPendingGeneration();
      }

      if (generation > checkpointedGenerationRef.current) {
        const snapshot = createDromapEditorProjectSnapshot();
        void enqueuePersistence(async () => {
          if (generation <= checkpointedGenerationRef.current) return;
          if (await checkpointProjectSnapshot(projectId, snapshot)) {
            checkpointedGenerationRef.current = Math.max(checkpointedGenerationRef.current, generation);
          }
        });
      } else {
        void enqueuePersistence(flushPersistence);
      }
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const hasUncheckpointedChanges =
        changeGenerationRef.current > checkpointedGenerationRef.current;
      const localWriteInProgress = persistencePendingRef.current > 0;

      checkpointBeforeLeaving();

      // Le navigateur garde la page quelques instants pendant son avertissement,
      // ce qui laisse à IndexedDB le temps de terminer le dernier checkpoint.
      // Aucun avertissement n'est affiché si tout est déjà sécurisé localement.
      if (hasUncheckpointedChanges || localWriteInProgress) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    const handlePageHide = () => checkpointBeforeLeaving();
    const handleConflictSave = (event: Event) => {
      const { projectId: requestedId, waitFor } = (event as CustomEvent<{
        projectId: string;
        waitFor: (saved: Promise<boolean>) => void;
      }>).detail;
      if (requestedId === projectId) waitFor(saveNow("automatic"));
    };
    const handleRemoteVersionAccepted = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== projectId) return;
      if (gestureTimerRef.current !== null) {
        window.clearTimeout(gestureTimerRef.current);
        gestureTimerRef.current = null;
      }
      checkpointedGenerationRef.current = changeGenerationRef.current;
      countedGenerationRef.current = changeGenerationRef.current;
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) useEditorWorkspaceStore.getState().cancelWorkspaceZoneModification();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") checkpointBeforeLeaving();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("dromap:project-remote-version-accepted", handleRemoteVersionAccepted);
    window.addEventListener("dromap:project-conflict-save", handleConflictSave);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      unsubscribeFeatures();
      unsubscribeLayers();
      unsubscribeGeoJson();
      unsubscribeWorkspace();
      unsubscribeBasemap();
      unsubscribeLabels();
      unsubscribeMarkers();
      unsubscribeShortcuts();
      unsubscribeExport();
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("dromap:project-remote-version-accepted", handleRemoteVersionAccepted);
      window.removeEventListener("dromap:project-conflict-save", handleConflictSave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      checkpointBeforeLeaving();
    };
  }, [
    checkpointProjectSnapshot,
    countPendingGeneration,
    enqueuePersistence,
    flushPersistence,
    performSave,
    projectId,
    saveNow,
  ]);

  const value = useMemo(() => ({ saveNow }), [saveNow]);

  return (
    <ProjectSaveContext.Provider value={value}>
      {children}
    </ProjectSaveContext.Provider>
  );
}

export function useDromapProjectSave() {
  return useContext(ProjectSaveContext);
}
