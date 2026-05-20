"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

type DroMapLeafletLayer = L.Layer & {
  dromapFeatureId?: string;
};

type LatLngPoint = {
  lat: number;
  lng: number;
};

function getLayerFeatureId(layer: L.Layer): string | undefined {
  return (layer as DroMapLeafletLayer).dromapFeatureId;
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
      [maybeLeafletBounds.getNorth(), maybeLeafletBounds.getEast()]
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

  console.warn(
    "SelectedFeatureHighlight: format de workspaceBounds non reconnu",
    bounds
  );

  return null;
}

function createPointHighlight(layer: L.Marker): L.CircleMarker {
  const latLng = layer.getLatLng();

  return L.circleMarker(latLng, {
    pane: "selectedFeaturePane",
    radius: 18,
    color: "#2563eb",
    weight: 3,
    opacity: 1,
    fillColor: "#2563eb",
    fillOpacity: 0.18,
    interactive: false,
  });
}

function createPathHighlight(layer: L.Polyline | L.Polygon): L.Layer {
  const latLngs = layer.getLatLngs();

  if (layer instanceof L.Polygon) {
    return L.polygon(latLngs as any, {
      pane: "selectedFeaturePane",
      color: "#2563eb",
      weight: 5,
      opacity: 1,
      fill: false,
      dashArray: "8 6",
      interactive: false,
    });
  }

  return L.polyline(latLngs as any, {
    pane: "selectedFeaturePane",
    color: "#2563eb",
    weight: 5,
    opacity: 1,
    dashArray: "8 6",
    interactive: false,
  });
}

export function SelectedFeatureHighlight() {
  const map = useMap();

  const movedToSelectionRef = useRef(false);

  const selectedFeatureId = useEditorTestSelectionStore(
    (state) => state.selectedFeatureId
  );

  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds
  );

  useEffect(() => {
    if (!selectedFeatureId) {
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

    let pane = map.getPane("selectedFeaturePane");

    if (!pane) {
      pane = map.createPane("selectedFeaturePane");
      pane.style.zIndex = "750";
      pane.style.pointerEvents = "none";
    }

    let selectedLayer: L.Layer | null = null;

    map.eachLayer((layer) => {
      if (getLayerFeatureId(layer) === selectedFeatureId) {
        selectedLayer = layer;
      }
    });

    if (!selectedLayer) {
      console.warn(
        "SelectedFeatureHighlight: aucune couche Leaflet trouvée pour",
        selectedFeatureId
      );
      return;
    }

    const highlightGroup = L.featureGroup();

    if (selectedLayer instanceof L.Marker) {
      const highlight = createPointHighlight(selectedLayer);
      highlight.addTo(highlightGroup);

      map.panTo(selectedLayer.getLatLng(), {
        animate: true,
      });
    } else if (
      selectedLayer instanceof L.Polygon ||
      selectedLayer instanceof L.Polyline
    ) {
      const highlight = createPathHighlight(selectedLayer);
      highlight.addTo(highlightGroup);

      const bounds = selectedLayer.getBounds();

      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.25), {
          animate: true,
          maxZoom: map.getZoom(),
        });
      }
    }

    highlightGroup.addTo(map);
    highlightGroup.bringToFront();

    return () => {
      highlightGroup.removeFrom(map);
    };
  }, [map, selectedFeatureId, workspaceBounds]);

  return null;
}