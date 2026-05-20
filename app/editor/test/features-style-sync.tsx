"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";

type Style = {
  color?: string;
  fillColor?: string;
  opacity?: number;
  fillOpacity?: number;
  weight?: number;
};

type FeatureLike = {
  id?: string;
  geometry?: {
    type?: string;
  };
  properties?: {
    type?: string;
    style?: Style;
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function safeColor(color: unknown, fallback = "#e63946") {
  if (typeof color !== "string") return fallback;

  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return color;
  }

  return fallback;
}

function createMarkerIcon(color: string, opacity: number) {
  const safeMarkerColor = safeColor(color);
  const safeOpacity = clamp(opacity, 0, 1);

  return L.divIcon({
    className: "",
    html: `
      <div
        style="
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          background: ${safeMarkerColor};
          opacity: ${safeOpacity};
          border: 2px solid white;
          box-shadow: 0 1px 4px rgba(0,0,0,0.35);
        "
      ></div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function applyFeatureStyleToLayer(layer: L.Layer, feature: FeatureLike) {
  const style = feature.properties?.style ?? {};
  const type = feature.properties?.type;
  const geometryType = feature.geometry?.type;

  const color = safeColor(style.color);
  const fillColor = safeColor(style.fillColor ?? style.color);
  const opacity = clamp(style.opacity ?? 1, 0, 1);
  const fillOpacity = clamp(style.fillOpacity ?? 0.3, 0, 1);
  const weight = clamp(style.weight ?? 3, 1, 20);

  const isMarker = type === "marker" || geometryType === "Point";
  const isLine = type === "line" || geometryType === "LineString";
  const isZone = type === "zone" || geometryType === "Polygon";

  if (isMarker && layer instanceof L.Marker) {
    layer.setOpacity(opacity);
    layer.setIcon(createMarkerIcon(color, opacity));
    return;
  }

  if ((isLine || isZone) && layer instanceof L.Path) {
    layer.setStyle({
      color,
      opacity,
      weight,
      fillColor,
      fillOpacity: isZone ? fillOpacity : 0,
    });
  }
}

export function FeaturesStyleSync() {
  const map = useMap();

  const features = useEditorTestFeaturesStore(
    (state) => state.features
  ) as FeatureLike[];

  useEffect(() => {
    const featuresById = new Map(
      features
        .filter((feature) => feature.id)
        .map((feature) => [feature.id, feature])
    );

    map.eachLayer((layer) => {
      const featureId = (layer as L.Layer & { dromapFeatureId?: string })
        .dromapFeatureId;

      if (!featureId) return;

      const feature = featuresById.get(featureId);
      if (!feature) return;

      applyFeatureStyleToLayer(layer, feature);
    });
  }, [map, features]);

  return null;
}