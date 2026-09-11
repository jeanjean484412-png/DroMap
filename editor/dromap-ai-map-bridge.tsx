"use client";

import type { LatLngBoundsExpression, Map as LeafletMap } from "leaflet";
import { useEffect } from "react";
import { useMap } from "react-leaflet";

import type { DroMapAiBounds, DroMapAiCoordinate } from "./dromap-ai-types";

let currentMap: LeafletMap | null = null;

export function DroMapAiMapBridge() {
  const map = useMap();

  useEffect(() => {
    currentMap = map;
    return () => {
      if (currentMap === map) {
        currentMap = null;
      }
    };
  }, [map]);

  return null;
}

export function fitDroMapAiMapBounds(
  bounds: DroMapAiBounds,
  options: { paddingPx?: number; maxZoom?: number; animate?: boolean } = {},
) {
  if (!currentMap) {
    return false;
  }

  const expression: LatLngBoundsExpression = [
    [bounds.south, bounds.west],
    [bounds.north, bounds.east],
  ];

  currentMap.fitBounds(expression, {
    padding: [options.paddingPx ?? 52, options.paddingPx ?? 52],
    maxZoom: options.maxZoom ?? 13,
    animate: options.animate ?? true,
    duration: 0.55,
  });

  return true;
}

export function getDroMapAiMapZoom() {
  return currentMap?.getZoom() ?? null;
}

export function flyDroMapAiMapTo(
  coordinate: DroMapAiCoordinate,
  zoom?: number | null,
) {
  if (!currentMap) {
    return false;
  }

  currentMap.flyTo(
    [coordinate.lat, coordinate.lng],
    typeof zoom === "number" ? zoom : currentMap.getZoom(),
    { animate: true, duration: 0.55 },
  );
  return true;
}
