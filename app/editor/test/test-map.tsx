"use client";

import { useMemo } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { WorkspaceMaskLayer } from "./workspace-mask-layer";
import { WorkspaceInteractionGuard } from "./workspace-interaction-guard";
import { useEditorTestBasemapStore } from "@/stores/editor-test-basemap";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import { useEditorTestWorldSnapshotStore } from "@/stores/editor-test-world-snapshot";
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
import { GeoJsonLayersRenderer } from "./geojson-layers-renderer";
import { MapLibreBasemapLayer } from "./maplibre-basemap-layer";
import { BasemapAttributionControl } from "./basemap-attribution-control";
import { WorldBasemapSnapshotLayer } from "./world-basemap-snapshot-layer";

const FRANCE_CENTER: LatLngExpression = [46.603354, 1.888334];
/**
 * Bornes de déplacement pour les fonds classiques.
 * Les fonds à tuiles peuvent afficher deux copies du monde côte à côte,
 * mais DroMap reste borné : on évite une répétition infinie.
 */
const CLASSIC_DOUBLE_WORLD_PANNABLE_BOUNDS: [
  [number, number],
  [number, number],
] = [
  [-88, -360],
  [88, 360],
];

export default function TestMap() {
  const basemapId = useEditorTestBasemapStore((state) => state.basemapId);
  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const workspaceBasemapZoom = useEditorTestWorkspaceStore(
    (state) => state.workspaceBasemapZoom,
  );
  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
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
  const worldSnapshotFailedForActiveBasemap =
    isFullWorldWorkspace &&
    worldSnapshotBasemapId === basemap.id &&
    worldSnapshotStatus === "error";
  const shouldRenderLiveBasemap =
    !isFullWorldWorkspace || worldSnapshotFailedForActiveBasemap;

  /**
   * « Sélectionner le monde » ne crée pas un mode d’affichage distinct : après
   * le cadrage automatique initial, le fond suit exactement le même zoom
   * graphique que pour une zone tracée manuellement.
   */
  const requestedLockedTileNativeZoom =
    currentMode === "edit" && workspaceBasemapZoom !== null
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
    currentMode === "edit" && workspaceBasemapZoom !== null
      ? workspaceBasemapZoom
      : undefined;
  const workspaceLatLngBounds = useMemo(
    () => (workspaceBounds ? toLatLngBounds(workspaceBounds) : null),
    [workspaceBounds],
  );
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

        {isFullWorldWorkspace ? (
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
        <GeoJsonLayersRenderer />
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
        <SelectedMarkerRotationHandle />
        <SelectedTextRotationHandle />
        <SelectedTextResizeHandle />
        <SelectedTextInlineEditor />
        <SelectedZoneShapeRotationHandle />
        <MapViewController />
      </MapContainer>
    </>
  );
}
