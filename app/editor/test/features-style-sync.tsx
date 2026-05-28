"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import type { DroMapFeature } from "@/lib/dromap/feature";
import { getLeafletDashArray } from "./feature-style";
import { createMarkerLeafletIcon } from "./marker-symbol";
import { featureHasLineArrow, getLineArrowStyle } from "./line-arrow";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";

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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createTextIcon(feature: DroMapFeature) {
  const text = feature.properties.label?.trim() || "Texte";
  const color = safeColor(feature.properties.style.color, "#111827");
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

function applyFeatureStyleToLayer(layer: L.Layer, feature: DroMapFeature) {
  const style = feature.properties?.style ?? {};
  const type = feature.properties?.type;
  const geometryType = feature.geometry?.type;

  const color = safeColor(style.color);
  const fillColor = safeColor(style.fillColor ?? style.color);
  const rawOpacity = clamp(style.opacity ?? 1, 0, 1);
  const opacity =
    featureHasLineArrow(feature) && rawOpacity <= 0.05
      ? getLineArrowStyle(feature).opacity
      : rawOpacity;
  const fillOpacity = clamp(style.fillOpacity ?? 0.3, 0, 1);
  const weight = clamp(style.weight ?? 3, 1, 20);
  const dashArray = getLeafletDashArray(feature);

  const isText = type === "text";
  const isMarker = type === "marker" || (geometryType === "Point" && !isText);
  const isLine = type === "line" || geometryType === "LineString";
  const isZone = type === "zone" || geometryType === "Polygon";

  if (isText && layer instanceof L.Marker) {
    layer.setOpacity(1);
    layer.setIcon(createTextIcon(feature));
    return;
  }

  if (isMarker && layer instanceof L.Marker) {
    layer.setOpacity(1);
    layer.setIcon(createMarkerLeafletIcon(feature, L));
    return;
  }

  if ((isLine || isZone) && layer instanceof L.Path) {
    const isHiddenInteractionLine = isLine && featureHasLineArrow(feature);

    layer.setStyle({
      color,
      opacity: isHiddenInteractionLine ? 0 : opacity,
      weight,
      fillColor,
      fillOpacity: isZone ? fillOpacity : 0,
      dashArray,
      lineCap: "round",
      lineJoin: "round",
    });
  }
}

export function FeaturesStyleSync() {
  const map = useMap();

  const features = useEditorTestFeaturesStore((state) => state.features);

  useEffect(() => {
    const featuresById = new Map(
      features.map((feature) => [feature.id, feature]),
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
