"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

type LatLngPoint = {
  lat: number;
  lng: number;
};

type WorkspaceBoundsNumbers = {
  south: number;
  west: number;
  north: number;
  east: number;
};

function getWorkspaceBoundsNumbers(bounds: unknown): WorkspaceBoundsNumbers | null {
  if (!bounds) return null;

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
    return {
      south: maybeLeafletBounds.getSouth(),
      west: maybeLeafletBounds.getWest(),
      north: maybeLeafletBounds.getNorth(),
      east: maybeLeafletBounds.getEast(),
    };
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
    return {
      south: raw.south,
      west: raw.west,
      north: raw.north,
      east: raw.east,
    };
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
    return {
      south: sw.lat,
      west: sw.lng,
      north: ne.lat,
      east: ne.lng,
    };
  }

  console.warn("WorkspaceMaskLayer: format de workspaceBounds non reconnu", bounds);
  return null;
}

export function WorkspaceMaskLayer() {
  const map = useMap();

  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds
  );

  useEffect(() => {
    if (currentMode !== "edit") return;

    const bounds = getWorkspaceBoundsNumbers(workspaceBounds);
    if (!bounds) return;

    let pane = map.getPane("workspaceMaskPane");

    if (!pane) {
      pane = map.createPane("workspaceMaskPane");
      pane.style.zIndex = "650";
      pane.style.pointerEvents = "none";
    }

    const group = L.layerGroup();

    const maskOptions: L.PathOptions = {
      pane: "workspaceMaskPane",
      stroke: false,
      fill: true,
      fillColor: "#000000",
      fillOpacity: 0.75,
      interactive: false,
    };

    const worldSouth = -85;
    const worldNorth = 85;
    const worldWest = -180;
    const worldEast = 180;

    const { south, west, north, east } = bounds;

    const rectangles: L.Rectangle[] = [
      // Bande au nord de la zone
      L.rectangle(
        [
          [north, worldWest],
          [worldNorth, worldEast],
        ],
        maskOptions
      ),

      // Bande au sud de la zone
      L.rectangle(
        [
          [worldSouth, worldWest],
          [south, worldEast],
        ],
        maskOptions
      ),

      // Bande à l'ouest de la zone
      L.rectangle(
        [
          [south, worldWest],
          [north, west],
        ],
        maskOptions
      ),

      // Bande à l'est de la zone
      L.rectangle(
        [
          [south, east],
          [north, worldEast],
        ],
        maskOptions
      ),
    ];

    rectangles.forEach((rectangle) => {
      rectangle.addTo(group);
    });

    group.addTo(map);

    return () => {
      group.removeFrom(map);
    };
  }, [map, currentMode, workspaceBounds]);

  return null;
}