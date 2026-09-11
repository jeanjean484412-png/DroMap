"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { DromapProductBootstrap } from "./product-bootstrap";
import { DromapProductRuntimeProvider } from "./product-runtime";
import { DromapProjectAutosaveProvider } from "./project-autosave";
import { DromapProjectEditorTopbar } from "./project-editor-topbar";
import { DromapProjectInfoDialog } from "./project-info-dialog";
import { DromapEditorTour } from "./editor-tour";
import { DromapButton } from "@/components/dromap-ui/button";
import { EditorSurface } from "@/editor/editor-surface";
import {
  createBlankDromapEditorProjectSnapshot,
  createDromapEditorProjectSnapshot,
  restoreDromapEditorProjectSnapshot,
  type DromapEditorProjectSnapshot,
} from "@/lib/dromap/editor-project-persistence";
import { getDromapCapabilities, type DromapProject } from "@/lib/dromap/product";
import { createDromapLayer } from "@/stores/editor-layers";
import { useEditorBasemapStore } from "@/stores/editor-basemap";
import { useEditorCustomMarkersStore } from "@/stores/editor-custom-markers";
import { useEditorMapViewStore } from "@/stores/editor-map-view";
import { useEditorSelectionStore } from "@/stores/editor-selection";
import { useEditorWorkspaceStore } from "@/stores/editor-workspace";
import { useEditorExportStore } from "@/stores/editor-export";
import { useEditorFeaturesStore } from "@/stores/editor-features";
import {
  beginEditorHistorySession,
  completeEditorHistorySession,
  endEditorHistorySession,
  runWithoutEditorHistory,
} from "@/stores/editor-history-coordinator";
import { useDromapProductStore } from "@/stores/dromap-product";

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function clearTransientMapNavigationRequests() {
  /**
   * L’étape de création et l’éditeur montent deux instances successives de
   * MapViewController, mais les demandes de cadrage vivent dans des stores
   * Zustand globaux. Les identifiants consommés, eux, étaient conservés dans
   * des useRef locaux au composant.
   *
   * Conséquence : à l’ouverture de l’éditeur, la nouvelle instance rejouait
   * comme si elles étaient nouvelles :
   * - la demande de cadrage du fond déclenchée à l’étape « Fond de carte » ;
   * - la demande de cadrage provisoire utilisée pendant la sélection de zone.
   *
   * Le cadrage du fond est asynchrone. Il pouvait donc s’exécuter APRES le vrai
   * fitBounds de validation de la zone et écraser son zoom ainsi que le niveau
   * de détail verrouillé. C’est exactement pour cela que « Modifier la zone »
   * puis « Valider » corrigeait ensuite l’affichage : cette seconde validation
   * devenait enfin la dernière opération de cadrage.
   *
   * Ces demandes sont des commandes transitoires, pas des données de projet.
   * Elles doivent être supprimées avant de monter la carte de l’éditeur.
   */
  useEditorBasemapStore.setState({
    basemapFitRequestId: 0,
  });

  useEditorSelectionStore.setState({
    focusedSelectionRequest: null,
    workspaceRecenterRequest: null,
    mapBoundsFitRequest: null,
    objectsPanelRequest: null,
  });
}

function createFeatureId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `feature-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createSnapshotFromSetup(project: DromapProject): DromapEditorProjectSnapshot {
  const snapshot = createBlankDromapEditorProjectSnapshot(project.setup.basemapId);
  snapshot.workspaceBounds = project.setup.workspaceBounds
    ? cloneValue(project.setup.workspaceBounds)
    : null;
  /**
   * Ne pas transférer le zoom de la carte du parcours de création vers
   * l'éditeur comme s'il s'agissait déjà d'un cadrage d'édition.
   *
   * Même si la carte de l'étape Zone paraît correcte, son conteneur n'a pas
   * exactement les mêmes dimensions utiles que la carte de l'éditeur. Copier
   * son centre et son zoom numérique empêcherait MapViewController d'exécuter
   * la vraie validation de zone dans le viewport final.
   *
   * En laissant ces valeurs à null, restoreDromapEditorProjectSnapshot()
   * conserve pendingFitToWorkspace=true. À son montage, l'éditeur applique
   * donc exactement le même fitBounds et le même verrouillage de détail que
   * lorsque l'utilisateur clique sur « Modifier la zone », puis « Valider ».
   */
  snapshot.mapView = null;
  snapshot.workspaceBasemapBaseZoom = null;
  snapshot.workspaceBasemapZoom = null;

  const choice = project.setup.layerChoice;

  if (!choice || choice.kind === "empty") {
    return snapshot;
  }

  if (choice.kind === "none") {
    snapshot.layers = [];
    snapshot.activeLayerId = "";
    return snapshot;
  }

  if (choice.kind === "geojson") {
    snapshot.layers = [];
    snapshot.activeLayerId = "";
    snapshot.geoJsonLayers = [cloneValue(choice.geoJsonLayer)];
    return snapshot;
  }

  const targetLayer = createDromapLayer(choice.savedLayer.name, 1000);
  const idMap = new Map<string, string>();
  const features = choice.savedLayer.features.map((feature) => {
    const nextId = createFeatureId();
    idMap.set(feature.id, nextId);
    return {
      ...cloneValue(feature),
      id: nextId,
      properties: {
        ...cloneValue(feature.properties),
        layerId: targetLayer.id,
        locked: false,
        meta: { version: 1 as const },
      },
    };
  });

  snapshot.layers = [targetLayer];
  snapshot.activeLayerId = targetLayer.id;
  snapshot.features = features;

  if (choice.savedLayer.legend && snapshot.exportSettings) {
    snapshot.exportSettings.hiddenLegendFeatureIds = (
      choice.savedLayer.legend.hiddenFeatureIds ?? []
    )
      .map((id) => idMap.get(id))
      .filter((id): id is string => Boolean(id));
    snapshot.exportSettings.legendFeatureOrder = (
      choice.savedLayer.legend.featureOrder ?? []
    )
      .map((id) => idMap.get(id))
      .filter((id): id is string => Boolean(id));
    snapshot.exportSettings.legendGroupOrder = cloneValue(
      choice.savedLayer.legend.groupOrder ?? [],
    );
    snapshot.exportSettings.legendSectionOrder = cloneValue(
      choice.savedLayer.legend.sectionOrder ?? [],
    );
    snapshot.exportSettings.legendGroupLabels = cloneValue(
      choice.savedLayer.legend.groupLabels ?? {},
    );
    snapshot.exportSettings.legendGroupSections = cloneValue(
      choice.savedLayer.legend.groupSections ?? {},
    );
  }

  return snapshot;
}

function numberAlmostEqual(first: number, second: number, epsilon = 1e-6) {
  return Math.abs(first - second) <= epsilon;
}

function workspaceBoundsEqual(
  first: DromapEditorProjectSnapshot["workspaceBounds"],
  second: DromapProject["setup"]["workspaceBounds"],
) {
  if (first === second) return true;
  if (!first || !second) return false;

  return (
    numberAlmostEqual(first.southWest.lat, second.southWest.lat) &&
    numberAlmostEqual(first.southWest.lng, second.southWest.lng) &&
    numberAlmostEqual(first.northEast.lat, second.northEast.lat) &&
    numberAlmostEqual(first.northEast.lng, second.northEast.lng)
  );
}

function mapViewsEqual(
  first: DromapEditorProjectSnapshot["mapView"],
  second: DromapProject["setup"]["workspaceView"],
) {
  if (!first || !second) return false;

  return (
    numberAlmostEqual(first.center.lat, second.center.lat) &&
    numberAlmostEqual(first.center.lng, second.center.lng) &&
    numberAlmostEqual(first.zoom, second.zoom)
  );
}

/**
 * Les premières versions de la P0 ont enregistré dans editorSnapshot la vue
 * produite par l'étape de création. Cela neutralisait le pending fit de
 * l'éditeur et expliquait pourquoi une modification/revalidation manuelle de
 * la zone corrigeait immédiatement le zoom et le niveau de détail.
 *
 * Cette détection répare aussi les projets déjà créés avec cette ancienne
 * mécanique, tout en préservant les projets dont la vue a réellement été
 * calculée ou modifiée dans l'éditeur.
 */
function shouldValidateWorkspaceInEditor(
  project: DromapProject,
  snapshot: DromapEditorProjectSnapshot,
) {
  if (!project.setup.workspaceBounds || !snapshot.workspaceBounds) {
    return false;
  }

  // Nouveau projet : aucune vue d'éditeur ne peut encore être considérée
  // comme définitive.
  if (!project.editorSnapshot) {
    return true;
  }

  // Snapshot incomplet ou ancien : l'éditeur doit terminer lui-même la
  // validation plutôt que conserver un état de détail indéfini.
  if (
    !snapshot.mapView ||
    typeof snapshot.workspaceBasemapBaseZoom !== "number" ||
    !Number.isFinite(snapshot.workspaceBasemapBaseZoom) ||
    typeof snapshot.workspaceBasemapZoom !== "number" ||
    !Number.isFinite(snapshot.workspaceBasemapZoom)
  ) {
    return true;
  }

  // Migration ciblée des snapshots P0 qui ont simplement recopié la vue de
  // l'étape Zone. Une vraie vue d'éditeur différente n'est jamais écrasée.
  return (
    workspaceBoundsEqual(snapshot.workspaceBounds, project.setup.workspaceBounds) &&
    mapViewsEqual(snapshot.mapView, project.setup.workspaceView)
  );
}

function prepareSnapshotForEditor(
  project: DromapProject,
): {
  snapshot: DromapEditorProjectSnapshot;
  requiresEditorWorkspaceValidation: boolean;
} {
  const snapshot = project.editorSnapshot
    ? cloneValue(project.editorSnapshot)
    : createSnapshotFromSetup(project);
  const requiresEditorWorkspaceValidation = shouldValidateWorkspaceInEditor(
    project,
    snapshot,
  );

  if (requiresEditorWorkspaceValidation) {
    // Ces trois valeurs doivent rester null afin que la restauration laisse le
    // pending fit actif. MapViewController réalisera alors la validation dans
    // le vrai conteneur de l'éditeur et y verrouillera le détail du fond.
    snapshot.mapView = null;
    snapshot.workspaceBasemapBaseZoom = null;
    snapshot.workspaceBasemapZoom = null;
  }

  return { snapshot, requiresEditorWorkspaceValidation };
}

type EditorContentProps = {
  projectId: string;
  initialView?: "editor" | "render";
};

function EditorContent({
  projectId,
  initialView = "editor",
}: EditorContentProps) {
  const router = useRouter();
  const project = useDromapProductStore((state) =>
    state.projects.find((item) => item.id === projectId),
  );
  const userMode = useDromapProductStore((state) => state.userMode);
  const accountPlan = useDromapProductStore((state) => state.accountPlan);
  const saveProjectSnapshot = useDromapProductStore(
    (state) => state.saveProjectSnapshot,
  );
  const loadProject = useDromapProductStore((state) => state.loadProject);
  const setActiveProjectId = useDromapProductStore(
    (state) => state.setActiveProjectId,
  );
  const workspaceBasemapBaseZoom = useEditorWorkspaceStore(
    (state) => state.workspaceBasemapBaseZoom,
  );
  const currentMapView = useEditorMapViewStore(
    (state) => state.currentView,
  );
  const initializedProjectRef = useRef<string | null>(null);
  const loadingProjectRef = useRef<string | null>(null);
  const renderPanelOpenedRef = useRef(false);
  const renderPanelWasVisibleRef = useRef(false);
  const isExportPanelOpen = useEditorExportStore(
    (state) => state.isExportPanelOpen,
  );
  const [ready, setReady] = useState(false);
  const [mapPresentationReady, setMapPresentationReady] = useState(false);
  const [waitingForWorkspaceValidation, setWaitingForWorkspaceValidation] =
    useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    // Changer de projet ouvre une nouvelle session d'historique AVANT les effets
    // enfants. L'enregistrement reste suspendu jusqu'à la restauration complète
    // du snapshot : aucun effet tardif du projet précédent ne peut donc injecter
    // sa zone, ses calques ou ses objets dans Ctrl+Z du nouveau projet.
    beginEditorHistorySession(projectId);
    useEditorFeaturesStore.getState().resetHistory();
    return () => {
      useEditorFeaturesStore.getState().resetHistory();
      endEditorHistorySession(projectId);
    };
  }, [projectId]);

  useEffect(() => {
    if (!project || initializedProjectRef.current === project.id) return;

    // Les métadonnées du projet sont volontairement légères au bootstrap :
    // le snapshot complet vit dans IndexedDB (ou est récupéré depuis Supabase).
    // Sur un rafraîchissement dur, il faut donc charger ce contenu AVANT de
    // construire/restaurer le snapshot de l'éditeur. Sans cette étape, un
    // editorSnapshot null était interprété comme un nouveau projet vide, alors
    // qu'une navigation SPA conservait encore les objets en mémoire.
    if (project.contentLoaded === false) {
      if (loadingProjectRef.current === project.id) return;
      loadingProjectRef.current = project.id;
      setReady(false);
      setMapPresentationReady(false);
      setError(null);

      void loadProject(project.id).then((result) => {
        loadingProjectRef.current = null;
        if (!result.ok) {
          setError(result.error || "Le contenu enregistré du projet n’a pas pu être chargé.");
        }
      });
      return;
    }

    if (project.status === "trashed") {
      router.replace("/trash");
      return;
    }

    if (!project.setupComplete) {
      router.replace(`/projects/${project.id}/setup`);
      return;
    }

    try {
      setReady(false);
      setMapPresentationReady(false);
      setError(null);
      const customMarkersStore = useEditorCustomMarkersStore.getState();
      const customMarkerLibraryEnabled = getDromapCapabilities(
        userMode,
        accountPlan,
      ).canSaveCustomMarkersToLibrary;
      customMarkersStore.setLibraryPersistenceEnabled(
        customMarkerLibraryEnabled,
      );
      if (customMarkerLibraryEnabled) {
        customMarkersStore.loadFromStorage();
      } else {
        customMarkersStore.replaceCustomMarkers([]);
      }

      const {
        snapshot,
        requiresEditorWorkspaceValidation,
      } = prepareSnapshotForEditor(project);

      // Supprimer les commandes de cadrage laissées par le parcours AVANT de
      // restaurer la zone. L’unique cadrage encore autorisé au montage sera
      // alors le pendingFitToWorkspace produit par validateWorkspaceZone().
      clearTransientMapNavigationRequests();

      // Poser la référence avant toute mutation du store produit évite qu'un
      // rerender synchrone réexécute l'initialisation du même projet.
      initializedProjectRef.current = project.id;
      setWaitingForWorkspaceValidation(requiresEditorWorkspaceValidation);
      runWithoutEditorHistory(() => {
        restoreDromapEditorProjectSnapshot(snapshot);
      });
      // La restauration terminée devient la baseline immuable de cette ouverture.
      // Ctrl+Z/Ctrl+Y ne commencent à enregistrer qu'à partir de la première
      // vraie action utilisateur effectuée dans CE projet.
      useEditorFeaturesStore.getState().resetHistory();
      completeEditorHistorySession(projectId);
      setActiveProjectId(project.id);

      // La carte doit être montée pour que MapViewController puisse consommer
      // pendingFitToWorkspace et exécuter le vrai fitBounds de l'éditeur.
      // On n'enregistre donc plus un snapshot intermédiaire avant ce montage.
      setReady(true);
    } catch (initializationError) {
      endEditorHistorySession(projectId);
      useEditorFeaturesStore.getState().resetHistory();
      setError(
        initializationError instanceof Error
          ? initializationError.message
          : "Le projet n’a pas pu être chargé.",
      );
    }
  }, [
    project,
    loadProject,
    router,
    setActiveProjectId,
    accountPlan,
    userMode,
  ]);


  useEffect(() => {
    // Garde-fou : une fois l’éditeur réellement prêt, l’historique de CE projet
    // doit forcément accepter les nouvelles actions utilisateur. Cela évite qu’un
    // chargement asynchrone laisse Ctrl+Z/Ctrl+Y désactivés alors que la carte est
    // déjà utilisable. La pile reste vide grâce au reset effectué après restauration.
    if (!ready) return;
    completeEditorHistorySession(projectId);
  }, [projectId, ready]);

  useEffect(() => {
    if (
      !project ||
      !waitingForWorkspaceValidation ||
      typeof workspaceBasemapBaseZoom !== "number" ||
      !Number.isFinite(workspaceBasemapBaseZoom) ||
      !currentMapView
    ) {
      return;
    }

    // Attendre la fin du cycle Leaflet moveend/zoomend permet de sauvegarder
    // le centre, le zoom et l'emprise réellement obtenus dans le viewport de
    // l'éditeur, et non une valeur intermédiaire du fitBounds.
    const timeoutId = window.setTimeout(() => {
      const validatedSnapshot = createDromapEditorProjectSnapshot();
      saveProjectSnapshot(project.id, validatedSnapshot);
      setWaitingForWorkspaceValidation(false);
    }, 80);

    return () => window.clearTimeout(timeoutId);
  }, [
    currentMapView,
    project,
    saveProjectSnapshot,
    waitingForWorkspaceValidation,
    workspaceBasemapBaseZoom,
  ]);

  useEffect(() => {
    if (
      initialView !== "render" ||
      !ready ||
      !mapPresentationReady ||
      waitingForWorkspaceValidation ||
      renderPanelOpenedRef.current
    ) {
      return;
    }

    renderPanelOpenedRef.current = true;
    const timeoutId = window.setTimeout(() => {
      useEditorExportStore.getState().openExportPanel();
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [
    initialView,
    mapPresentationReady,
    ready,
    waitingForWorkspaceValidation,
  ]);

  useEffect(() => {
    if (initialView !== "render" || !project) return;
    if (isExportPanelOpen) {
      renderPanelWasVisibleRef.current = true;
      return;
    }
    if (!renderPanelWasVisibleRef.current) return;
    router.replace(`/projects/${project.id}/editor`, { scroll: false });
  }, [initialView, isExportPanelOpen, project, router]);

  const handleMapPresentationReady = useCallback(() => {
    setMapPresentationReady(true);
  }, []);

  if (!project) {
    return (
      <div className="grid h-screen place-items-center bg-slate-50 p-6 text-center">
        <div>
          <h1 className="text-xl font-black text-slate-950">Projet introuvable</h1>
          <DromapButton className="mt-4" onClick={() => router.push("/dashboard")}>
            Menu principal
          </DromapButton>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid h-screen place-items-center bg-slate-50 p-6 text-center">
        <div className="max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-black text-slate-950">Chargement impossible</h1>
          <p className="mt-2 text-sm leading-6 text-red-700">{error}</p>
          <DromapButton className="mt-4" onClick={() => router.push("/dashboard")}>
            Menu principal
          </DromapButton>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="grid h-screen place-items-center bg-slate-50 text-sm text-slate-600">
        Ouverture du projet…
      </div>
    );
  }

  return (
    <DromapProductRuntimeProvider projectId={project.id}>
      <DromapProjectAutosaveProvider projectId={project.id}>
        <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-slate-100">
          <DromapProjectEditorTopbar projectId={project.id} renderMode={initialView === "render"} />
          <main className="relative min-h-0 flex-1 overflow-hidden">
            <EditorSurface
              variant="product"
              onMapPresentationReady={handleMapPresentationReady}
            />
            {!mapPresentationReady || waitingForWorkspaceValidation ? (
              <div className="absolute inset-0 z-[5000] grid place-items-center bg-slate-100">
                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-center shadow-lg">
                  <div className="text-sm font-black text-slate-950">
                    {waitingForWorkspaceValidation
                      ? "Validation de la zone dans l’éditeur…"
                      : "Chargement de la carte…"}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-600">
                    {waitingForWorkspaceValidation
                      ? "DroMap applique le zoom et le niveau de détail définitifs."
                      : "Le cadrage et le fond sont préparés avant affichage."}
                  </div>
                </div>
              </div>
            ) : null}
          </main>
          <DromapProjectInfoDialog projectId={project.id} />
          {initialView === "editor" ? <DromapEditorTour /> : null}
        </div>
      </DromapProjectAutosaveProvider>
    </DromapProductRuntimeProvider>
  );
}

export function DromapProjectEditorClient({
  projectId,
  initialView = "editor",
}: {
  projectId: string;
  initialView?: "editor" | "render";
}) {
  return (
    <DromapProductBootstrap>
      <EditorContent projectId={projectId} initialView={initialView} />
    </DromapProductBootstrap>
  );
}
