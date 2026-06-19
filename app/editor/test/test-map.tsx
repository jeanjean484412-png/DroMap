"use client";

import { useMemo } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { WorkspaceMaskLayer } from "./workspace-mask-layer";
import { useEditorTestBasemapStore } from "@/stores/editor-test-basemap";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import { getDromapBasemapConfig } from "@/lib/dromap/basemap";
import { toLatLngBounds } from "@/lib/dromap/workspace-bounds";
import GeomanControls from "./geoman-controls";
import MapViewController from "./map-view-controller";
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
import { SelectedZoneShapeRotationHandle } from "./selected-zone-shape-rotation-handle";
import { BasemapBoundariesLayer } from "./basemap-boundaries-layer";
import { BasemapBoundsMaskLayer } from "./basemap-bounds-mask-layer";
import { GeoJsonLayersRenderer } from "./geojson-layers-renderer";
import { MapLibreBasemapLayer } from "./maplibre-basemap-layer";
import { BasemapAttributionControl } from "./basemap-attribution-control";

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
  const screenTileUrl =
    basemap.kind === "tile" ? (basemap.screenTileUrl ?? basemap.tileUrl) : "";
  const lockedTileNativeZoom =
    currentMode === "edit" && workspaceBasemapZoom !== null
      ? Math.floor(workspaceBasemapZoom)
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
        scrollWheelZoom="center"
        maxBounds={CLASSIC_DOUBLE_WORLD_PANNABLE_BOUNDS}
        maxBoundsViscosity={0.85}
        worldCopyJump={false}
        className="dromap-editor-map h-full w-full"
        style={{ background: "#e5e7eb" }}
      >
        {basemap.kind === "tile" ? (
          <TileLayer
            key={`${basemap.id}-${lockedTileNativeZoom ?? "auto"}-${screenTileUrl}`}
            attribution={basemap.attribution}
            url={screenTileUrl}
            maxZoom={
              lockedTileNativeZoom !== undefined
                ? Math.min(basemap.maxZoom, lockedTileNativeZoom + 2)
                : basemap.maxZoom
            }
            minNativeZoom={lockedTileNativeZoom}
            maxNativeZoom={lockedTileNativeZoom}
            crossOrigin="anonymous"
            detectRetina={false}
            updateWhenZooming
            updateWhenIdle={false}
            keepBuffer={6}
            updateInterval={70}
            noWrap={false}
            className="dromap-basemap-tile"
          />
        ) : null}

        {basemap.kind === "maplibre" ? (
          <MapLibreBasemapLayer
            key={`${basemap.id}-${basemap.styleUrl}-${lockedMapLibreDetailZoom ?? "auto"}`}
            styleUrl={basemap.styleUrl}
            attribution={basemap.attribution}
            lockedNativeZoom={lockedMapLibreDetailZoom}
          />
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
        <SelectedTextRotationHandle />
        <SelectedZoneShapeRotationHandle />
        <MapViewController />
      </MapContainer>
    </>
  );
}
