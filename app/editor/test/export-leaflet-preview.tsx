"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, useMap } from "react-leaflet";

import "leaflet/dist/leaflet.css";

import type { DroMapFeature } from "@/lib/dromap/feature";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

import { getLeafletDashArray } from "./feature-style";
import {
  createLineArrowBodyLeafletLayer,
  createLineArrowLeafletLayer,
  featureHasLineArrow,
} from "./line-arrow";
import { createMarkerLeafletIcon } from "./marker-symbol";

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
};

type ExportLeafletPreviewProps = {
  symbolScale?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
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
  }

  if (type === "marker") {
    nextStyle.markerSize = Math.max(2, scaleNumber(style.markerSize, 18, symbolScale));
  }

  if (type === "text") {
    nextStyle.fontSize = Math.max(4, scaleNumber(style.fontSize, 22, symbolScale));
  }

  return {
    ...feature,
    properties: {
      ...feature.properties,
      style: nextStyle,
    },
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

function getFeatureStyle(feature: DroMapFeature): Required<FeatureStyle> {
  const style = feature.properties?.style as FeatureStyle | undefined;
  const color = style?.color ?? "#334155";

  const rawOpacity = style?.opacity ?? 1;
  const opacity = featureHasLineArrow(feature) && rawOpacity <= 0.05 ? 1 : rawOpacity;

  return {
    color,
    opacity,
    weight: style?.weight ?? 3,
    fillColor: style?.fillColor ?? color,
    fillOpacity: style?.fillOpacity ?? 0.3,
  };
}

function createPointIcon(feature: DroMapFeature) {
  const style = getFeatureStyle(feature);

  if (feature.properties?.type === "text") {
    const text = feature.properties.label?.trim() || "Texte";
    const fontSize = clamp(feature.properties.style?.fontSize ?? 22, 10, 72);
    const opacity = clamp(style.opacity, 0, 1);

    const width = clamp(Math.round(text.length * fontSize * 0.62 + 24), 56, 520);
    const height = Math.round(fontSize * 1.35 + 14);

    return L.divIcon({
      className: "dromap-export-text-icon",
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
            color:${style.color};
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
      zIndexOffset: feature.properties?.type === "text" ? 2000 : 1000,
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

    return L.polygon(latLngRings, {
      color: style.color,
      opacity: style.opacity,
      weight: style.weight,
      fillColor: style.fillColor,
      fillOpacity: style.fillOpacity,
      dashArray: getLeafletDashArray(feature),
      lineCap: "round",
      lineJoin: "round",
      interactive: false,
    });
  }

  return null;
}

function getFeaturesByPreviewDrawOrder(features: DroMapFeature[]) {
  return [
    ...features.filter(
      (feature) =>
        feature.properties?.type !== "marker" &&
        feature.properties?.type !== "text",
    ),
    ...features.filter((feature) => feature.properties?.type === "marker"),
    ...features.filter((feature) => feature.properties?.type === "text"),
  ];
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

      const featuresByDrawOrder = getFeaturesByPreviewDrawOrder(features);

      for (const feature of featuresByDrawOrder) {
        const previewFeature = scaleFeatureForPreview(feature, symbolScale);
        const layer = createLeafletLayerFromFeature(previewFeature, map);

        if (layer) {
          group.addLayer(layer);
        }

        const arrowLayer = createLineArrowLeafletLayer(previewFeature, map, L);

        if (arrowLayer) {
          group.addLayer(arrowLayer);
        }
      }
    };

    renderFeatures();

    map.on("zoomend resize", renderFeatures);

    return () => {
      map.off("zoomend resize", renderFeatures);
      group.removeFrom(map);
    };
  }, [features, map, symbolScale]);

  return null;
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
  const features = useEditorTestFeaturesStore((state) => state.features);

  const leafletBounds = useMemo(
    () => workspaceBoundsToLeafletBounds(workspaceBounds),
    [workspaceBounds],
  );

  const forcedNativeZoom =
    typeof workspaceBasemapZoom === "number" &&
    Number.isFinite(workspaceBasemapZoom)
      ? Math.max(0, Math.min(19, Math.round(workspaceBasemapZoom)))
      : null;

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
      forcedNativeZoom ?? "auto",
    ].join("-");
  }, [workspaceBounds, forcedNativeZoom]);

  if (!leafletBounds) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100 p-4 text-center text-sm text-slate-500">
        Aucune zone de travail à prévisualiser.
      </div>
    );
  }

  const nativeZoomProps =
    forcedNativeZoom === null
      ? {}
      : {
          minNativeZoom: forcedNativeZoom,
          maxNativeZoom: forcedNativeZoom,
        };

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-100">
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
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          crossOrigin="anonymous"
          maxZoom={19}
          detectRetina={false}
          {...nativeZoomProps}
        />

        <ExportMapController bounds={leafletBounds} />
        <ExportFeatureLayers features={features} symbolScale={symbolScale} />
      </MapContainer>
    </div>
  );
}