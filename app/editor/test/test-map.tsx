"use client";

import { Fragment, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { WorkspaceMaskLayer } from "./workspace-mask-layer";
import { WorkspaceInteractionGuard } from "./workspace-interaction-guard";
import { useEditorTestBasemapStore } from "@/stores/editor-test-basemap";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import { useEditorTestWorldSnapshotStore } from "@/stores/editor-test-world-snapshot";
import { useEditorTestMapViewStore } from "@/stores/editor-test-map-view";
import { getDromapBasemapConfig } from "@/lib/dromap/basemap";
import {
  isFullWorldWorkspaceBounds,
  toLatLngBounds,
} from "@/lib/dromap/workspace-bounds";
import GeomanControls from "./geoman-controls";
import MapViewController from "./map-view-controller";
import { AdaptiveWheelZoomController } from "./adaptive-wheel-zoom-controller";
import { FeatureDuplicationMapBridge } from "./feature-duplication-map-bridge";
import { FeatureVisualScaleBridge } from "./feature-visual-scale-bridge";
import { DroMapAiMapBridge } from "./dromap-ai-map-bridge";
import WorkspaceBoundsLayer from "./workspace-bounds-layer";
import { FeaturesStyleSync } from "./features-style-sync";
import { SelectedFeatureHighlight } from "./selected-feature-highlight";
import { SelectedFeatureMapInteractions } from "./selected-feature-map-interactions";
import { FeatureLayerDeleteCommand } from "./feature-layer-delete-command";
import { FeaturesStoreRenderer } from "./features-store-renderer";
import { TextToolLayer } from "./text-tool-layer";
import { FreehandLineToolLayer } from "./freehand-line-tool-layer";
import { TraceLineToolLayer } from "./trace-line-tool-layer";
import { FreehandZoneToolLayer } from "./freehand-zone-tool-layer";
import { ZoneFillToolLayer } from "./zone-fill-tool-layer";
import { DrawingToolController } from "./drawing-tool-controller";
import { DrawingToolPreviewLayer } from "./drawing-tool-preview-layer";
import { SelectedTextRotationHandle } from "./selected-text-rotation-handle";
import { SelectedMarkerRotationHandle } from "./selected-marker-rotation-handle";
import { SelectedTextResizeHandle } from "./selected-text-resize-handle";
import { SelectedTextInlineEditor } from "./selected-text-inline-editor";
import { SelectedZoneShapeRotationHandle } from "./selected-zone-shape-rotation-handle";
import { BasemapBoundariesLayer } from "./basemap-boundaries-layer";
import { BasemapBoundsMaskLayer } from "./basemap-bounds-mask-layer";
import { EditorGeoJsonLayersRenderer } from "./editor-only/editor-geojson-layers-renderer";
import { MapLibreBasemapLayer } from "./maplibre-basemap-layer";
import { BasemapAttributionControl } from "./basemap-attribution-control";
import { WorldBasemapSnapshotLayer } from "./world-basemap-snapshot-layer";


function SelectedFeatureEditHandles() {
  const selectedFeatureId = useEditorTestSelectionStore(
    (state) => state.selectedFeatureId,
  );
  const selectedFeatureIds = useEditorTestSelectionStore(
    (state) => state.selectedFeatureIds,
  );
  const multiSelectionEnabled = useEditorTestSelectionStore(
    (state) => state.multiSelectionEnabled,
  );
  const effectiveSelectedFeatureIds =
    multiSelectionEnabled && selectedFeatureIds.length > 0
      ? selectedFeatureIds
      : selectedFeatureId
        ? [selectedFeatureId]
        : [];

  return (
    <>
      {effectiveSelectedFeatureIds.map((featureId) => (
        <Fragment key={`edit-handles-${featureId}`}>
          <SelectedMarkerRotationHandle featureId={featureId} />
          <SelectedTextRotationHandle featureId={featureId} />
          <SelectedZoneShapeRotationHandle featureId={featureId} />
        </Fragment>
      ))}
      <SelectedTextResizeHandle />
    </>
  );
}

const FRANCE_CENTER: LatLngExpression = [46.603354, 1.888334];
/**
 * Bornes de déplacement pour les fonds classiques.
 * Les fonds à tuiles peuvent afficher deux copies du monde côte à côte,
 * mais DroMap reste borné : on évite une répétition infinie.
 */

function MapViewStateBridge() {
  const map = useMap();

  const updateCurrentView = () => {
    const center = map.getCenter();
    const zoom = map.getZoom();

    if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng) || !Number.isFinite(zoom)) {
      return;
    }

    const visibleBounds = map.getBounds();

    useEditorTestMapViewStore.getState().setCurrentView({
      center: { lat: center.lat, lng: center.lng },
      zoom,
      visibleBounds: {
        southWest: {
          lat: visibleBounds.getSouth(),
          lng: visibleBounds.getWest(),
        },
        northEast: {
          lat: visibleBounds.getNorth(),
          lng: visibleBounds.getEast(),
        },
      },
    });
  };

  useMapEvents({
    moveend: updateCurrentView,
    zoomend: updateCurrentView,
  });

  useEffect(() => {
    const frameId = window.requestAnimationFrame(updateCurrentView);
    return () => window.cancelAnimationFrame(frameId);
  }, [map]);

  return null;
}

function PendingMapViewRestore() {
  const map = useMap();
  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const workspaceBounds = useEditorTestWorkspaceStore((state) => state.workspaceBounds);

  useEffect(() => {
    if (currentMode !== "edit" || !workspaceBounds) {
      return;
    }

    let firstFrameId = 0;
    let secondFrameId = 0;
    let timeoutId = 0;

    firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
        timeoutId = window.setTimeout(() => {
          const pendingView = useEditorTestMapViewStore
            .getState()
            .consumePendingRestoreView();

          if (!pendingView) {
            return;
          }

          // L'étape Zone utilise désormais exactement la même surface de
          // carte que l'éditeur : plein écran sous une barre de 56 px, avec les
          // panneaux superposés sans réduire le viewport Leaflet. Le résultat
          // de la validation peut donc être restauré sans aucun recalcul.
          //
          // Ne jamais refaire fitBounds ici : fitBounds recalcule le zoom selon
          // la taille courante du conteneur et peut donc modifier le niveau de
          // détail verrouillé. On reprend strictement le centre et le zoom
          // produits par la validation de l'éditeur.
          map.invalidateSize({ pan: false });
          map.setView(
            [pendingView.center.lat, pendingView.center.lng],
            pendingView.zoom,
            { animate: false },
          );

          const restoredCenter = map.getCenter();
          const restoredBounds = map.getBounds();
          useEditorTestMapViewStore.getState().setCurrentView({
            center: {
              lat: restoredCenter.lat,
              lng: restoredCenter.lng,
            },
            zoom: map.getZoom(),
            visibleBounds: {
              southWest: {
                lat: restoredBounds.getSouth(),
                lng: restoredBounds.getWest(),
              },
              northEast: {
                lat: restoredBounds.getNorth(),
                lng: restoredBounds.getEast(),
              },
            },
          });
        }, 30);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrameId);
      window.cancelAnimationFrame(secondFrameId);
      window.clearTimeout(timeoutId);
    };
  }, [currentMode, map, workspaceBounds]);

  return null;
}

function MapPresentationReadyBridge({
  onReady,
}: {
  onReady?: () => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!onReady) {
      return;
    }

    let completed = false;
    let settleTimerId = 0;
    let hardTimeoutId = 0;
    let firstFrameId = 0;
    let secondFrameId = 0;

    const finish = () => {
      if (completed) return;
      completed = true;
      window.clearTimeout(settleTimerId);
      window.clearTimeout(hardTimeoutId);

      // Une dernière mesure après deux frames garantit que Leaflet a reçu la
      // taille définitive de son conteneur avant que l'interface soit révélée.
      map.invalidateSize({ pan: false });
      firstFrameId = window.requestAnimationFrame(() => {
        secondFrameId = window.requestAnimationFrame(() => {
          onReady();
        });
      });
    };

    const prerequisitesAreSettled = () => {
      const workspaceState = useEditorTestWorkspaceStore.getState();
      const mapViewState = useEditorTestMapViewStore.getState();
      const size = map.getSize();

      if (size.x < 200 || size.y < 200) {
        return false;
      }

      // Ne jamais révéler l'ancien cadrage transitoire : attendre que le vrai
      // fitBounds de zone et/ou la restauration de vue aient été consommés.
      if (workspaceState.pendingFitToWorkspace || mapViewState.pendingRestoreView) {
        return false;
      }

      const basemap = getDromapBasemapConfig(
        useEditorTestBasemapStore.getState().basemapId,
      );
      const mode = useEditorTestModeStore.getState().currentMode;
      const bounds = workspaceState.workspaceBounds;
      const usesWorldSnapshot =
        mode === "edit" &&
        Boolean(bounds) &&
        isFullWorldWorkspaceBounds(bounds) &&
        basemap.kind !== "solid" &&
        !workspaceState.workspaceNavigationUnlocked;

      if (usesWorldSnapshot) {
        const snapshotStatus = useEditorTestWorldSnapshotStore.getState().status;
        if (snapshotStatus === "idle" || snapshotStatus === "loading") {
          return false;
        }
      }

      return true;
    };

    const scheduleCheck = () => {
      if (completed) return;
      window.clearTimeout(settleTimerId);
      settleTimerId = window.setTimeout(() => {
        if (!prerequisitesAreSettled()) {
          scheduleCheck();
          return;
        }

        finish();
      }, 140);
    };

    const handleMapMotion = () => scheduleCheck();

    map.whenReady(scheduleCheck);
    map.on("moveend", handleMapMotion);
    map.on("zoomend", handleMapMotion);
    map.on("resize", handleMapMotion);

    // Filet de sécurité : une source de fond lente ne doit jamais bloquer
    // définitivement l'accès à l'éditeur. La carte est alors révélée après
    // invalidation de taille, même si des tuiles continuent de charger.
    hardTimeoutId = window.setTimeout(finish, 1600);

    return () => {
      completed = true;
      window.clearTimeout(settleTimerId);
      window.clearTimeout(hardTimeoutId);
      window.cancelAnimationFrame(firstFrameId);
      window.cancelAnimationFrame(secondFrameId);
      map.off("moveend", handleMapMotion);
      map.off("zoomend", handleMapMotion);
      map.off("resize", handleMapMotion);
    };
  }, [map, onReady]);

  return null;
}

const CLASSIC_DOUBLE_WORLD_PANNABLE_BOUNDS: [
  [number, number],
  [number, number],
] = [
  [-88, -360],
  [88, 360],
];

type TestMapProps = {
  onPresentationReady?: () => void;
};

export default function TestMap({ onPresentationReady }: TestMapProps = {}) {
  const basemapId = useEditorTestBasemapStore((state) => state.basemapId);
  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const workspaceBasemapZoom = useEditorTestWorkspaceStore(
    (state) => state.workspaceBasemapZoom,
  );
  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );
  const workspaceNavigationUnlocked = useEditorTestWorkspaceStore(
    (state) => state.workspaceNavigationUnlocked,
  );
  const basemap = getDromapBasemapConfig(basemapId);
  const mapLibreFallbackBasemap =
    basemap.kind === "maplibre" && basemap.fallbackTileBasemapId
      ? getDromapBasemapConfig(basemap.fallbackTileBasemapId)
      : null;
  const mapLibreFallbackTileUrl =
    mapLibreFallbackBasemap?.kind === "tile"
      ? mapLibreFallbackBasemap.screenTileUrl ?? mapLibreFallbackBasemap.tileUrl
      : undefined;
  const screenTileUrl =
    basemap.kind === "tile" ? (basemap.screenTileUrl ?? basemap.tileUrl) : "";
  const isFullWorldWorkspace =
    currentMode === "edit" && isFullWorldWorkspaceBounds(workspaceBounds);
  const worldSnapshotBasemapId = useEditorTestWorldSnapshotStore(
    (state) => state.basemapId,
  );
  const worldSnapshotStatus = useEditorTestWorldSnapshotStore(
    (state) => state.status,
  );
  const shouldUseWorldSnapshot =
    isFullWorldWorkspace &&
    basemap.kind !== "solid" &&
    !workspaceNavigationUnlocked;
  const worldSnapshotFailedForActiveBasemap =
    shouldUseWorldSnapshot &&
    worldSnapshotBasemapId === basemap.id &&
    worldSnapshotStatus === "error";
  const shouldRenderLiveBasemap =
    !shouldUseWorldSnapshot || worldSnapshotFailedForActiveBasemap;

  /**
   * « Sélectionner le monde » ne crée pas un mode d’affichage distinct : après
   * le cadrage automatique initial, le fond suit exactement le même zoom
   * graphique que pour une zone tracée manuellement.
   */
  const requestedLockedTileNativeZoom =
    currentMode === "edit" &&
    !workspaceNavigationUnlocked &&
    workspaceBasemapZoom !== null
      ? Math.floor(workspaceBasemapZoom)
      : undefined;
  const lockedTileNativeZoom =
    basemap.kind === "tile" && requestedLockedTileNativeZoom !== undefined
      ? Math.max(
          0,
          Math.min(
            requestedLockedTileNativeZoom,
            basemap.maxNativeZoom ?? basemap.maxZoom,
          ),
        )
      : undefined;
  const lockedMapLibreDetailZoom =
    currentMode === "edit" &&
    !workspaceNavigationUnlocked &&
    workspaceBasemapZoom !== null
      ? workspaceBasemapZoom
      : undefined;
  const workspaceLatLngBounds = useMemo(
    () => (workspaceBounds ? toLatLngBounds(workspaceBounds) : null),
    [workspaceBounds],
  );
  /**
   * Le mode « Zoom précis » est volontairement limité à l'affichage de
   * l'éditeur : quand il est actif, TileLayer/MapLibre reprennent leur détail
   * natif au zoom courant et la capture monde figée est remplacée par le fond
   * vivant. Les valeurs workspaceBasemapZoom / workspaceBasemapBaseZoom ne sont
   * pas modifiées : preview et export gardent donc exactement le rendu validé.
   */

  /**
   * Important : on ne borne pas TileLayer à la zone de travail.
   *
   * Leaflet ne charge déjà que les tuiles de la vue courante + keepBuffer.
   * Ajouter `bounds` sur TileLayer ne rend donc pas le fond beaucoup plus léger,
   * mais peut bloquer ou retarder des tuiles pendant les zooms fractionnaires et
   * les petits déplacements autour de la zone validée.
   *
   * Le chargement paresseux des objets/GeoJSON reste géré séparément par
   * workspace-object-loading.ts. Ici, on laisse les fonds classiques respirer
   * pour éviter les trous gris et les chargements tardifs.
   */

  return (
    <>
      <style>{`
        .leaflet-tile.dromap-basemap-tile {
          image-rendering: auto;
          transform: translateZ(0);
          backface-visibility: hidden;
        }

        /*
         * Les orthophotographies IGN sont des tuiles raster JPEG de 256 px.
         * Pendant un zoom fractionnaire ou un sur-zoom, les arrondis de
         * transformation du navigateur peuvent laisser apparaître une ligne
         * d'un pixel entre deux tuiles. On étire uniquement les tuiles
         * satellite d'un pixel vers la droite et le bas afin qu'elles se
         * chevauchent très légèrement, sans changer leur position ni le zoom.
         */
        .leaflet-tile.dromap-satellite-seamless-tile {
          width: 257px !important;
          height: 257px !important;
          max-width: none !important;
          max-height: none !important;
          outline: 1px solid transparent;
          backface-visibility: visible;
        }

        .leaflet-tile-pane,
        .leaflet-tile-container {
          will-change: transform;
        }

        .leaflet-container {
          -webkit-font-smoothing: antialiased;
          text-rendering: geometricPrecision;
        }
      `}</style>

      <MapContainer
        center={FRANCE_CENTER}
        zoom={6}
        zoomSnap={0.25}
        zoomDelta={0.25}
        wheelPxPerZoomLevel={220}
        zoomControl={false}
        scrollWheelZoom={true}
        maxBounds={CLASSIC_DOUBLE_WORLD_PANNABLE_BOUNDS}
        maxBoundsViscosity={0.85}
        worldCopyJump={false}
        className="dromap-editor-map h-full w-full"
        style={{ background: "#e5e7eb" }}
      >
        {shouldRenderLiveBasemap && basemap.kind === "tile" ? (
          <TileLayer
            key={`${basemap.id}-${lockedTileNativeZoom ?? "auto"}-${screenTileUrl}-${isFullWorldWorkspace ? "single-world" : "wrapped"}`}
            attribution={basemap.attribution}
            url={screenTileUrl}
            // Le niveau natif reste verrouillé par maxNativeZoom, mais la couche
            // doit accepter le sur-zoom graphique courant. Sans cela, passer
            // d'un fond blanc très zoomé à un fond raster peut afficher un trou
            // ou forcer Leaflet à réduire le zoom.
            maxZoom={basemap.maxZoom}
            minNativeZoom={lockedTileNativeZoom}
            maxNativeZoom={lockedTileNativeZoom ?? basemap.maxNativeZoom}
            crossOrigin="anonymous"
            detectRetina={false}
            updateWhenZooming
            updateWhenIdle={false}
            keepBuffer={6}
            updateInterval={70}
            noWrap={isFullWorldWorkspace}
            className={
              basemap.id === "ign-satellite"
                ? "dromap-basemap-tile dromap-satellite-seamless-tile"
                : "dromap-basemap-tile"
            }
          />
        ) : null}

        {shouldRenderLiveBasemap && basemap.kind === "maplibre" ? (
          <MapLibreBasemapLayer
            key={`${basemap.id}-${basemap.styleUrl}-${lockedMapLibreDetailZoom ?? "auto"}-${isFullWorldWorkspace ? "single-world" : "wrapped"}`}
            styleUrl={basemap.styleUrl}
            attribution={basemap.attribution}
            lockedNativeZoom={lockedMapLibreDetailZoom}
            fallbackTileUrl={mapLibreFallbackTileUrl}
            fallbackTileMaxZoom={
              mapLibreFallbackBasemap?.kind === "tile"
                ? mapLibreFallbackBasemap.maxZoom
                : undefined
            }
            fallbackTileMaxNativeZoom={
              mapLibreFallbackBasemap?.kind === "tile"
                ? mapLibreFallbackBasemap.maxNativeZoom
                : undefined
            }
            renderWorldCopies={!isFullWorldWorkspace}
            singleWorldBounds={
              isFullWorldWorkspace && workspaceLatLngBounds
                ? workspaceLatLngBounds
                : undefined
            }
          />
        ) : null}

        {shouldUseWorldSnapshot ? (
          <WorldBasemapSnapshotLayer basemap={basemap} />
        ) : null}

        <BasemapAttributionControl basemap={basemap} />
        <BasemapBoundsMaskLayer />
        <BasemapBoundariesLayer
          boundaryOverlay={basemap.boundaryOverlay}
          renderBounds={
            currentMode === "edit" && workspaceLatLngBounds
              ? workspaceLatLngBounds
              : undefined
          }
        />

        <AdaptiveWheelZoomController />
        <FeatureDuplicationMapBridge />
        <FeatureVisualScaleBridge />
        <DroMapAiMapBridge />
        <WorkspaceInteractionGuard />
        <GeomanControls />
        <DrawingToolController />
        <DrawingToolPreviewLayer />
        <WorkspaceMaskLayer />
        <WorkspaceBoundsLayer />
        <EditorGeoJsonLayersRenderer />
        <FeaturesStoreRenderer />
        <FeaturesStyleSync />
        <FeatureLayerDeleteCommand />
        <SelectedFeatureMapInteractions />
        <FreehandLineToolLayer />
        <TraceLineToolLayer />
        <FreehandZoneToolLayer />
        <ZoneFillToolLayer />
        <TextToolLayer />
        <SelectedFeatureHighlight />
        <SelectedFeatureEditHandles />
        <SelectedTextInlineEditor />
        <MapViewStateBridge />
        <MapViewController />
        <PendingMapViewRestore />
        <MapPresentationReadyBridge onReady={onPresentationReady} />
      </MapContainer>
    </>
  );
}
