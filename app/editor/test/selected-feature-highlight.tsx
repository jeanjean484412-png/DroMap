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

type LatLngPoint = {
  lat: number;
  lng: number;
};

type LayerWithElement = L.Layer & {
  getElement?: () => HTMLElement | SVGElement | null;
};

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

function getLayerElement(layer: L.Layer): HTMLElement | SVGElement | null {
  return (layer as LayerWithElement).getElement?.() ?? null;
}

function applyMarkerHighlight(layer: L.Marker): () => void {
  const element = getLayerElement(layer);

  if (!element) {
    return () => {};
  }

  const previousOutline = element.style.outline;
  const previousBorderRadius = element.style.borderRadius;
  const previousBoxShadow = element.style.boxShadow;
  const previousZIndex = element.style.zIndex;

  element.style.outline = "3px solid #2563eb";
  element.style.borderRadius = "9999px";
  element.style.boxShadow = "0 0 0 6px rgba(37, 99, 235, 0.22)";
  element.style.zIndex = "1000";

  return () => {
    element.style.outline = previousOutline;
    element.style.borderRadius = previousBorderRadius;
    element.style.boxShadow = previousBoxShadow;
    element.style.zIndex = previousZIndex;
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

  const movedToSelectionRef = useRef(false);
  const lastFocusedFeatureIdRef = useRef<string | null>(null);
  const [viewRevision, setViewRevision] = useState(0);

  const selectedFeatureId = useEditorTestSelectionStore(
    (state) => state.selectedFeatureId,
  );

  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );

  const features = useEditorTestFeaturesStore((state) => state.features);

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
    if (!selectedFeatureId) {
      lastFocusedFeatureIdRef.current = null;

      if (movedToSelectionRef.current) {
        movedToSelectionRef.current = false;

        const bounds = getWorkspaceLatLngBounds(workspaceBounds);

        if (bounds?.isValid()) {
          map.fitBounds(bounds, {
            animate: true,
            padding: [24, 24],
          });
        }
      }

      return;
    }

    movedToSelectionRef.current = true;

    let selectedLayer: L.Layer | null = null;
    let selectedDisplayLayer: L.Layer | null = null;

    map.eachLayer((layer) => {
      if (getLayerFeatureId(layer) === selectedFeatureId) {
        selectedLayer = layer;
      }

      if (getArrowBodyOwnerId(layer) === selectedFeatureId) {
        selectedDisplayLayer = layer;
      }
    });

    selectedLayer = selectedDisplayLayer ?? selectedLayer;

    if (!selectedLayer) {
      return;
    }

    let cleanupHighlight = () => {};
    const shouldFocus = lastFocusedFeatureIdRef.current !== selectedFeatureId;

    if (selectedLayer instanceof L.Marker) {
      cleanupHighlight = applyMarkerHighlight(selectedLayer);

      if (shouldFocus) {
        map.panTo(selectedLayer.getLatLng(), {
          animate: true,
        });
      }
    } else if (
      selectedLayer instanceof L.Polygon ||
      selectedLayer instanceof L.Polyline
    ) {
      cleanupHighlight = applyPathHighlight(selectedLayer);

      if (shouldFocus) {
        const bounds = selectedLayer.getBounds();

        if (bounds.isValid()) {
          map.fitBounds(bounds.pad(0.25), {
            animate: true,
            maxZoom: map.getZoom(),
          });
        }
      }
    }

    lastFocusedFeatureIdRef.current = selectedFeatureId;

    return () => {
      cleanupHighlight();
    };
  }, [features, map, selectedFeatureId, viewRevision, workspaceBounds]);

  return null;
}
