"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

type DroMapLeafletLayer = L.Layer & {
  dromapFeatureId?: string;
  dromapArrowOwnerId?: string;
  dromapArrowKind?: "line-body" | "line-end";
};

type LayerWithElement = L.Layer & {
  getElement?: () => HTMLElement | SVGElement | null;
};

type LatLngPoint = {
  lat: number;
  lng: number;
};

function getWorkspaceLatLngBounds(bounds: unknown): L.LatLngBounds | null {
  if (!bounds) return null;

  if (bounds instanceof L.LatLngBounds) {
    return bounds;
  }

  const maybeLeafletBounds = bounds as {
    getSouth?: () => number;
    getWest?: () => number;
    getNorth?: () => number;
    getEast?: () => number;
  };

  if (
    typeof maybeLeafletBounds.getSouth === "function" &&
    typeof maybeLeafletBounds.getWest === "function" &&
    typeof maybeLeafletBounds.getNorth === "function" &&
    typeof maybeLeafletBounds.getEast === "function"
  ) {
    return L.latLngBounds(
      [maybeLeafletBounds.getSouth(), maybeLeafletBounds.getWest()],
      [maybeLeafletBounds.getNorth(), maybeLeafletBounds.getEast()],
    );
  }

  const raw = bounds as {
    south?: number;
    west?: number;
    north?: number;
    east?: number;
    sw?: LatLngPoint;
    ne?: LatLngPoint;
    southWest?: LatLngPoint;
    northEast?: LatLngPoint;
    _southWest?: LatLngPoint;
    _northEast?: LatLngPoint;
  };

  if (
    typeof raw.south === "number" &&
    typeof raw.west === "number" &&
    typeof raw.north === "number" &&
    typeof raw.east === "number"
  ) {
    return L.latLngBounds([raw.south, raw.west], [raw.north, raw.east]);
  }

  const sw = raw.sw ?? raw.southWest ?? raw._southWest;
  const ne = raw.ne ?? raw.northEast ?? raw._northEast;

  if (
    sw &&
    ne &&
    typeof sw.lat === "number" &&
    typeof sw.lng === "number" &&
    typeof ne.lat === "number" &&
    typeof ne.lng === "number"
  ) {
    return L.latLngBounds([sw.lat, sw.lng], [ne.lat, ne.lng]);
  }

  return null;
}

function getLayerFeatureId(layer: L.Layer): string | undefined {
  return (layer as DroMapLeafletLayer).dromapFeatureId;
}

function getArrowBodyOwnerId(layer: L.Layer): string | undefined {
  const dromapLayer = layer as DroMapLeafletLayer;

  if (dromapLayer.dromapArrowKind !== "line-body") {
    return undefined;
  }

  return dromapLayer.dromapArrowOwnerId;
}

function getLayerElement(layer: L.Layer): HTMLElement | SVGElement | null {
  return (layer as LayerWithElement).getElement?.() ?? null;
}

function getPreciseMarkerHighlightTarget(
  element: HTMLElement | SVGElement,
): HTMLElement | SVGElement {
  if (!(element instanceof HTMLElement)) {
    return element;
  }

  const preciseTarget = element.querySelector<HTMLElement>(
    '[data-dromap-text-frame="true"]',
  );

  return preciseTarget ?? element;
}

function applyMarkerHighlight(layer: L.Marker): () => void {
  const element = getLayerElement(layer);

  if (!element) {
    return () => {};
  }

  const targetElement = getPreciseMarkerHighlightTarget(element);
  const previousTargetOutline = targetElement.style.outline;
  const previousTargetOutlineOffset = targetElement.style.outlineOffset;
  const previousTargetBorderRadius = targetElement.style.borderRadius;
  const previousTargetBoxShadow = targetElement.style.boxShadow;
  const previousRootZIndex = element.style.zIndex;

  targetElement.style.outline = "3px solid #2563eb";
  targetElement.style.outlineOffset = "2px";
  targetElement.style.boxShadow =
    "0 0 0 6px rgba(37, 99, 235, 0.22)";

  if (targetElement === element && !targetElement.style.borderRadius) {
    targetElement.style.borderRadius = "9999px";
  }

  element.style.zIndex = "1000";

  return () => {
    targetElement.style.outline = previousTargetOutline;
    targetElement.style.outlineOffset = previousTargetOutlineOffset;
    targetElement.style.borderRadius = previousTargetBorderRadius;
    targetElement.style.boxShadow = previousTargetBoxShadow;
    element.style.zIndex = previousRootZIndex;
  };
}

function applyPathHighlight(layer: L.Polyline | L.Polygon): () => void {
  const element = getLayerElement(layer);

  if (!element || !(element instanceof SVGElement)) {
    return () => {};
  }

  const previousFilter = element.style.filter;

  /**
   * Important : on ne modifie pas stroke / stroke-width / dasharray ici.
   * Le highlight reste un effet visuel DOM/SVG temporaire, sans réécrire
   * le style réel de l'objet DroMap.
   */
  element.style.filter =
    "drop-shadow(0 0 2px rgba(37, 99, 235, 0.95)) drop-shadow(0 0 7px rgba(37, 99, 235, 0.78))";

  return () => {
    element.style.filter = previousFilter;
  };
}

export function SelectedFeatureHighlight() {
  const map = useMap();

  const lastFocusedRequestIdRef = useRef<number | null>(null);
  const lastWorkspaceRecenterRequestIdRef = useRef<number | null>(null);
  const [viewRevision, setViewRevision] = useState(0);

  const selectedFeatureId = useEditorTestSelectionStore(
    (state) => state.selectedFeatureId,
  );
  const selectedFeatureIds = useEditorTestSelectionStore(
    (state) => state.selectedFeatureIds,
  );
  const setSelectedFeatureIds = useEditorTestSelectionStore(
    (state) => state.setSelectedFeatureIds,
  );

  const focusedSelectionRequest = useEditorTestSelectionStore(
    (state) => state.focusedSelectionRequest,
  );

  const workspaceRecenterRequest = useEditorTestSelectionStore(
    (state) => state.workspaceRecenterRequest,
  );

  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );

  const features = useEditorTestFeaturesStore((state) => state.features);

  useEffect(() => {
    if (selectedFeatureIds.length === 0) return;
    const existingIds = new Set(features.map((feature) => feature.id));
    const validIds = selectedFeatureIds.filter((featureId) =>
      existingIds.has(featureId),
    );

    if (validIds.length !== selectedFeatureIds.length) {
      setSelectedFeatureIds(validIds);
    }
  }, [features, selectedFeatureIds, setSelectedFeatureIds]);

  useEffect(() => {
    let animationFrameId: number | null = null;

    const scheduleRefresh = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = window.requestAnimationFrame(() => {
        setViewRevision((revision) => revision + 1);
      });
    };

    map.on("zoomend resize", scheduleRefresh);

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      map.off("zoomend resize", scheduleRefresh);
    };
  }, [map]);

  useEffect(() => {
    if (selectedFeatureIds.length === 0) {
      const shouldRecenterWorkspace =
        Boolean(workspaceRecenterRequest) &&
        workspaceRecenterRequest?.requestId !==
          lastWorkspaceRecenterRequestIdRef.current;

      if (!shouldRecenterWorkspace || !workspaceRecenterRequest) {
        return;
      }

      lastWorkspaceRecenterRequestIdRef.current =
        workspaceRecenterRequest.requestId;

      const bounds = getWorkspaceLatLngBounds(workspaceBounds);

      if (bounds?.isValid()) {
        map.fitBounds(bounds, {
          animate: true,
          padding: [24, 24],
        });
      }

      return;
    }

    const mapLayers: L.Layer[] = [];

    map.eachLayer((layer) => {
      mapLayers.push(layer);
    });

    const cleanupHighlights: Array<() => void> = [];

    for (const featureId of selectedFeatureIds) {
      const selectedDisplayLayer =
        mapLayers.find((layer) => getArrowBodyOwnerId(layer) === featureId) ??
        null;
      const selectedLayer =
        mapLayers.find((layer) => getLayerFeatureId(layer) === featureId) ??
        null;
      const selectedLeafletLayer = selectedDisplayLayer ?? selectedLayer;

      if (!selectedLeafletLayer) {
        continue;
      }

      if (selectedLeafletLayer instanceof L.Marker) {
        cleanupHighlights.push(applyMarkerHighlight(selectedLeafletLayer));
      } else if (
        selectedLeafletLayer instanceof L.Polygon ||
        selectedLeafletLayer instanceof L.Polyline
      ) {
        cleanupHighlights.push(applyPathHighlight(selectedLeafletLayer));
      }
    }

    const shouldFocusFromObjectsPanel =
      Boolean(selectedFeatureId) &&
      focusedSelectionRequest?.featureId === selectedFeatureId &&
      focusedSelectionRequest.requestId !== lastFocusedRequestIdRef.current;

    if (shouldFocusFromObjectsPanel && selectedFeatureId) {
      const primaryDisplayLayer =
        mapLayers.find(
          (layer) => getArrowBodyOwnerId(layer) === selectedFeatureId,
        ) ?? null;
      const primaryLayer =
        mapLayers.find(
          (layer) => getLayerFeatureId(layer) === selectedFeatureId,
        ) ?? null;
      const primaryLeafletLayer = primaryDisplayLayer ?? primaryLayer;

      if (primaryLeafletLayer instanceof L.Marker) {
        map.panTo(primaryLeafletLayer.getLatLng(), { animate: true });
      } else if (
        primaryLeafletLayer instanceof L.Polygon ||
        primaryLeafletLayer instanceof L.Polyline
      ) {
        const bounds = primaryLeafletLayer.getBounds();

        if (bounds.isValid()) {
          map.fitBounds(bounds.pad(0.25), {
            animate: true,
            maxZoom: map.getZoom(),
          });
        }
      }

      if (focusedSelectionRequest) {
        lastFocusedRequestIdRef.current = focusedSelectionRequest.requestId;
      }
    }

    return () => {
      cleanupHighlights.forEach((cleanup) => cleanup());
    };
  }, [
    features,
    focusedSelectionRequest,
    map,
    selectedFeatureId,
    selectedFeatureIds,
    viewRevision,
    workspaceBounds,
    workspaceRecenterRequest,
  ]);

  return null;
}
