"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, useMap } from "react-leaflet";

import "leaflet/dist/leaflet.css";

import type { DroMapFeature } from "@/lib/dromap/feature";
import { getFeaturesByDrawOrder } from "@/lib/dromap/feature-order";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import {
  getRenderableFeaturesForLayers,
  useEditorTestLayersStore,
} from "@/stores/editor-test-layers";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import { useEditorTestBasemapStore } from "@/stores/editor-test-basemap";

import { getLeafletDashArray } from "./feature-style";
import { getDromapBasemapConfig } from "@/lib/dromap/basemap";
import { getDromapExportAttributionHtml } from "@/lib/dromap/credits";
import { BasemapBoundariesLayer } from "./basemap-boundaries-layer";
import { GeoJsonLayersRenderer } from "./geojson-layers-renderer";
import { MapLibreBasemapLayer } from "./maplibre-basemap-layer";
import {
  createLineArrowBodyLeafletLayer,
  createLineArrowLeafletLayer,
  featureHasLineArrow,
} from "./line-arrow";
import { createMarkerLeafletIcon } from "./marker-symbol";
import { createTextDivIconRender } from "./text-rendering";
import { createZoneHatchingLeafletLayer } from "./zone-hatching";
import {
  createAlignedZoneOutlineLeafletLayer,
  shouldUseAlignedZoneOutline,
} from "./zone-outline";
import {
  getZoneFillEnabled,
  getZoneStrokeEnabled,
  getZoneVisibleFillOpacity,
  getZoneVisibleStrokeOpacity,
} from "./zone-style";

type LatLngPoint = {
  lat: number;
  lng: number;
};

type FeatureStyle = {
  color?: string;
  opacity?: number;
  weight?: number;
  fillColor?: string;
  fillOpacity?: number;
  markerSize?: number;
  fontSize?: number;
  textRotation?: number;
  textBackgroundEnabled?: boolean;
  textBackgroundColor?: string;
  textBackgroundOpacity?: number;
  textBorderEnabled?: boolean;
  textBorderColor?: string;
  textBorderWidth?: number;
  zoneHatchingWeight?: number;
  zoneHatchingSpacing?: number;
  zoneDotsRadius?: number;
  zoneDotsSpacing?: number;
};

type ExportLeafletPreviewProps = {
  symbolScale?: number;
};

const EXPORT_FEATURE_PANE_PREFIX = "dromap-export-feature-pane-";
const EXPORT_FEATURE_PANE_BASE_Z_INDEX = 430;
const EXPORT_FEATURE_PANE_STEP = 8;

function getExportFeaturePaneName(featureId: string) {
  return `${EXPORT_FEATURE_PANE_PREFIX}${featureId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function ensureExportFeaturePane(
  map: L.Map,
  feature: DroMapFeature,
  drawIndex: number,
) {
  const paneName = getExportFeaturePaneName(feature.id);
  const pane = map.getPane(paneName) ?? map.createPane(paneName);

  pane.style.zIndex = String(
    EXPORT_FEATURE_PANE_BASE_Z_INDEX + drawIndex * EXPORT_FEATURE_PANE_STEP,
  );
  pane.style.pointerEvents = "none";

  return paneName;
}

function getExportFeaturePaneNamesById(map: L.Map, features: DroMapFeature[]) {
  const paneNamesById = new Map<string, string>();

  features.forEach((feature, index) => {
    paneNamesById.set(feature.id, ensureExportFeaturePane(map, feature, index));
  });

  return paneNamesById;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function scaleNumber(value: unknown, fallback: number, scale: number) {
  const numericValue = Number(value ?? fallback);

  if (!Number.isFinite(numericValue)) {
    return fallback * scale;
  }

  return numericValue * scale;
}

function scaleFeatureForPreview(
  feature: DroMapFeature,
  symbolScale: number,
): DroMapFeature {
  if (!Number.isFinite(symbolScale) || Math.abs(symbolScale - 1) < 0.001) {
    return feature;
  }

  const style = feature.properties?.style ?? {};
  const type = feature.properties?.type;
  const nextStyle: FeatureStyle = { ...style };

  if (type === "line") {
    nextStyle.weight = Math.max(0.5, scaleNumber(style.weight, 3, symbolScale));
  }

  if (type === "zone") {
    nextStyle.weight = Math.max(0.5, scaleNumber(style.weight, 2, symbolScale));
    nextStyle.zoneHatchingWeight = Math.max(
      0.5,
      scaleNumber(style.zoneHatchingWeight, 2, symbolScale),
    );
    nextStyle.zoneHatchingSpacing = Math.max(
      2,
      scaleNumber(style.zoneHatchingSpacing, 14, symbolScale),
    );
    nextStyle.zoneDotsRadius = Math.max(
      0.5,
      scaleNumber(style.zoneDotsRadius, 2, symbolScale),
    );
    nextStyle.zoneDotsSpacing = Math.max(
      2,
      scaleNumber(style.zoneDotsSpacing, 14, symbolScale),
    );
  }

  if (type === "marker") {
    nextStyle.markerSize = Math.max(
      2,
      scaleNumber(style.markerSize, 18, symbolScale),
    );
  }

  if (type === "text") {
    nextStyle.fontSize = Math.max(
      4,
      scaleNumber(style.fontSize, 22, symbolScale),
    );
    nextStyle.textBorderWidth = Math.max(
      1,
      scaleNumber(style.textBorderWidth, 2, symbolScale),
    );
  }

  return {
    ...feature,
    properties: {
      ...feature.properties,
      style: nextStyle,
    },
  };
}

function readLatLngPoint(value: unknown): LatLngPoint | null {
  if (!isRecord(value)) {
    return null;
  }

  const lat = value.lat;
  const lng = value.lng;

  if (typeof lat !== "number" || typeof lng !== "number") {
    return null;
  }

  return { lat, lng };
}

function getWorkspaceBoundsPoints(
  workspaceBounds: WorkspaceBounds | null,
): { southWest: LatLngPoint; northEast: LatLngPoint } | null {
  if (!workspaceBounds || !isRecord(workspaceBounds)) {
    return null;
  }

  const southWest =
    readLatLngPoint(workspaceBounds.southWest) ??
    readLatLngPoint(workspaceBounds.sw) ??
    readLatLngPoint(workspaceBounds._southWest);

  const northEast =
    readLatLngPoint(workspaceBounds.northEast) ??
    readLatLngPoint(workspaceBounds.ne) ??
    readLatLngPoint(workspaceBounds._northEast);

  if (southWest && northEast) {
    return { southWest, northEast };
  }

  const south = workspaceBounds.south;
  const west = workspaceBounds.west;
  const north = workspaceBounds.north;
  const east = workspaceBounds.east;

  if (
    typeof south === "number" &&
    typeof west === "number" &&
    typeof north === "number" &&
    typeof east === "number"
  ) {
    return {
      southWest: { lat: south, lng: west },
      northEast: { lat: north, lng: east },
    };
  }

  return null;
}

function workspaceBoundsToLeafletBounds(
  workspaceBounds: WorkspaceBounds | null,
): L.LatLngBounds | null {
  const points = getWorkspaceBoundsPoints(workspaceBounds);

  if (!points) {
    return null;
  }

  return L.latLngBounds(
    L.latLng(points.southWest.lat, points.southWest.lng),
    L.latLng(points.northEast.lat, points.northEast.lng),
  );
}

function getFeatureStyle(
  feature: DroMapFeature,
): Required<
  Pick<
    FeatureStyle,
    "color" | "opacity" | "weight" | "fillColor" | "fillOpacity"
  >
> &
  Pick<FeatureStyle, "fontSize"> {
  const style = feature.properties?.style as FeatureStyle | undefined;
  const color = style?.color ?? "#334155";

  const rawOpacity = style?.opacity ?? 1;
  const opacity =
    featureHasLineArrow(feature) && rawOpacity <= 0.05 ? 1 : rawOpacity;

  return {
    color,
    opacity,
    weight: style?.weight ?? 3,
    fillColor: style?.fillColor ?? color,
    fillOpacity: style?.fillOpacity ?? 0.3,
  };
}

function createPointIcon(feature: DroMapFeature) {
  if (feature.properties?.type === "text") {
    const renderedText = createTextDivIconRender(feature, {
      minWidth: 56,
      maxWidth: 640,
    });

    return L.divIcon({
      className: "dromap-export-text-icon",
      iconSize: [renderedText.width, renderedText.height],
      iconAnchor: [renderedText.anchorX, renderedText.anchorY],
      html: renderedText.html,
    });
  }

  return createMarkerLeafletIcon(feature, L);
}

function geoJsonPositionToLatLng(position: unknown): L.LatLng | null {
  if (!Array.isArray(position)) {
    return null;
  }

  const lng = position[0];
  const lat = position[1];

  if (typeof lat !== "number" || typeof lng !== "number") {
    return null;
  }

  return L.latLng(lat, lng);
}

function createLeafletLayerFromFeature(
  feature: DroMapFeature,
  map: L.Map,
  paneName?: string,
): L.Layer | null {
  const geometry = feature.geometry;

  if (!geometry) {
    return null;
  }

  const style = getFeatureStyle(feature);

  if (geometry.type === "Point") {
    const latLng = geoJsonPositionToLatLng(geometry.coordinates);

    if (!latLng) {
      return null;
    }

    return L.marker(latLng, {
      icon: createPointIcon(feature),
      interactive: false,
      keyboard: false,
      zIndexOffset: 0,
      ...(paneName ? { pane: paneName } : {}),
    });
  }

  if (geometry.type === "LineString") {
    const coordinates = geometry.coordinates;

    if (!Array.isArray(coordinates)) {
      return null;
    }

    const latLngs = coordinates
      .map((position) => geoJsonPositionToLatLng(position))
      .filter((latLng): latLng is L.LatLng => latLng !== null);

    if (latLngs.length < 2) {
      return null;
    }

    const pathOptions: L.PathOptions = {
      color: style.color,
      opacity: style.opacity,
      weight: style.weight,
      dashArray: getLeafletDashArray(feature),
      lineCap: "round",
      lineJoin: "round",
      interactive: false,
      ...(paneName ? { pane: paneName } : {}),
    };

    if (featureHasLineArrow(feature)) {
      return createLineArrowBodyLeafletLayer(feature, map, L, pathOptions);
    }

    return L.polyline(latLngs, pathOptions);
  }

  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates;

    if (!Array.isArray(rings)) {
      return null;
    }

    const latLngRings = rings
      .map((ring) => {
        if (!Array.isArray(ring)) {
          return [];
        }

        return ring
          .map((position) => geoJsonPositionToLatLng(position))
          .filter((latLng): latLng is L.LatLng => latLng !== null);
      })
      .filter((ring) => ring.length >= 3);

    if (latLngRings.length === 0) {
      return null;
    }

    const useAlignedZoneOutline = shouldUseAlignedZoneOutline(feature);

    return L.polygon(latLngRings, {
      color: style.color,
      opacity: useAlignedZoneOutline ? 0 : getZoneVisibleStrokeOpacity(feature),
      weight: getZoneStrokeEnabled(feature) && !useAlignedZoneOutline ? style.weight : 0,
      stroke: getZoneStrokeEnabled(feature) && !useAlignedZoneOutline,
      fill: true,
      fillColor: style.fillColor,
      fillOpacity: getZoneFillEnabled(feature)
        ? getZoneVisibleFillOpacity(feature)
        : 0,
      dashArray: useAlignedZoneOutline ? undefined : getLeafletDashArray(feature),
      lineCap: "round",
      lineJoin: "round",
      interactive: false,
      ...(paneName ? { pane: paneName } : {}),
    });
  }

  return null;
}

function ExportMapController({ bounds }: { bounds: L.LatLngBounds }) {
  const map = useMap();

  useEffect(() => {
    let animationFrameId: number | null = null;

    function refitMapToWorkspace() {
      map.invalidateSize();

      map.fitBounds(bounds, {
        animate: false,
        paddingTopLeft: [0, 0],
        paddingBottomRight: [0, 0],
      });
    }

    function scheduleRefit() {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = window.requestAnimationFrame(refitMapToWorkspace);
    }

    const container = map.getContainer();
    const resizeObserver = new ResizeObserver(scheduleRefit);

    resizeObserver.observe(container);
    refitMapToWorkspace();

    const firstTimeoutId = window.setTimeout(refitMapToWorkspace, 50);
    const secondTimeoutId = window.setTimeout(refitMapToWorkspace, 250);
    const thirdTimeoutId = window.setTimeout(refitMapToWorkspace, 600);

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      resizeObserver.disconnect();
      window.clearTimeout(firstTimeoutId);
      window.clearTimeout(secondTimeoutId);
      window.clearTimeout(thirdTimeoutId);
    };
  }, [bounds, map]);

  return null;
}

function ExportFeatureLayers({
  features,
  symbolScale,
}: {
  features: DroMapFeature[];
  symbolScale: number;
}) {
  const map = useMap();

  useEffect(() => {
    const group = L.layerGroup().addTo(map);

    const renderFeatures = () => {
      group.clearLayers();

      const featuresByDrawOrder = getFeaturesByDrawOrder(features);
      const paneNamesById = getExportFeaturePaneNamesById(
        map,
        featuresByDrawOrder,
      );

      for (const feature of featuresByDrawOrder) {
        const previewFeature = scaleFeatureForPreview(feature, symbolScale);
        const paneName = paneNamesById.get(feature.id);
        const layer = createLeafletLayerFromFeature(
          previewFeature,
          map,
          paneName,
        );

        if (layer) {
          group.addLayer(layer);
        }

        if (previewFeature.properties.type === "zone") {
          const hatchingLayer = createZoneHatchingLeafletLayer(
            previewFeature,
            map,
            L,
            paneName,
          );

          if (hatchingLayer) {
            group.addLayer(hatchingLayer);
          }

          const outlineLayer = createAlignedZoneOutlineLeafletLayer(
            previewFeature,
            map,
            L,
            paneName,
          );

          if (outlineLayer) {
            group.addLayer(outlineLayer);
          }
        }

        const arrowLayer = createLineArrowLeafletLayer(
          previewFeature,
          map,
          L,
          paneName,
        );

        if (arrowLayer) {
          group.addLayer(arrowLayer);
        }
      }
    };

    renderFeatures();

    map.on("moveend zoomend resize", renderFeatures);

    return () => {
      map.off("moveend zoomend resize", renderFeatures);
      group.removeFrom(map);
    };
  }, [features, map, symbolScale]);

  return null;
}

function getPreviewAttributionHtml(basemap: ReturnType<typeof getDromapBasemapConfig>) {
  return getDromapExportAttributionHtml(basemap);
}

export function ExportLeafletPreview({
  symbolScale = 1,
}: ExportLeafletPreviewProps) {
  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );
  const workspaceBasemapZoom = useEditorTestWorkspaceStore(
    (state) => state.workspaceBasemapZoom,
  );
  const basemapId = useEditorTestBasemapStore((state) => state.basemapId);
  const basemap = getDromapBasemapConfig(basemapId);
  const rawFeatures = useEditorTestFeaturesStore((state) => state.features);
  const layers = useEditorTestLayersStore((state) => state.layers);
  const features = useMemo(
    () => getRenderableFeaturesForLayers(rawFeatures, layers, { workspaceBounds }),
    [rawFeatures, layers, workspaceBounds],
  );

  const leafletBounds = useMemo(
    () => workspaceBoundsToLeafletBounds(workspaceBounds),
    [workspaceBounds],
  );

  const forcedMapLibreDetailZoom =
    typeof workspaceBasemapZoom === "number" &&
    Number.isFinite(workspaceBasemapZoom)
      ? Math.max(0, Math.min(19, workspaceBasemapZoom))
      : null;
  const forcedTileNativeZoom =
    forcedMapLibreDetailZoom === null
      ? null
      : Math.max(0, Math.min(19, Math.floor(forcedMapLibreDetailZoom)));

  const mapKey = useMemo(() => {
    const points = getWorkspaceBoundsPoints(workspaceBounds);

    if (!points) {
      return "no-workspace";
    }

    return [
      points.southWest.lat,
      points.southWest.lng,
      points.northEast.lat,
      points.northEast.lng,
      forcedMapLibreDetailZoom ?? "auto",
      basemap.id,
    ].join("-");
  }, [basemap.id, workspaceBounds, forcedMapLibreDetailZoom]);

  if (!leafletBounds) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100 p-4 text-center text-sm text-slate-500">
        Aucune zone de travail à prévisualiser.
      </div>
    );
  }

  const nativeZoomProps =
    forcedTileNativeZoom === null
      ? {}
      : {
          minNativeZoom: forcedTileNativeZoom,
          maxNativeZoom: forcedTileNativeZoom,
        };

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: basemap.exportBackground }}
    >
      <MapContainer
        key={mapKey}
        bounds={leafletBounds}
        zoomControl={false}
        attributionControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        boxZoom={false}
        keyboard={false}
        zoomSnap={0}
        zoomDelta={0.1}
        className="h-full w-full"
        style={{
          height: "100%",
          width: "100%",
          background: basemap.exportBackground,
        }}
      >
        {basemap.kind === "tile" ? (
          <TileLayer
            key={basemap.id}
            url={basemap.tileUrl}
            attribution={basemap.attribution}
            crossOrigin="anonymous"
            maxZoom={basemap.maxZoom}
            detectRetina={false}
            noWrap={false}
            {...nativeZoomProps}
          />
        ) : null}

        {basemap.kind === "maplibre" ? (
          <MapLibreBasemapLayer
            key={`${basemap.id}-${basemap.styleUrl}-${forcedMapLibreDetailZoom ?? "auto"}`}
            styleUrl={basemap.styleUrl}
            attribution={basemap.attribution}
            lockedNativeZoom={forcedMapLibreDetailZoom}
          />
        ) : null}

        <BasemapBoundariesLayer boundaryOverlay={basemap.boundaryOverlay} />

        <ExportMapController bounds={leafletBounds} />
        <GeoJsonLayersRenderer />
        <ExportFeatureLayers features={features} symbolScale={symbolScale} />
      </MapContainer>

      {getPreviewAttributionHtml(basemap) ? (
        <div
          className="pointer-events-auto absolute bottom-px right-px max-w-[62%] rounded-sm bg-white/35 px-1 py-px text-right text-[7px] leading-none text-slate-600/70"
          dangerouslySetInnerHTML={{ __html: getPreviewAttributionHtml(basemap) }}
        />
      ) : null}
    </div>
  );
}
