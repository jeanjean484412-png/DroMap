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
import { useDromapProductStore } from "@/stores/dromap-product";
import { useEditorFeaturesStore } from "@/stores/editor-features";
import { useEditorLayersStore } from "@/stores/editor-layers";
import { useEditorGeoJsonLayersStore } from "@/stores/editor-geojson-layers";
import { useEditorWorkspaceStore } from "@/stores/editor-workspace";
import { useEditorBasemapStore } from "@/stores/editor-basemap";
import { useEditorMapLabelsStore } from "@/stores/editor-map-labels";
import { useEditorCustomMarkersStore } from "@/stores/editor-custom-markers";
import { useEditorExportStore } from "@/stores/editor-export";

type SaveReason = "manual" | "automatic" | "navigation" | "unload";

type ProjectSaveContextValue = {
  saveNow: (reason?: SaveReason) => Promise<void>;
};

const ProjectSaveContext = createContext<ProjectSaveContextValue>({
  saveNow: async () => undefined,
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
  const mountedAtRef = useRef(Date.now());
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const persistencePendingRef = useRef(0);
  const changeGenerationRef = useRef(0);
  const countedGenerationRef = useRef(0);
  const checkpointedGenerationRef = useRef(0);

  const enqueuePersistence = useCallback((task: () => Promise<void>) => {
    persistencePendingRef.current += 1;
    const run = persistenceQueueRef.current.then(task, task);
    persistenceQueueRef.current = run
      .catch(() => undefined)
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
      if (isTourSimulationActive()) return;

      markProjectSaving(projectId);
      if (reason !== "unload") {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 40));
      }

      const generation = generationOverride ?? changeGenerationRef.current;
      const snapshot = snapshotOverride ?? createDromapEditorProjectSnapshot();
      await saveProjectSnapshot(projectId, snapshot);
      checkpointedGenerationRef.current = Math.max(
        checkpointedGenerationRef.current,
        generation,
      );

      if (reason === "manual" || reason === "navigation") {
        // La miniature est utile au dashboard mais ne doit jamais bloquer une
        // sauvegarde locale ni le retour vers une autre page.
        void createDromapProjectThumbnailDataUrl()
          .then((thumbnailDataUrl) => {
            if (thumbnailDataUrl) {
              setProjectThumbnail(projectId, thumbnailDataUrl);
            }
          })
          .catch((thumbnailError) => {
            console.warn(
              "DroMap : génération de la miniature impossible.",
              thumbnailError,
            );
          });
      }
    },
    [markProjectSaving, projectId, saveProjectSnapshot, setProjectThumbnail],
  );

  const saveNow = useCallback(
    async (reason: SaveReason = "manual") => {
      restoreTourSimulationBeforePersistence();
      if (isTourSimulationActive()) return;

      if (gestureTimerRef.current !== null) {
        window.clearTimeout(gestureTimerRef.current);
        gestureTimerRef.current = null;
      }

      // Une navigation ou un clic sur Enregistrer doit inclure le dernier geste,
      // même s'il vient juste de se terminer et n'a pas encore atteint le délai
      // normal du checkpoint.
      countPendingGeneration();
      const generation = changeGenerationRef.current;

      await enqueuePersistence(() => performSave(reason, undefined, generation));
    },
    [countPendingGeneration, enqueuePersistence, performSave],
  );

  useEffect(() => {
    const project = useDromapProductStore
      .getState()
      .projects.find((item) => item.id === projectId);

    if (project?.thumbnailDataUrl) return;

    let cancelled = false;
    let timerId: number | null = null;

    const generateWhenStable = () => {
      if (cancelled) return;
      if (isTourSimulationActive()) {
        timerId = window.setTimeout(generateWhenStable, 700);
        return;
      }

      void createDromapProjectThumbnailDataUrl()
        .then((thumbnailDataUrl) => {
          if (!cancelled && thumbnailDataUrl) {
            setProjectThumbnail(projectId, thumbnailDataUrl);
          }
        })
        .catch((thumbnailError) => {
          console.warn(
            "DroMap : première miniature impossible.",
            thumbnailError,
          );
        });
    };

    timerId = window.setTimeout(generateWhenStable, 1400);
    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [projectId, setProjectThumbnail]);

  useEffect(() => {
    const checkpointCurrentEditor = (
      generation: number,
      triggerAutomaticSave: boolean,
    ) => {
      if (isTourSimulationActive()) return;
      const snapshot = createDromapEditorProjectSnapshot();

      void enqueuePersistence(async () => {
        await checkpointProjectSnapshot(projectId, snapshot);
        checkpointedGenerationRef.current = Math.max(
          checkpointedGenerationRef.current,
          generation,
        );

        const project = useDromapProductStore
          .getState()
          .projects.find((item) => item.id === projectId);
        if (triggerAutomaticSave && (project?.pendingChanges ?? 0) >= 5) {
          await performSave("automatic", snapshot, generation);
        }
      });
    };

    const scheduleSignificantChange = () => {
      if (isTourSimulationActive()) return;
      if (Date.now() - mountedAtRef.current < 900) return;

      changeGenerationRef.current += 1;
      if (gestureTimerRef.current !== null) {
        window.clearTimeout(gestureTimerRef.current);
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
          state.workspaceBasemapBaseZoom !== previous.workspaceBasemapBaseZoom
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
          await checkpointProjectSnapshot(projectId, snapshot);
          checkpointedGenerationRef.current = Math.max(
            checkpointedGenerationRef.current,
            generation,
          );
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
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") checkpointBeforeLeaving();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      unsubscribeFeatures();
      unsubscribeLayers();
      unsubscribeGeoJson();
      unsubscribeWorkspace();
      unsubscribeBasemap();
      unsubscribeLabels();
      unsubscribeMarkers();
      unsubscribeExport();
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
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
