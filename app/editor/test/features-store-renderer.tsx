"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import type { DroMapFeature } from "@/lib/dromap/feature";
import { getFeaturesByDrawOrder } from "@/lib/dromap/feature-order";
import { scaleFeatureForVisualZoom } from "@/lib/dromap/feature-visual-scale";
import { getFeatureMarkerSize, getLeafletDashArray } from "./feature-style";
import {
  createLineArrowBodyLeafletLayer,
  createLineArrowLeafletLayer,
  featureHasLineArrow,
  getLineArrowStyle,
} from "./line-arrow";
import { createMarkerLeafletIcon } from "./marker-symbol";
import {
  createTextDivIconRender,
  getTextFeatureReferenceZoom,
  getTextMapZoomScale,
} from "./text-rendering";
import { createZoneHatchingLeafletLayer } from "./zone-hatching";
import {
  createAlignedZoneOutlineLeafletLayer,
  shouldUseAlignedZoneOutline,
} from "./zone-outline";
import {
  getZoneStrokeEnabled,
  getZoneVisibleFillOpacity,
  getZoneVisibleStrokeOpacity,
} from "./zone-style";
import { bindLayerGeomanEvents } from "@/lib/dromap/geoman-sync";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestToolStore } from "@/stores/editor-test-tool";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { useEditorTestMapLabelsStore } from "@/stores/editor-test-map-labels";
import {
  getRenderableFeaturesForLayers,
  isFeatureEffectivelyLocked,
  useEditorTestLayersStore,
} from "@/stores/editor-test-layers";
import {
  FEATURE_MAP_LABEL_MAX_WIDTH_PX,
  clampFeatureMapLabelRenderScale,
  createFeatureMapLabelScreenLayouts,
  getFeatureMapLabelAnchor,
  getFeatureMapLabelManualOffsetAtZoom,
  getFeatureMapLabelText,
  shouldShowFeatureMapLabel,
} from "./feature-map-labels";

const LINE_SELECTION_HITBOX_EXTRA_WEIGHT = 4;
const LINE_SELECTION_HITBOX_MIN_WEIGHT = 7;
const DROMAP_FEATURE_PANE_PREFIX = "dromap-feature-pane-";
const DROMAP_FEATURE_PANE_BASE_Z_INDEX = 430;
const DROMAP_FEATURE_PANE_STEP = 8;
const DROMAP_FEATURE_LABEL_PANE = "dromap-feature-label-pane";
const DROMAP_FEATURE_LABEL_PANE_Z_INDEX_GAP = 100;

function shouldUseInteractiveFeatureHitboxes(activeTool: string) {
  return activeTool === "select" || activeTool === "edit";
}

function getPanePointerEventsForTool(activeTool: string) {
  return shouldUseInteractiveFeatureHitboxes(activeTool) ? "auto" : "none";
}

function getFeaturePaneName(featureId: string) {
  return `${DROMAP_FEATURE_PANE_PREFIX}${featureId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function ensureFeaturePane(
  map: L.Map,
  feature: DroMapFeature,
  drawIndex: number,
  activeTool: string,
) {
  const paneName = getFeaturePaneName(feature.id);
  const pane = map.getPane(paneName) ?? map.createPane(paneName);

  pane.style.zIndex = String(
    DROMAP_FEATURE_PANE_BASE_Z_INDEX + drawIndex * DROMAP_FEATURE_PANE_STEP,
  );
  pane.style.pointerEvents = getPanePointerEventsForTool(activeTool);

  return paneName;
}

function getFeaturePaneNamesById(
  map: L.Map,
  features: DroMapFeature[],
  activeTool: string,
) {
  const paneNamesById = new Map<string, string>();

  features.forEach((feature, index) => {
    paneNamesById.set(
      feature.id,
      ensureFeaturePane(map, feature, index, activeTool),
    );
  });

  return paneNamesById;
}

type DromapLayer = L.Layer & {
  dromapFeatureId?: string;
};

type DromapArrowLayer = L.Layer & {
  dromapArrowOwnerId?: string;
  dromapArrowKind?: "line-body" | "line-end";
};

type DromapLineHitboxLayer = L.Layer & {
  dromapHitboxOwnerId?: string;
};

type DromapZoneHatchingLayer = L.Layer & {
  dromapHatchOwnerId?: string;
};

type DromapZoneOutlineLayer = L.Layer & {
  dromapZoneOutlineOwnerId?: string;
};

type GeomanEditableLayer = L.Layer & {
  pm?: {
    enabled?: () => boolean;
    disable?: () => void;
    enable?: () => void;
  };
};

type LayerWithPaneOption = L.Layer & {
  options?: {
    pane?: string;
  };
};

function layerUsesExpectedPane(layer: L.Layer, paneName?: string) {
  if (!paneName) {
    return true;
  }

  return (layer as LayerWithPaneOption).options?.pane === paneName;
}

function refreshGeomanEditHandles(layer: L.Layer) {
  const geomanLayer = layer as GeomanEditableLayer;
  const pm = geomanLayer.pm;

  if (!pm?.enabled || !pm.disable || !pm.enable) {
    return;
  }

  if (!pm.enabled()) {
    return;
  }

  pm.disable();
  pm.enable();
}

function getLayerFeatureId(layer: L.Layer) {
  return (layer as DromapLayer).dromapFeatureId;
}

function getLayerDrawOrderOwnerId(layer: L.Layer) {
  const dromapLayer = layer as DromapLayer &
    DromapArrowLayer &
    DromapLineHitboxLayer;

  return (
    dromapLayer.dromapFeatureId ??
    dromapLayer.dromapArrowOwnerId ??
    dromapLayer.dromapHitboxOwnerId ??
    (dromapLayer as DromapZoneHatchingLayer).dromapHatchOwnerId ??
    (dromapLayer as DromapZoneOutlineLayer).dromapZoneOutlineOwnerId
  );
}

function setLayerFeatureId(layer: L.Layer, featureId: string) {
  (layer as DromapLayer).dromapFeatureId = featureId;
}

function findLayerByFeatureId(map: L.Map, featureId: string): L.Layer | null {
  let foundLayer: L.Layer | null = null;

  map.eachLayer((layer) => {
    if (getLayerFeatureId(layer) === featureId) {
      foundLayer = layer;
    }
  });

  return foundLayer;
}

function isDromapArrowLayer(layer: L.Layer): layer is DromapArrowLayer {
  return Boolean((layer as DromapArrowLayer).dromapArrowOwnerId);
}

function removeLineArrowLayers(map: L.Map) {
  const layersToRemove: L.Layer[] = [];

  map.eachLayer((layer) => {
    if (isDromapArrowLayer(layer)) {
      layersToRemove.push(layer);
    }
  });

  for (const layer of layersToRemove) {
    map.removeLayer(layer);
  }
}

function isDromapLineHitboxLayer(
  layer: L.Layer,
): layer is DromapLineHitboxLayer {
  return Boolean((layer as DromapLineHitboxLayer).dromapHitboxOwnerId);
}

function isDromapZoneHatchingLayer(
  layer: L.Layer,
): layer is DromapZoneHatchingLayer {
  return Boolean((layer as DromapZoneHatchingLayer).dromapHatchOwnerId);
}

function removeLineHitboxLayers(map: L.Map) {
  const layersToRemove: L.Layer[] = [];

  map.eachLayer((layer) => {
    if (isDromapLineHitboxLayer(layer)) {
      layersToRemove.push(layer);
    }
  });

  for (const layer of layersToRemove) {
    map.removeLayer(layer);
  }
}

function removeZoneHatchingLayers(map: L.Map) {
  const layersToRemove: L.Layer[] = [];

  map.eachLayer((layer) => {
    if (isDromapZoneHatchingLayer(layer)) {
      layersToRemove.push(layer);
    }
  });

  for (const layer of layersToRemove) {
    map.removeLayer(layer);
  }
}

function isDromapZoneOutlineLayer(
  layer: L.Layer,
): layer is DromapZoneOutlineLayer {
  return Boolean((layer as DromapZoneOutlineLayer).dromapZoneOutlineOwnerId);
}

function removeZoneOutlineLayers(map: L.Map) {
  const layersToRemove: L.Layer[] = [];

  map.eachLayer((layer) => {
    if (isDromapZoneOutlineLayer(layer)) {
      layersToRemove.push(layer);
    }
  });

  for (const layer of layersToRemove) {
    map.removeLayer(layer);
  }
}

function getLineHitboxWeight(feature: DroMapFeature) {
  const weight = feature.properties.style.weight ?? 3;

  return Math.max(
    weight + LINE_SELECTION_HITBOX_EXTRA_WEIGHT,
    LINE_SELECTION_HITBOX_MIN_WEIGHT,
  );
}

function createLineHitboxLayer(
  feature: DroMapFeature,
  paneName?: string,
): L.Polyline | null {
  if (feature.geometry.type !== "LineString") {
    return null;
  }

  const latLngs = feature.geometry.coordinates.map((coordinate) =>
    lngLatToLatLng(coordinate),
  );

  return L.polyline(latLngs, {
    color: "transparent",
    opacity: 1,
    weight: getLineHitboxWeight(feature),
    lineCap: "round",
    lineJoin: "round",
    interactive: true,
    bubblingMouseEvents: false,
    className: "dromap-line-selection-hitbox",
    pmIgnore: true,
    ...(paneName ? { pane: paneName } : {}),
  } as L.PolylineOptions & { pmIgnore: boolean });
}

function syncLineHitboxLayers(
  map: L.Map,
  features: DroMapFeature[],
  paneNamesById: Map<string, string>,
) {
  removeLineHitboxLayers(map);

  for (const feature of features) {
    const hitboxLayer = createLineHitboxLayer(
      feature,
      paneNamesById.get(feature.id),
    );

    if (!hitboxLayer) {
      continue;
    }

    (hitboxLayer as DromapLineHitboxLayer).dromapHitboxOwnerId = feature.id;
    hitboxLayer.addTo(map);
  }
}

function syncZoneHatchingLayers(
  map: L.Map,
  features: DroMapFeature[],
  paneNamesById: Map<string, string>,
) {
  removeZoneHatchingLayers(map);

  for (const feature of features) {
    if (feature.properties.type !== "zone") {
      continue;
    }

    const hatchingLayer = createZoneHatchingLeafletLayer(
      feature,
      map,
      L,
      paneNamesById.get(feature.id),
    );

    if (!hatchingLayer) {
      continue;
    }

    (hatchingLayer as DromapZoneHatchingLayer).dromapHatchOwnerId = feature.id;
    hatchingLayer.eachLayer((layer) => {
      (layer as DromapZoneHatchingLayer).dromapHatchOwnerId = feature.id;
    });
    hatchingLayer.addTo(map);
  }
}

function syncZoneOutlineLayers(
  map: L.Map,
  features: DroMapFeature[],
  paneNamesById: Map<string, string>,
) {
  removeZoneOutlineLayers(map);

  for (const feature of features) {
    if (feature.properties.type !== "zone") {
      continue;
    }

    const outlineLayer = createAlignedZoneOutlineLeafletLayer(
      feature,
      map,
      L,
      paneNamesById.get(feature.id),
    );

    if (!outlineLayer) {
      continue;
    }

    (outlineLayer as DromapZoneOutlineLayer).dromapZoneOutlineOwnerId =
      feature.id;
    outlineLayer.eachLayer((layer) => {
      (layer as DromapZoneOutlineLayer).dromapZoneOutlineOwnerId = feature.id;
    });
    outlineLayer.addTo(map);
  }
}

function syncLineArrowLayers(
  map: L.Map,
  features: DroMapFeature[],
  paneNamesById: Map<string, string>,
) {
  removeLineArrowLayers(map);

  for (const feature of features) {
    const paneName = paneNamesById.get(feature.id);
    const bodyLayer = createLineArrowBodyLeafletLayer(
      feature,
      map,
      L,
      getPathOptions(feature, {
        interactionOnly: false,
        paneName,
      }),
    );

    if (bodyLayer) {
      const dromapBodyLayer = bodyLayer as DromapArrowLayer;
      dromapBodyLayer.dromapArrowOwnerId = feature.id;
      dromapBodyLayer.dromapArrowKind = "line-body";

      bodyLayer.addTo(map);
    }

    const arrowLayer = createLineArrowLeafletLayer(feature, map, L, paneName);

    if (!arrowLayer) {
      continue;
    }

    const dromapArrowLayer = arrowLayer as DromapArrowLayer;
    dromapArrowLayer.dromapArrowOwnerId = feature.id;
    dromapArrowLayer.dromapArrowKind = "line-end";

    arrowLayer.addTo(map);
  }
}

type LayerWithBringToFront = L.Layer & {
  bringToFront?: () => void;
};

function layerCanBringToFront(layer: L.Layer): layer is LayerWithBringToFront {
  return typeof (layer as LayerWithBringToFront).bringToFront === "function";
}

function applyFeatureLayerDrawOrder(
  map: L.Map,
  featuresByDrawOrder: DroMapFeature[],
  paneNamesById: Map<string, string>,
  activeTool: string,
) {
  const orderIndexByFeatureId = new Map<string, number>();
  const layersByFeatureId = new Map<string, L.Layer[]>();

  featuresByDrawOrder.forEach((feature, index) => {
    orderIndexByFeatureId.set(feature.id, index);

    const paneName = paneNamesById.get(feature.id);
    const pane = paneName ? map.getPane(paneName) : null;

    if (pane) {
      pane.style.zIndex = String(
        DROMAP_FEATURE_PANE_BASE_Z_INDEX + index * DROMAP_FEATURE_PANE_STEP,
      );
      pane.style.pointerEvents = getPanePointerEventsForTool(activeTool);
    }
  });

  map.eachLayer((layer) => {
    const ownerId = getLayerDrawOrderOwnerId(layer);

    if (!ownerId || !orderIndexByFeatureId.has(ownerId)) {
      return;
    }

    const currentLayers = layersByFeatureId.get(ownerId) ?? [];
    currentLayers.push(layer);
    layersByFeatureId.set(ownerId, currentLayers);

    const orderIndex = orderIndexByFeatureId.get(ownerId) ?? 0;

    if (layer instanceof L.Marker) {
      layer.setZIndexOffset(0);
    }
  });

  for (const feature of featuresByDrawOrder) {
    const layers = layersByFeatureId.get(feature.id) ?? [];

    for (const layer of layers) {
      if (layerCanBringToFront(layer)) {
        layer.bringToFront?.();
      }
    }
  }
}

function getPathOptions(
  feature: DroMapFeature,
  options: { interactionOnly?: boolean; paneName?: string } = {},
): L.PathOptions {
  const style = feature.properties.style;
  const shouldHideFullArrowLine =
    options.interactionOnly === true && featureHasLineArrow(feature);

  const displayOpacity = featureHasLineArrow(feature)
    ? getLineArrowStyle(feature).opacity
    : (style.opacity ?? 1);

  const isZone = feature.properties.type === "zone";
  const zoneStrokeOpacity = isZone
    ? getZoneVisibleStrokeOpacity(feature)
    : displayOpacity;
  const zoneFillOpacity = isZone ? getZoneVisibleFillOpacity(feature) : 0;
  const useAlignedZoneOutline = isZone && shouldUseAlignedZoneOutline(feature);

  return {
    color: style.color ?? "#e63946",
    opacity:
      shouldHideFullArrowLine || useAlignedZoneOutline ? 0 : zoneStrokeOpacity,
    weight:
      getZoneStrokeEnabled(feature) && !useAlignedZoneOutline
        ? (style.weight ?? 3)
        : 0,
    stroke:
      !isZone || (getZoneStrokeEnabled(feature) && !useAlignedZoneOutline),
    fill: isZone ? true : false,
    fillColor: style.fillColor ?? style.color ?? "#e63946",
    fillOpacity: zoneFillOpacity,
    dashArray: useAlignedZoneOutline ? undefined : getLeafletDashArray(feature),
    lineCap: "round",
    lineJoin: "round",
    className: "dromap-selectable-layer",
    ...(options.paneName ? { pane: options.paneName } : {}),
  };
}

function createTextIcon(feature: DroMapFeature, currentZoom: number) {
  const referenceZoom = getTextFeatureReferenceZoom(feature, currentZoom);
  const renderedText = createTextDivIconRender(feature, {
    scale: getTextMapZoomScale(currentZoom, referenceZoom),
    minWidth: 56,
    maxWidth: 520,
  });

  return L.divIcon({
    className: "dromap-text-icon",
    iconSize: [renderedText.width, renderedText.height],
    iconAnchor: [renderedText.anchorX, renderedText.anchorY],
    html: renderedText.html,
  });
}

function createPointIcon(feature: DroMapFeature, currentZoom: number) {
  if (feature.properties.type === "text") {
    return createTextIcon(feature, currentZoom);
  }

  return createMarkerLeafletIcon(feature, L);
}

type DromapFeatureMapLabelLayer = L.Marker & {
  dromapFeatureMapLabelOwnerId?: string;
};

function ensureFeatureMapLabelPane(map: L.Map, featureCount: number) {
  const pane =
    map.getPane(DROMAP_FEATURE_LABEL_PANE) ??
    map.createPane(DROMAP_FEATURE_LABEL_PANE);
  const highestFeaturePaneZIndex =
    DROMAP_FEATURE_PANE_BASE_Z_INDEX +
    Math.max(0, featureCount - 1) * DROMAP_FEATURE_PANE_STEP;

  // Les étiquettes doivent rester au-dessus de tous les objets, y compris
  // quand un calque converti contient des milliers d'entités et donc beaucoup
  // de panes d'ordre distinctes.
  pane.style.zIndex = String(
    highestFeaturePaneZIndex + DROMAP_FEATURE_LABEL_PANE_Z_INDEX_GAP,
  );
  // Le pane reste transparent aux événements ; seule l’icône sélectionnée
  // réactive pointer-events pour permettre son glisser-déposer.
  pane.style.pointerEvents = "none";

  return DROMAP_FEATURE_LABEL_PANE;
}

function measureFeatureMapLabelTextWidth(text: string, fontSize: number) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    return text.length * fontSize * 0.58;
  }

  context.font = `700 ${fontSize}px Arial, Helvetica, sans-serif`;
  return context.measureText(text).width;
}

function createFeatureMapLabelIcon(
  layout: ReturnType<typeof createFeatureMapLabelScreenLayouts> extends Map<
    string,
    infer T
  >
    ? T
    : never,
  draggable: boolean,
  outlineWidth: number,
) {
  const content = document.createElement("span");
  content.className = "dromap-feature-map-label";
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

  return L.divIcon({
    className: draggable
      ? "dromap-feature-map-label-icon dromap-feature-map-label-icon--draggable"
      : "dromap-feature-map-label-icon",
    html: content,
    iconSize: [layout.width, layout.height],
    iconAnchor: [layout.width / 2, layout.height / 2],
  });
}

function removeFeatureMapLabelLayers(map: L.Map) {
  const layersToRemove: L.Layer[] = [];

  map.eachLayer((layer) => {
    if ((layer as DromapFeatureMapLabelLayer).dromapFeatureMapLabelOwnerId) {
      layersToRemove.push(layer);
    }
  });

  for (const layer of layersToRemove) {
    map.removeLayer(layer);
  }
}

function clearLegacyFeatureMapLabel(layer: L.Layer) {
  const tooltipLayer = layer as L.Layer & {
    unbindTooltip?: () => L.Layer;
  };

  tooltipLayer.unbindTooltip?.();
}

function syncFeatureMapLabelLayers(
  map: L.Map,
  features: DroMapFeature[],
  showAllGeoJsonFeatureLabels: boolean,
  showAllFeatureLabels: boolean,
  labelScale: number,
  selectedFeatureId: string | null,
  activeTool: string,
  layers: ReturnType<typeof useEditorTestLayersStore.getState>["layers"],
  outlineWidth: number,
) {
  removeFeatureMapLabelLayers(map);
  const paneName = ensureFeatureMapLabelPane(map, features.length);
  const mapSize = map.getSize();
  const currentZoom = map.getZoom();
  const visibleLabelFeatures = features.filter((feature) =>
    shouldShowFeatureMapLabel(
      feature,
      showAllGeoJsonFeatureLabels,
      showAllFeatureLabels,
    ),
  );
  const requests = visibleLabelFeatures.flatMap((feature) => {
    const label = getFeatureMapLabelText(feature);
    const anchor = getFeatureMapLabelAnchor(feature);

    if (!label || !anchor) {
      return [];
    }

    const point = map.latLngToContainerPoint([anchor.lat, anchor.lng]);
    const manualOffset = getFeatureMapLabelManualOffsetAtZoom(
      feature,
      currentZoom,
    );

    return [
      {
        feature,
        text: label,
        anchorX: point.x,
        anchorY: point.y,
        labelScale,
        markerRadius:
          feature.geometry.type === "Point" &&
          feature.properties.type === "marker"
            ? getFeatureMarkerSize(feature) / 2
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
  });
  const markerObstacles = features.flatMap((feature) => {
    if (
      feature.geometry.type !== "Point" ||
      feature.properties.type !== "marker"
    ) {
      return [];
    }

    const point = map.latLngToContainerPoint([
      feature.geometry.coordinates[1],
      feature.geometry.coordinates[0],
    ]);

    return [
      {
        featureId: feature.id,
        centerX: point.x,
        centerY: point.y,
        radius: getFeatureMarkerSize(feature) / 2,
      },
    ];
  });
  const layouts = createFeatureMapLabelScreenLayouts(
    requests,
    { x: 0, y: 0, width: mapSize.x, height: mapSize.y },
    measureFeatureMapLabelTextWidth,
    markerObstacles,
  );

  const resolvedOffsets: Record<string, { x: number; y: number }> = {};

  for (const request of requests) {
    const anchor = getFeatureMapLabelAnchor(request.feature);
    const layout = layouts.get(request.feature.id);

    if (!anchor || !layout) {
      continue;
    }

    resolvedOffsets[request.feature.id] = {
      x: layout.offsetX,
      y: layout.offsetY,
    };

    const canDragLabel =
      selectedFeatureId === request.feature.id &&
      shouldUseInteractiveFeatureHitboxes(activeTool) &&
      !isFeatureEffectivelyLocked(request.feature, layers);
    const labelCenterLatLng = map.containerPointToLatLng([
      layout.centerX,
      layout.centerY,
    ]);
    const labelLayer = L.marker(labelCenterLatLng, {
      icon: createFeatureMapLabelIcon(layout, canDragLabel, outlineWidth),
      pane: paneName,
      interactive: canDragLabel,
      draggable: canDragLabel,
      keyboard: false,
      bubblingMouseEvents: false,
      autoPan: false,
    }) as DromapFeatureMapLabelLayer;

    labelLayer.dromapFeatureMapLabelOwnerId = request.feature.id;

    if (canDragLabel) {
      labelLayer.on("add", () => {
        const element = labelLayer.getElement();
        if (element) {
          L.DomEvent.disableClickPropagation(element);
          L.DomEvent.disableScrollPropagation(element);
        }
      });
      labelLayer.on("dragstart", () => {
        map.getContainer().classList.add("dromap-label-dragging");
      });
      labelLayer.on("dragend", () => {
        map.getContainer().classList.remove("dromap-label-dragging");
        const latestFeature = useEditorTestFeaturesStore
          .getState()
          .features.find((feature) => feature.id === request.feature.id);

        if (
          !latestFeature ||
          isFeatureEffectivelyLocked(
            latestFeature,
            useEditorTestLayersStore.getState().layers,
          )
        ) {
          return;
        }

        const latestAnchor = getFeatureMapLabelAnchor(latestFeature);
        if (!latestAnchor) {
          return;
        }

        const anchorPoint = map.latLngToContainerPoint([
          latestAnchor.lat,
          latestAnchor.lng,
        ]);
        const labelPoint = map.latLngToContainerPoint(labelLayer.getLatLng());
        const offsetX = labelPoint.x - anchorPoint.x;
        const offsetY = labelPoint.y - anchorPoint.y;
        const referenceZoom = map.getZoom();

        useEditorTestFeaturesStore
          .getState()
          .updateFeatureWithHistory(request.feature.id, (feature) => ({
            ...feature,
            properties: {
              ...feature.properties,
              mapLabelOffset: {
                x: offsetX,
                y: offsetY,
                referenceZoom,
              },
            },
          }));
      });
    }

    labelLayer.addTo(map);
  }

  return resolvedOffsets;
}

function lngLatToLatLng(coordinates: [number, number]): L.LatLngExpression {
  const [lng, lat] = coordinates;
  return [lat, lng];
}

function createLayerFromFeature(
  feature: DroMapFeature,
  paneName: string | undefined,
  currentZoom: number,
): L.Layer | null {
  const geometry = feature.geometry;

  if (geometry.type === "Point") {
    return L.marker(lngLatToLatLng(geometry.coordinates), {
      icon: createPointIcon(feature, currentZoom),
      ...(paneName ? { pane: paneName } : {}),
    });
  }

  if (geometry.type === "LineString") {
    const latLngs = geometry.coordinates.map((coordinate) =>
      lngLatToLatLng(coordinate),
    );

    return L.polyline(
      latLngs,
      getPathOptions(feature, {
        interactionOnly: featureHasLineArrow(feature),
        paneName,
      }),
    );
  }

  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates.map((ring) =>
      ring.map((coordinate) => lngLatToLatLng(coordinate)),
    );

    return L.polygon(rings, getPathOptions(feature, { paneName }));
  }

  return null;
}

function updateExistingLayerFromFeature(
  layer: L.Layer,
  feature: DroMapFeature,
  paneName: string | undefined,
  currentZoom: number,
): boolean {
  if (!layerUsesExpectedPane(layer, paneName)) {
    return false;
  }

  const geometry = feature.geometry;

  if (geometry.type === "Point" && layer instanceof L.Marker) {
    layer.setLatLng(lngLatToLatLng(geometry.coordinates));
    layer.setIcon(createPointIcon(feature, currentZoom));
    refreshGeomanEditHandles(layer);
    return true;
  }

  if (geometry.type === "LineString" && layer instanceof L.Polyline) {
    const latLngs = geometry.coordinates.map((coordinate) =>
      lngLatToLatLng(coordinate),
    );

    layer.setLatLngs(latLngs);
    layer.setStyle(
      getPathOptions(feature, {
        interactionOnly: featureHasLineArrow(feature),
        paneName,
      }),
    );
    refreshGeomanEditHandles(layer);
    return true;
  }

  if (geometry.type === "Polygon" && layer instanceof L.Polygon) {
    const rings = geometry.coordinates.map((ring) =>
      ring.map((coordinate) => lngLatToLatLng(coordinate)),
    );

    layer.setLatLngs(rings);
    layer.setStyle(getPathOptions(feature, { paneName }));
    refreshGeomanEditHandles(layer);
    return true;
  }

  return false;
}

export function FeaturesStoreRenderer() {
  const map = useMap();

  const features = useEditorTestFeaturesStore((state) => state.features);
  const layers = useEditorTestLayersStore((state) => state.layers);
  const activeTool = useEditorTestToolStore((state) => state.activeTool);
  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );
  const workspaceBasemapBaseZoom = useEditorTestWorkspaceStore(
    (state) => state.workspaceBasemapBaseZoom,
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
  const selectedFeatureId = useEditorTestSelectionStore(
    (state) => state.selectedFeatureId,
  );

  useEffect(() => {
    const renderableFeatures = getRenderableFeaturesForLayers(
      features,
      layers,
      {
        workspaceBounds,
      },
    );
    const sourceFeaturesByDrawOrder =
      getFeaturesByDrawOrder(renderableFeatures);
    const featureIds = new Set(renderableFeatures.map((feature) => feature.id));
    const fallbackReferenceZoom =
      typeof workspaceBasemapBaseZoom === "number" &&
      Number.isFinite(workspaceBasemapBaseZoom)
        ? workspaceBasemapBaseZoom
        : map.getZoom();

    const getCurrentFeatureMapLabelScale = () =>
      clampFeatureMapLabelRenderScale(
        getTextMapZoomScale(map.getZoom(), fallbackReferenceZoom) *
          featureMapLabelScale,
      );

    const renderAtCurrentZoom = () => {
      const currentZoom = map.getZoom();
      const displayFeaturesByDrawOrder = sourceFeaturesByDrawOrder.map(
        (feature) =>
          scaleFeatureForVisualZoom(
            feature,
            currentZoom,
            fallbackReferenceZoom,
            { scaleText: false },
          ),
      );
      const paneNamesById = getFeaturePaneNamesById(
        map,
        displayFeaturesByDrawOrder,
        activeTool,
      );

      map.eachLayer((layer) => {
        const featureId = getLayerFeatureId(layer);

        if (featureId && !featureIds.has(featureId)) {
          map.removeLayer(layer);
        }
      });

      if (shouldUseInteractiveFeatureHitboxes(activeTool)) {
        syncLineHitboxLayers(map, displayFeaturesByDrawOrder, paneNamesById);
      } else {
        removeLineHitboxLayers(map);
      }

      for (const feature of displayFeaturesByDrawOrder) {
        const existingLayer = findLayerByFeatureId(map, feature.id);

        if (existingLayer) {
          const updated = updateExistingLayerFromFeature(
            existingLayer,
            feature,
            paneNamesById.get(feature.id),
            currentZoom,
          );

          if (updated) {
            clearLegacyFeatureMapLabel(existingLayer);
            continue;
          }

          map.removeLayer(existingLayer);
        }

        const layer = createLayerFromFeature(
          feature,
          paneNamesById.get(feature.id),
          currentZoom,
        );

        if (!layer) {
          continue;
        }

        setLayerFeatureId(layer, feature.id);
        clearLegacyFeatureMapLabel(layer);
        bindLayerGeomanEvents(layer);
        layer.addTo(map);
      }

      const currentFeatureMapLabelRenderScale =
        getCurrentFeatureMapLabelScale();

      const resolvedFeatureMapLabelOffsets = syncFeatureMapLabelLayers(
        map,
        displayFeaturesByDrawOrder,
        showAllGeoJsonFeatureLabels,
        showAllFeatureLabels,
        currentFeatureMapLabelRenderScale,
        selectedFeatureId,
        activeTool,
        layers,
        featureMapLabelOutlineWidth,
      );

      useEditorTestMapLabelsStore
        .getState()
        .setEditorFeatureMapLabelRenderContext(
          currentFeatureMapLabelRenderScale,
          currentZoom,
          resolvedFeatureMapLabelOffsets,
        );
      syncLineArrowLayers(map, displayFeaturesByDrawOrder, paneNamesById);
      syncZoneHatchingLayers(map, displayFeaturesByDrawOrder, paneNamesById);
      syncZoneOutlineLayers(map, displayFeaturesByDrawOrder, paneNamesById);
      applyFeatureLayerDrawOrder(
        map,
        displayFeaturesByDrawOrder,
        paneNamesById,
        activeTool,
      );
    };

    renderAtCurrentZoom();

    map.on("moveend zoomend resize", renderAtCurrentZoom);

    return () => {
      map.off("moveend zoomend resize", renderAtCurrentZoom);
      removeFeatureMapLabelLayers(map);
      removeLineArrowLayers(map);
      removeLineHitboxLayers(map);
      removeZoneHatchingLayers(map);
      removeZoneOutlineLayers(map);
    };
  }, [
    features,
    layers,
    activeTool,
    map,
    workspaceBounds,
    workspaceBasemapBaseZoom,
    showAllGeoJsonFeatureLabels,
    showAllFeatureLabels,
    featureMapLabelScale,
    featureMapLabelOutlineWidth,
    selectedFeatureId,
  ]);

  return (
    <style>{`
      .dromap-feature-map-label-icon {
        border: 0 !important;
        background: transparent !important;
        pointer-events: none !important;
      }

      .dromap-feature-map-label-icon--draggable {
        pointer-events: auto !important;
        cursor: grab !important;
      }

      .dromap-feature-map-label-icon--draggable:active,
      .dromap-label-dragging .dromap-feature-map-label-icon--draggable {
        cursor: grabbing !important;
      }

      .dromap-feature-map-label {
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
    `}</style>
  );
}
