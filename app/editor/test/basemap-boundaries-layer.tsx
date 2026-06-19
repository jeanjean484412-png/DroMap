"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import type {
  DromapBasemapBoundaryLayer,
  DromapBasemapBoundaryOverlay,
} from "@/lib/dromap/basemap";
import type { DromapBoundaryLineString } from "@/lib/dromap/basemap-boundaries";
import {
  getDromapBoundaryRenderableLineStrings,
  loadDromapBoundaryFeatureCollection,
} from "@/lib/dromap/basemap-boundaries";

type BasemapBoundariesLayerProps = {
  boundaryOverlay?: DromapBasemapBoundaryOverlay;
  renderBounds?: L.LatLngBounds;
};

function getLineStringBounds(lineString: DromapBoundaryLineString) {
  const bounds = L.latLngBounds([]);

  for (const [longitude, latitude] of lineString) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      continue;
    }

    bounds.extend([latitude, longitude]);
  }

  return bounds.isValid() ? bounds : null;
}

function lineStringIntersectsBounds(
  lineString: DromapBoundaryLineString,
  bounds: L.LatLngBounds,
) {
  const lineBounds = getLineStringBounds(lineString);

  if (!lineBounds) {
    return false;
  }

  return lineBounds.intersects(bounds);
}

function getPaddedRenderBounds(bounds?: L.LatLngBounds) {
  if (!bounds?.isValid()) {
    return undefined;
  }

  const latPadding = Math.max(
    0.25,
    (bounds.getNorth() - bounds.getSouth()) * 0.15,
  );
  const lngPadding = Math.max(
    0.25,
    (bounds.getEast() - bounds.getWest()) * 0.15,
  );

  return L.latLngBounds(
    [bounds.getSouth() - latPadding, bounds.getWest() - lngPadding],
    [bounds.getNorth() + latPadding, bounds.getEast() + lngPadding],
  );
}

function createLeafletBoundaryLayer(
  layerConfig: DromapBasemapBoundaryLayer,
  featureCollection: Awaited<
    ReturnType<typeof loadDromapBoundaryFeatureCollection>
  >,
  renderBounds?: L.LatLngBounds,
) {
  const paddedRenderBounds = getPaddedRenderBounds(renderBounds);
  const lineStrings = getDromapBoundaryRenderableLineStrings(
    featureCollection,
    layerConfig,
  ).filter((lineString) =>
    paddedRenderBounds
      ? lineStringIntersectsBounds(lineString, paddedRenderBounds)
      : true,
  );

  const lineFeatureCollection = {
    type: "FeatureCollection" as const,
    features: lineStrings.map((lineString) => ({
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: lineString,
      },
    })),
  };

  return L.geoJSON(lineFeatureCollection as Parameters<typeof L.geoJSON>[0], {
    interactive: false,
    bubblingMouseEvents: false,
    style: {
      color: layerConfig.strokeColor,
      opacity: layerConfig.strokeOpacity,
      weight: layerConfig.strokeWeight,
      fill: false,
      lineCap: "round",
      lineJoin: "round",
      dashArray: layerConfig.strokeDashArray,
    },
  });
}

export function BasemapBoundariesLayer({
  boundaryOverlay,
  renderBounds,
}: BasemapBoundariesLayerProps) {
  const map = useMap();

  useEffect(() => {
    if (!boundaryOverlay) {
      return;
    }

    const overlay = boundaryOverlay;

    let isDisposed = false;
    const group = L.featureGroup().addTo(map);

    async function loadLayers() {
      for (const layerConfig of overlay.layers) {
        try {
          const featureCollection = await loadDromapBoundaryFeatureCollection(
            layerConfig.dataUrl,
          );

          if (isDisposed) {
            return;
          }

          const layer = createLeafletBoundaryLayer(
            layerConfig,
            featureCollection,
            renderBounds,
          );

          layer.addTo(group);
        } catch (error) {
          console.warn("Fond frontières non chargé :", error);
        }
      }

      group.bringToBack();
    }

    void loadLayers();

    return () => {
      isDisposed = true;
      group.removeFrom(map);
    };
  }, [boundaryOverlay, map, renderBounds]);

  return null;
}