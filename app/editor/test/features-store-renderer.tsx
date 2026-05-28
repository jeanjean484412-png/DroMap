"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import type { DroMapFeature } from "@/lib/dromap/feature";
import { getLeafletDashArray } from "./feature-style";
import {
  createLineArrowBodyLeafletLayer,
  createLineArrowLeafletLayer,
  featureHasLineArrow,
  getLineArrowStyle,
} from "./line-arrow";
import { createMarkerLeafletIcon } from "./marker-symbol";
import { bindLayerGeomanEvents } from "@/lib/dromap/geoman-sync";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";

type DromapLayer = L.Layer & {
  dromapFeatureId?: string;
};

type DromapArrowLayer = L.Layer & {
  dromapArrowOwnerId?: string;
  dromapArrowKind?: "line-body" | "line-end";
};

type GeomanEditableLayer = L.Layer & {
  pm?: {
    enabled?: () => boolean;
    disable?: () => void;
    enable?: () => void;
  };
};

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

function syncLineArrowLayers(map: L.Map, features: DroMapFeature[]) {
  removeLineArrowLayers(map);

  for (const feature of features) {
    const bodyLayer = createLineArrowBodyLeafletLayer(
      feature,
      map,
      L,
      getPathOptions(feature, { interactionOnly: false }),
    );

    if (bodyLayer) {
      const dromapBodyLayer = bodyLayer as DromapArrowLayer;
      dromapBodyLayer.dromapArrowOwnerId = feature.id;
      dromapBodyLayer.dromapArrowKind = "line-body";

      bodyLayer.addTo(map);
    }

    const arrowLayer = createLineArrowLeafletLayer(feature, map, L);

    if (!arrowLayer) {
      continue;
    }

    const dromapArrowLayer = arrowLayer as DromapArrowLayer;
    dromapArrowLayer.dromapArrowOwnerId = feature.id;
    dromapArrowLayer.dromapArrowKind = "line-end";

    arrowLayer.addTo(map);
  }
}

function getPathOptions(
  feature: DroMapFeature,
  options: { interactionOnly?: boolean } = {},
): L.PathOptions {
  const style = feature.properties.style;
  const shouldHideFullArrowLine =
    options.interactionOnly === true && featureHasLineArrow(feature);

  const displayOpacity =
    featureHasLineArrow(feature) ? getLineArrowStyle(feature).opacity : style.opacity ?? 1;

  return {
    color: style.color ?? "#e63946",
    opacity: shouldHideFullArrowLine ? 0 : displayOpacity,
    weight: style.weight ?? 3,
    fillColor: style.fillColor ?? style.color ?? "#e63946",
    fillOpacity:
      feature.properties.type === "zone" ? style.fillOpacity ?? 0.3 : 0,
    dashArray: getLeafletDashArray(feature),
    lineCap: "round",
    lineJoin: "round",
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function createTextIcon(feature: DroMapFeature) {
  const text = feature.properties.label?.trim() || "Texte";
  const color = feature.properties.style.color ?? "#111827";
  const opacity = clamp(feature.properties.style.opacity ?? 1, 0, 1);
  const fontSize = clamp(feature.properties.style.fontSize ?? 22, 10, 72);

  const width = clamp(Math.round(text.length * fontSize * 0.62 + 24), 56, 420);
  const height = Math.round(fontSize * 1.35 + 14);

  return L.divIcon({
    className: "dromap-text-icon",
    iconSize: [width, height],
    iconAnchor: [width / 2, height / 2],
    html: `
      <span
        style="
          display:flex;
          align-items:center;
          justify-content:center;
          box-sizing:border-box;
          width:${width}px;
          height:${height}px;
          color:${color};
          opacity:${opacity};
          font-size:${fontSize}px;
          font-weight:700;
          line-height:1.15;
          white-space:nowrap;
          text-align:center;
          text-shadow:
            0 1px 3px rgba(255,255,255,0.95),
            0 1px 5px rgba(0,0,0,0.25);
          pointer-events:none;
        "
      >${escapeHtml(text)}</span>
    `,
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

function createLayerFromFeature(feature: DroMapFeature): L.Layer | null {
  const geometry = feature.geometry;

  if (geometry.type === "Point") {
    return L.marker(lngLatToLatLng(geometry.coordinates), {
      icon: createPointIcon(feature),
    });
  }

  if (geometry.type === "LineString") {
    const latLngs = geometry.coordinates.map((coordinate) =>
      lngLatToLatLng(coordinate),
    );

    return L.polyline(latLngs,
      getPathOptions(feature, { interactionOnly: featureHasLineArrow(feature) }),
    );
  }

  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates.map((ring) =>
      ring.map((coordinate) => lngLatToLatLng(coordinate)),
    );

    return L.polygon(rings, getPathOptions(feature));
  }

  return null;
}

function updateExistingLayerFromFeature(
  layer: L.Layer,
  feature: DroMapFeature,
): boolean {
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
      getPathOptions(feature, { interactionOnly: featureHasLineArrow(feature) }),
    );
    refreshGeomanEditHandles(layer);
    return true;
  }

  if (geometry.type === "Polygon" && layer instanceof L.Polygon) {
    const rings = geometry.coordinates.map((ring) =>
      ring.map((coordinate) => lngLatToLatLng(coordinate)),
    );

    layer.setLatLngs(rings);
    layer.setStyle(getPathOptions(feature));
    refreshGeomanEditHandles(layer);
    return true;
  }

  return false;
}

export function FeaturesStoreRenderer() {
  const map = useMap();

  const features = useEditorTestFeaturesStore((state) => state.features);

  useEffect(() => {
    const featureIds = new Set(features.map((feature) => feature.id));

    map.eachLayer((layer) => {
      const featureId = getLayerFeatureId(layer);

      if (featureId && !featureIds.has(featureId)) {
        map.removeLayer(layer);
      }
    });

    for (const feature of features) {
      const existingLayer = findLayerByFeatureId(map, feature.id);

      if (existingLayer) {
        const updated = updateExistingLayerFromFeature(existingLayer, feature);

        if (updated) {
          continue;
        }

        map.removeLayer(existingLayer);
      }

      const layer = createLayerFromFeature(feature);

      if (!layer) {
        continue;
      }

      setLayerFeatureId(layer, feature.id);
      bindLayerGeomanEvents(layer);
      layer.addTo(map);
    }

    syncLineArrowLayers(map, features);

    const handleViewportChange = () => {
      syncLineArrowLayers(map, features);
    };

    map.on("zoomend resize", handleViewportChange);

    return () => {
      map.off("zoomend resize", handleViewportChange);
      removeLineArrowLayers(map);
    };
  }, [features, map]);

  return null;
}