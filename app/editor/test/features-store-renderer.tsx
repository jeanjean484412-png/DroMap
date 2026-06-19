"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import type { DroMapFeature } from "@/lib/dromap/feature";
import { getFeaturesByDrawOrder } from "@/lib/dromap/feature-order";
import { getLeafletDashArray } from "./feature-style";
import {
  createLineArrowBodyLeafletLayer,
  createLineArrowLeafletLayer,
  featureHasLineArrow,
  getLineArrowStyle,
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
import { bindLayerGeomanEvents } from "@/lib/dromap/geoman-sync";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestToolStore } from "@/stores/editor-test-tool";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import {
  getRenderableFeaturesForLayers,
  useEditorTestLayersStore,
} from "@/stores/editor-test-layers";

const LINE_SELECTION_HITBOX_EXTRA_WEIGHT = 4;
const LINE_SELECTION_HITBOX_MIN_WEIGHT = 7;
const DROMAP_FEATURE_PANE_PREFIX = "dromap-feature-pane-";
const DROMAP_FEATURE_PANE_BASE_Z_INDEX = 430;
const DROMAP_FEATURE_PANE_STEP = 8;

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
    paneNamesById.set(feature.id, ensureFeaturePane(map, feature, index, activeTool));
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

function findLayerByFeatureId(map: L.Map, featureId: string) {
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

    (outlineLayer as DromapZoneOutlineLayer).dromapZoneOutlineOwnerId = feature.id;
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
    opacity: shouldHideFullArrowLine || useAlignedZoneOutline ? 0 : zoneStrokeOpacity,
    weight: getZoneStrokeEnabled(feature) && !useAlignedZoneOutline ? (style.weight ?? 3) : 0,
    stroke: !isZone || (getZoneStrokeEnabled(feature) && !useAlignedZoneOutline),
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

function createTextIcon(feature: DroMapFeature) {
  const renderedText = createTextDivIconRender(feature, {
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

function createPointIcon(feature: DroMapFeature) {
  if (feature.properties.type === "text") {
    return createTextIcon(feature);
  }

  return createMarkerLeafletIcon(feature, L);
}

function lngLatToLatLng(coordinates: [number, number]): L.LatLngExpression {
  const [lng, lat] = coordinates;
  return [lat, lng];
}

function createLayerFromFeature(
  feature: DroMapFeature,
  paneName?: string,
): L.Layer | null {
  const geometry = feature.geometry;

  if (geometry.type === "Point") {
    return L.marker(lngLatToLatLng(geometry.coordinates), {
      icon: createPointIcon(feature),
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
  paneName?: string,
): boolean {
  if (!layerUsesExpectedPane(layer, paneName)) {
    return false;
  }

  const geometry = feature.geometry;

  if (geometry.type === "Point" && layer instanceof L.Marker) {
    layer.setLatLng(lngLatToLatLng(geometry.coordinates));
    layer.setIcon(createPointIcon(feature));
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
  const workspaceBounds = useEditorTestWorkspaceStore((state) => state.workspaceBounds);

  useEffect(() => {
    const renderableFeatures = getRenderableFeaturesForLayers(features, layers, {
      workspaceBounds,
    });
    const featuresByDrawOrder = getFeaturesByDrawOrder(renderableFeatures);
    const paneNamesById = getFeaturePaneNamesById(map, featuresByDrawOrder, activeTool);
    const featureIds = new Set(renderableFeatures.map((feature) => feature.id));

    map.eachLayer((layer) => {
      const featureId = getLayerFeatureId(layer);

      if (featureId && !featureIds.has(featureId)) {
        map.removeLayer(layer);
      }
    });

    if (shouldUseInteractiveFeatureHitboxes(activeTool)) {
      syncLineHitboxLayers(map, featuresByDrawOrder, paneNamesById);
    } else {
      removeLineHitboxLayers(map);
    }

    for (const feature of featuresByDrawOrder) {
      const existingLayer = findLayerByFeatureId(map, feature.id);

      if (existingLayer) {
        const updated = updateExistingLayerFromFeature(
          existingLayer,
          feature,
          paneNamesById.get(feature.id),
        );

        if (updated) {
          continue;
        }

        map.removeLayer(existingLayer);
      }

      const layer = createLayerFromFeature(
        feature,
        paneNamesById.get(feature.id),
      );

      if (!layer) {
        continue;
      }

      setLayerFeatureId(layer, feature.id);
      bindLayerGeomanEvents(layer);
      layer.addTo(map);
    }

    syncLineArrowLayers(map, featuresByDrawOrder, paneNamesById);
    syncZoneHatchingLayers(map, featuresByDrawOrder, paneNamesById);
    syncZoneOutlineLayers(map, featuresByDrawOrder, paneNamesById);
    applyFeatureLayerDrawOrder(map, featuresByDrawOrder, paneNamesById, activeTool);

    const handleViewportChange = () => {
      syncLineArrowLayers(map, featuresByDrawOrder, paneNamesById);
      syncZoneHatchingLayers(map, featuresByDrawOrder, paneNamesById);
      syncZoneOutlineLayers(map, featuresByDrawOrder, paneNamesById);
      applyFeatureLayerDrawOrder(map, featuresByDrawOrder, paneNamesById, activeTool);
    };

    map.on("moveend zoomend resize", handleViewportChange);

    return () => {
      map.off("moveend zoomend resize", handleViewportChange);
      removeLineArrowLayers(map);
      removeLineHitboxLayers(map);
      removeZoneHatchingLayers(map);
      removeZoneOutlineLayers(map);
    };
  }, [features, layers, activeTool, map, workspaceBounds]);

  return null;
}
