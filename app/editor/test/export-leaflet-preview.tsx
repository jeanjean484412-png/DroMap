"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, useMap } from "react-leaflet";

import "leaflet/dist/leaflet.css";

import type { DroMapFeature } from "@/lib/dromap/feature";
import { getFeaturesByDrawOrder } from "@/lib/dromap/feature-order";
import {
  getFeatureVisualScale,
  scaleFeatureForVisualZoom,
} from "@/lib/dromap/feature-visual-scale";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import {
  getRenderableFeaturesForLayers,
  useEditorTestLayersStore,
} from "@/stores/editor-test-layers";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import { useEditorTestBasemapStore } from "@/stores/editor-test-basemap";
import { useEditorTestExportStore } from "@/stores/editor-test-export";
import { useEditorTestMapLabelsStore } from "@/stores/editor-test-map-labels";

import { getFeatureMarkerSize, getLeafletDashArray } from "./feature-style";
import {
  FEATURE_MAP_LABEL_MAX_WIDTH_PX,
  clampFeatureMapLabelRenderScale,
  createFeatureMapLabelScreenLayouts,
  getFeatureMapLabelAnchor,
  getFeatureMapLabelManualOffsetAtZoom,
  getFeatureMapLabelText,
  shouldShowFeatureMapLabel,
} from "./feature-map-labels";
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
import {
  createTextDivIconRender,
  getTextMapZoomScale,
} from "./text-rendering";
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
const EXPORT_FEATURE_LABEL_PANE = "dromap-export-feature-label-pane";
const EXPORT_FEATURE_LABEL_PANE_Z_INDEX_GAP = 100;

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

function ensureExportFeatureLabelPane(map: L.Map, featureCount: number) {
  const pane =
    map.getPane(EXPORT_FEATURE_LABEL_PANE) ??
    map.createPane(EXPORT_FEATURE_LABEL_PANE);
  const highestFeaturePaneZIndex =
    EXPORT_FEATURE_PANE_BASE_Z_INDEX +
    Math.max(0, featureCount - 1) * EXPORT_FEATURE_PANE_STEP;

  pane.style.zIndex = String(
    highestFeaturePaneZIndex + EXPORT_FEATURE_LABEL_PANE_Z_INDEX_GAP,
  );
  pane.style.pointerEvents = "none";

  return EXPORT_FEATURE_LABEL_PANE;
}

function measureExportFeatureMapLabelTextWidth(text: string, fontSize: number) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    return text.length * fontSize * 0.58;
  }

  context.font = `700 ${fontSize}px Arial, Helvetica, sans-serif`;
  return context.measureText(text).width;
}

function createExportFeatureMapLabelLayer(
  feature: DroMapFeature,
  paneName: string,
  layout: ReturnType<typeof createFeatureMapLabelScreenLayouts> extends Map<
    string,
    infer T
  >
    ? T
    : never,
  outlineWidth: number,
) {
  const anchor = getFeatureMapLabelAnchor(feature);

  if (!anchor) {
    return null;
  }

  const content = document.createElement("span");
  content.className = "dromap-export-feature-map-label";
  content.textContent = layout.text;
  content.style.width = `${layout.width}px`;
  content.style.height = `${layout.height}px`;
  content.style.fontSize = `${layout.fontSize}px`;
  content.style.lineHeight = `${layout.lineHeight}px`;
  content.style.webkitTextStroke =
    outlineWidth > 0
      ? `${outlineWidth}px rgba(255, 255, 255, 0.98)`
      : "0 transparent";
  content.style.paintOrder = "stroke fill";
  content.style.textShadow =
    outlineWidth > 0 ? "0 0 1px rgba(255, 255, 255, 0.98)" : "none";

  const icon = L.divIcon({
    className: "dromap-export-feature-map-label-icon",
    html: content,
    iconSize: [layout.width, layout.height],
    iconAnchor: [
      layout.width / 2 - layout.offsetX,
      layout.height / 2 - layout.offsetY,
    ],
  });

  return L.marker([anchor.lat, anchor.lng], {
    icon,
    pane: paneName,
    interactive: false,
    keyboard: false,
    bubblingMouseEvents: false,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function createPointIcon(feature: DroMapFeature, textScale = 1) {
  if (feature.properties?.type === "text") {
    const renderedText = createTextDivIconRender(feature, {
      scale: textScale,
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
  textScale = 1,
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
      icon: createPointIcon(feature, textScale),
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
      weight:
        getZoneStrokeEnabled(feature) && !useAlignedZoneOutline
          ? style.weight
          : 0,
      stroke: getZoneStrokeEnabled(feature) && !useAlignedZoneOutline,
      fill: true,
      fillColor: style.fillColor,
      fillOpacity: getZoneFillEnabled(feature)
        ? getZoneVisibleFillOpacity(feature)
        : 0,
      dashArray: useAlignedZoneOutline
        ? undefined
        : getLeafletDashArray(feature),
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
  fallbackReferenceZoom,
  showAllGeoJsonFeatureLabels,
  showAllFeatureLabels,
  featureMapLabelScale,
  editorFeatureMapLabelRenderScale,
  editorFeatureMapLabelVisualZoom,
  editorFeatureMapLabelOffsets,
  featureMapLabelOutlineWidth,
}: {
  features: DroMapFeature[];
  fallbackReferenceZoom: number | null;
  showAllGeoJsonFeatureLabels: boolean;
  showAllFeatureLabels: boolean;
  featureMapLabelScale: number;
  editorFeatureMapLabelRenderScale: number | null;
  editorFeatureMapLabelVisualZoom: number | null;
  editorFeatureMapLabelOffsets: Record<string, { x: number; y: number }>;
  featureMapLabelOutlineWidth: number;
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
      const labelPaneName = ensureExportFeatureLabelPane(
        map,
        featuresByDrawOrder.length,
      );

      const currentZoom = map.getZoom();
      const safeFallbackReferenceZoom =
        typeof fallbackReferenceZoom === "number" &&
        Number.isFinite(fallbackReferenceZoom)
          ? fallbackReferenceZoom
          : currentZoom;
      const preparedFeatures = featuresByDrawOrder.map((feature) => {
        const previewFeature = scaleFeatureForVisualZoom(
          feature,
          currentZoom,
          safeFallbackReferenceZoom,
          { scaleText: false },
        );
        const featureVisualScale = getFeatureVisualScale(
          feature,
          currentZoom,
          safeFallbackReferenceZoom,
        );

        return { feature, previewFeature, featureVisualScale };
      });
      // L'éditeur fournit la taille réellement visible et le zoom auquel
      // elle a été mesurée. La preview applique seulement l'écart d'échelle
      // cartographique entre les deux scènes : la taille et la position restent
      // donc strictement proportionnelles aux mêmes objets.
      const hasEditorRenderContext =
        typeof editorFeatureMapLabelRenderScale === "number" &&
        Number.isFinite(editorFeatureMapLabelRenderScale) &&
        typeof editorFeatureMapLabelVisualZoom === "number" &&
        Number.isFinite(editorFeatureMapLabelVisualZoom);
      const previewZoomRatio = hasEditorRenderContext
        ? 2 ** (currentZoom - editorFeatureMapLabelVisualZoom)
        : 1;
      const labelVisualScale = clampFeatureMapLabelRenderScale(
        hasEditorRenderContext
          ? editorFeatureMapLabelRenderScale * previewZoomRatio
          : getTextMapZoomScale(currentZoom, safeFallbackReferenceZoom) *
              featureMapLabelScale,
      );
      const mapSize = map.getSize();
      const labelRequests = preparedFeatures.flatMap(
        ({ previewFeature }) => {
          if (
            !shouldShowFeatureMapLabel(
              previewFeature,
              showAllGeoJsonFeatureLabels,
              showAllFeatureLabels,
            )
          ) {
            return [];
          }

          const label = getFeatureMapLabelText(previewFeature);
          const anchor = getFeatureMapLabelAnchor(previewFeature);

          if (!label || !anchor) {
            return [];
          }

          const point = map.latLngToContainerPoint([anchor.lat, anchor.lng]);
          const labelScale = labelVisualScale;
          const editorResolvedOffset =
            editorFeatureMapLabelOffsets[previewFeature.id];
          const manualOffset = editorResolvedOffset
            ? {
                x: editorResolvedOffset.x * previewZoomRatio,
                y: editorResolvedOffset.y * previewZoomRatio,
              }
            : getFeatureMapLabelManualOffsetAtZoom(
                previewFeature,
                currentZoom,
              );

          return [
            {
              feature: previewFeature,
              text: label,
              anchorX: point.x,
              anchorY: point.y,
              labelScale,
              markerRadius:
                previewFeature.geometry.type === "Point" &&
                previewFeature.properties.type === "marker"
                  ? getFeatureMarkerSize(previewFeature) / 2
                  : 0,
              preferredPlacement: anchor.placement,
              ...(manualOffset
                ? {
                    manualOffsetX: manualOffset.x,
                    manualOffsetY: manualOffset.y,
                  }
                : {}),
              maxTextWidth: Math.max(
                24,
                Math.min(
                  FEATURE_MAP_LABEL_MAX_WIDTH_PX * labelScale,
                  mapSize.x * 0.34,
                ),
              ),
            },
          ];
        },
      );
      const markerObstacles = preparedFeatures.flatMap(({ previewFeature }) => {
        if (
          previewFeature.geometry.type !== "Point" ||
          previewFeature.properties.type !== "marker"
        ) {
          return [];
        }

        const point = map.latLngToContainerPoint([
          previewFeature.geometry.coordinates[1],
          previewFeature.geometry.coordinates[0],
        ]);

        return [
          {
            featureId: previewFeature.id,
            centerX: point.x,
            centerY: point.y,
            radius: getFeatureMarkerSize(previewFeature) / 2,
          },
        ];
      });
      const labelLayouts = createFeatureMapLabelScreenLayouts(
        labelRequests,
        { x: 0, y: 0, width: mapSize.x, height: mapSize.y },
        measureExportFeatureMapLabelTextWidth,
        markerObstacles,
      );

      for (const {
        feature,
        previewFeature,
        featureVisualScale,
      } of preparedFeatures) {
        const paneName = paneNamesById.get(feature.id);
        const layer = createLeafletLayerFromFeature(
          previewFeature,
          map,
          paneName,
          featureVisualScale,
        );

        if (layer) {
          group.addLayer(layer);
        }

        const labelLayout = labelLayouts.get(previewFeature.id);
        if (labelLayout) {
          const labelLayer = createExportFeatureMapLabelLayer(
            previewFeature,
            labelPaneName,
            labelLayout,
            featureMapLabelOutlineWidth * previewZoomRatio,
          );

          if (labelLayer) {
            group.addLayer(labelLayer);
          }
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
  }, [
    features,
    map,
    showAllGeoJsonFeatureLabels,
    showAllFeatureLabels,
    fallbackReferenceZoom,
    featureMapLabelScale,
    editorFeatureMapLabelRenderScale,
    editorFeatureMapLabelVisualZoom,
    editorFeatureMapLabelOffsets,
    featureMapLabelOutlineWidth,
  ]);

  return null;
}

function getPreviewAttributionHtml(
  basemap: ReturnType<typeof getDromapBasemapConfig>,
) {
  return getDromapExportAttributionHtml(basemap);
}

export function ExportLeafletPreview({
  symbolScale: _legacySymbolScale = 1,
}: ExportLeafletPreviewProps) {
  void _legacySymbolScale;
  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );
  const workspaceBasemapZoom = useEditorTestWorkspaceStore(
    (state) => state.workspaceBasemapZoom,
  );
  const basemapId = useEditorTestBasemapStore((state) => state.basemapId);
  const showBasemapLabels = useEditorTestExportStore(
    (state) => state.showBasemapLabels,
  );
  const showAllFeatureLabels = useEditorTestMapLabelsStore(
    (state) => state.showAllFeatureLabels,
  );
  const showAllGeoJsonFeatureLabels = useEditorTestMapLabelsStore(
    (state) => state.showAllGeoJsonFeatureLabels,
  );
  const featureMapLabelScale = useEditorTestMapLabelsStore(
    (state) => state.featureMapLabelScale,
  );
  const featureMapLabelOutlineWidth = useEditorTestMapLabelsStore(
    (state) => state.featureMapLabelOutlineWidth,
  );
  const editorFeatureMapLabelRenderScale = useEditorTestMapLabelsStore(
    (state) => state.editorFeatureMapLabelRenderScale,
  );
  const editorFeatureMapLabelVisualZoom = useEditorTestMapLabelsStore(
    (state) => state.editorFeatureMapLabelVisualZoom,
  );
  const editorFeatureMapLabelOffsets = useEditorTestMapLabelsStore(
    (state) => state.editorFeatureMapLabelOffsets,
  );
  const basemap = getDromapBasemapConfig(basemapId);
  const mapLibreFallbackBasemap =
    basemap.kind === "maplibre" && basemap.fallbackTileBasemapId
      ? getDromapBasemapConfig(basemap.fallbackTileBasemapId)
      : null;
  const mapLibreFallbackTileUrl =
    mapLibreFallbackBasemap?.kind === "tile"
      ? mapLibreFallbackBasemap.tileUrl
      : undefined;
  const rawFeatures = useEditorTestFeaturesStore((state) => state.features);
  const layers = useEditorTestLayersStore((state) => state.layers);
  const features = useMemo(
    () =>
      getRenderableFeaturesForLayers(rawFeatures, layers, { workspaceBounds }),
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
      <style>{`
        .dromap-export-feature-map-label-icon {
          border: 0 !important;
          background: transparent !important;
          pointer-events: none !important;
        }

        .dromap-export-feature-map-label {
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: visible;
          border: 0;
          background: transparent;
          box-shadow: none;
          color: #0f172a;
          padding: 0;
          font-weight: 700;
          -webkit-text-stroke: 0 transparent;
          paint-order: stroke fill;
          text-shadow: none;
          line-height: 1.15;
          text-align: center;
          text-overflow: clip;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          word-break: break-word;
          writing-mode: horizontal-tb;
          pointer-events: none !important;
          user-select: none;
        }

        .leaflet-tile.dromap-satellite-seamless-tile {
          width: 257px !important;
          height: 257px !important;
          max-width: none !important;
          max-height: none !important;
          outline: 1px solid transparent;
          backface-visibility: visible;
        }
      `}</style>

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
            className={
              basemap.id === "ign-satellite"
                ? "dromap-satellite-seamless-tile"
                : undefined
            }
            {...nativeZoomProps}
          />
        ) : null}

        {basemap.kind === "maplibre" ? (
          <MapLibreBasemapLayer
            key={`${basemap.id}-${basemap.styleUrl}-${forcedMapLibreDetailZoom ?? "auto"}-${showBasemapLabels ? "labels" : "no-labels"}`}
            styleUrl={basemap.styleUrl}
            attribution={basemap.attribution}
            lockedNativeZoom={forcedMapLibreDetailZoom}
            showTextLabels={showBasemapLabels}
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
          />
        ) : null}

        <BasemapBoundariesLayer boundaryOverlay={basemap.boundaryOverlay} />

        <ExportMapController bounds={leafletBounds} />
        <GeoJsonLayersRenderer />
        <ExportFeatureLayers
          features={features}
          fallbackReferenceZoom={workspaceBasemapZoom}
          showAllGeoJsonFeatureLabels={showAllGeoJsonFeatureLabels}
          showAllFeatureLabels={showAllFeatureLabels}
          featureMapLabelScale={featureMapLabelScale}
          editorFeatureMapLabelRenderScale={
            editorFeatureMapLabelRenderScale
          }
          editorFeatureMapLabelVisualZoom={editorFeatureMapLabelVisualZoom}
          editorFeatureMapLabelOffsets={editorFeatureMapLabelOffsets}
          featureMapLabelOutlineWidth={featureMapLabelOutlineWidth}
        />
      </MapContainer>

      {getPreviewAttributionHtml(basemap) ? (
        <div
          className="pointer-events-auto absolute bottom-px right-px max-w-[62%] rounded-sm bg-white/35 px-1 py-px text-right text-[7px] leading-none text-slate-600/70"
          dangerouslySetInnerHTML={{
            __html: getPreviewAttributionHtml(basemap),
          }}
        />
      ) : null}
    </div>
  );
}
