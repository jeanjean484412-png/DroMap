"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import type { DroMapFeature } from "@/lib/dromap/feature";
import { getLeafletDashArray } from "./feature-style";
import { shouldUseAlignedZoneOutline } from "./zone-outline";
import { createMarkerLeafletIcon } from "./marker-symbol";
import { featureHasLineArrow, getLineArrowStyle } from "./line-arrow";
import { createTextDivIconRender } from "./text-rendering";
import {
  getZoneFillEnabled,
  getZoneStrokeEnabled,
  getZoneVisibleFillOpacity,
  getZoneVisibleStrokeOpacity,
} from "./zone-style";
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
  const weight = clamp(style.weight ?? 3, 0, 20);
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
    const zoneStrokeEnabled = isZone && getZoneStrokeEnabled(feature);
    const zoneFillEnabled = isZone && getZoneFillEnabled(feature);
    const useAlignedZoneOutline = isZone && shouldUseAlignedZoneOutline(feature);

    layer.setStyle({
      color,
      opacity: isHiddenInteractionLine
        ? 0
        : isZone
          ? useAlignedZoneOutline
            ? 0
            : getZoneVisibleStrokeOpacity(feature)
          : opacity,
      weight: isZone ? (zoneStrokeEnabled && !useAlignedZoneOutline ? weight : 0) : weight,
      stroke: isZone ? zoneStrokeEnabled && !useAlignedZoneOutline : true,
      fill: isZone ? true : false,
      fillColor,
      fillOpacity:
        isZone && zoneFillEnabled ? getZoneVisibleFillOpacity(feature) : 0,
      dashArray: useAlignedZoneOutline ? undefined : dashArray,
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
