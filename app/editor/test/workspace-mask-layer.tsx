"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import { getDromapBasemapConfig } from "@/lib/dromap/basemap";
import { isFullWorldWorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import { useEditorTestBasemapStore } from "@/stores/editor-test-basemap";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import {
  DROMAP_WORLD_BOUNDS,
  dromapBasemapBoundsToLeafletBounds,
  getBasemapWorkspaceBounds,
} from "./basemap-viewport-bounds";

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

const MASK_MIN_SIZE = 0.000001;

/**
 * Étendue maximale dans laquelle le masque de zone de travail doit rester visible.
 *
 * Même si un fond blanc pays/continent n'affiche rien sur une partie de l'écran,
 * l'utilisateur doit voir clairement que cette partie est hors zone de travail.
 * Les fonds classiques peuvent afficher deux mondes côte à côte et certains fonds
 * Russie/Europe déplient un morceau de Russie au-delà de 180°, donc on couvre
 * toute l'étendue pannable contrôlée par MapViewController.
 */
const WORKSPACE_MASK_EXTENT = {
  south: -88,
  west: -360,
  north: 88,
  east: 360,
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

function addMaskRectangle(
  group: L.LayerGroup,
  bounds: [[number, number], [number, number]],
  options: L.PathOptions,
) {
  const [[south, west], [north, east]] = bounds;

  if (
    !Number.isFinite(south) ||
    !Number.isFinite(west) ||
    !Number.isFinite(north) ||
    !Number.isFinite(east) ||
    north - south <= MASK_MIN_SIZE ||
    east - west <= MASK_MIN_SIZE
  ) {
    return;
  }

  L.rectangle(bounds, options).addTo(group);
}

function applyScreenMaskRectangle(
  element: HTMLDivElement,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  element.style.display = width > 0.5 && height > 0.5 ? "block" : "none";
  element.style.left = `${Math.floor(left)}px`;
  element.style.top = `${Math.floor(top)}px`;
  element.style.width = `${Math.ceil(Math.max(0, width))}px`;
  element.style.height = `${Math.ceil(Math.max(0, height))}px`;
}

function addFullWorldScreenMask(
  map: L.Map,
  bounds: WorkspaceBoundsNumbers,
) {
  const mapContainer = map.getContainer();
  const overlay = document.createElement("div");
  const strips = Array.from({ length: 4 }, () => {
    const strip = document.createElement("div");

    strip.style.position = "absolute";
    strip.style.background = "#d1d5db";
    strip.style.pointerEvents = "none";
    overlay.appendChild(strip);

    return strip;
  });

  overlay.setAttribute("aria-hidden", "true");
  overlay.style.position = "absolute";
  overlay.style.inset = "0";
  overlay.style.zIndex = "650";
  overlay.style.pointerEvents = "none";
  overlay.style.overflow = "hidden";
  mapContainer.appendChild(overlay);

  const updateMask = () => {
    const size = map.getSize();
    const northWest = map.latLngToContainerPoint([bounds.north, bounds.west]);
    const southEast = map.latLngToContainerPoint([bounds.south, bounds.east]);
    const worldLeft = Math.min(northWest.x, southEast.x);
    const worldRight = Math.max(northWest.x, southEast.x);
    const worldTop = Math.min(northWest.y, southEast.y);
    const worldBottom = Math.max(northWest.y, southEast.y);
    const clippedLeft = Math.max(0, Math.min(size.x, worldLeft));
    const clippedRight = Math.max(0, Math.min(size.x, worldRight));
    const clippedTop = Math.max(0, Math.min(size.y, worldTop));
    const clippedBottom = Math.max(0, Math.min(size.y, worldBottom));
    const middleHeight = Math.max(0, clippedBottom - clippedTop);

    // Nord, sud, ouest puis est. Le calcul en pixels écran fonctionne aussi
    // au-delà des limites de projection Web Mercator, contrairement à quatre
    // rectangles géographiques qui s'écraseraient près des pôles.
    applyScreenMaskRectangle(strips[0], 0, 0, size.x, clippedTop);
    applyScreenMaskRectangle(
      strips[1],
      0,
      clippedBottom,
      size.x,
      size.y - clippedBottom,
    );
    applyScreenMaskRectangle(strips[2], 0, clippedTop, clippedLeft, middleHeight);
    applyScreenMaskRectangle(
      strips[3],
      clippedRight,
      clippedTop,
      size.x - clippedRight,
      middleHeight,
    );
  };

  map.on("move zoom resize zoomanim", updateMask);
  updateMask();

  return () => {
    map.off("move zoom resize zoomanim", updateMask);
    overlay.remove();
  };
}

export function WorkspaceMaskLayer() {
  const map = useMap();

  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );
  const basemapId = useEditorTestBasemapStore((state) => state.basemapId);
  const activeBasemapBounds = useEditorTestBasemapStore(
    (state) => state.activeBasemapBounds,
  );

  useEffect(() => {
    if (currentMode !== "edit") return;

    const isFullWorldWorkspace = isFullWorldWorkspaceBounds(workspaceBounds);
    const bounds = getWorkspaceBoundsNumbers(workspaceBounds);
    if (!bounds) return;

    if (isFullWorldWorkspace) {
      return addFullWorldScreenMask(map, bounds);
    }

    let pane = map.getPane("workspaceMaskPane");

    if (!pane) {
      pane = map.createPane("workspaceMaskPane");
      pane.style.zIndex = "650";
      pane.style.pointerEvents = "none";
    }

    const basemap = getDromapBasemapConfig(basemapId);
    const rawBasemapBounds = activeBasemapBounds
      ? dromapBasemapBoundsToLeafletBounds(activeBasemapBounds)
      : DROMAP_WORLD_BOUNDS;
    const maskReferenceBounds = getBasemapWorkspaceBounds(
      basemap,
      rawBasemapBounds,
    );

    /**
     * Le masque doit couvrir les mêmes bornes que la zone utile du fond actif.
     *
     * Avant, il était codé en dur sur [-180, 180]. Sur les fonds Russie/Europe
     * où le morceau à l'antiméridien est déplié à droite, une zone de travail
     * pouvait donc passer dans le fond blanc étendu mais cette partie restait
     * grisée, comme si elle était hors zone. On utilise maintenant les bornes
     * réellement sélectionnables du fond actif.
     */
    const currentMapBounds = map.getBounds();

    /**
     * Le masque ne doit pas seulement suivre les frontières affichées.
     *
     * Sur un fond blanc pays/continent, une partie de l'écran peut ne contenir
     * aucun tracé vectoriel visible. Cette zone doit quand même être grisée si
     * elle est hors zone de travail. Même logique pour les morceaux ajoutés à
     * droite sur les fonds Russie/Europe : s'ils sont hors zone de travail, ils
     * doivent être grisés ; s'ils sont dedans, ils restent visibles.
     */
    const maskSouth = Math.min(
      WORKSPACE_MASK_EXTENT.south,
      maskReferenceBounds.getSouth(),
      currentMapBounds.getSouth(),
      bounds.south,
    );
    const maskWest = Math.min(
      WORKSPACE_MASK_EXTENT.west,
      maskReferenceBounds.getWest(),
      currentMapBounds.getWest(),
      bounds.west,
    );
    const maskNorth = Math.max(
      WORKSPACE_MASK_EXTENT.north,
      maskReferenceBounds.getNorth(),
      currentMapBounds.getNorth(),
      bounds.north,
    );
    const maskEast = Math.max(
      WORKSPACE_MASK_EXTENT.east,
      maskReferenceBounds.getEast(),
      currentMapBounds.getEast(),
      bounds.east,
    );

    const group = L.layerGroup();

    const maskOptions: L.PathOptions = {
      pane: "workspaceMaskPane",
      stroke: false,
      fill: true,
      fillColor: "#000000",
      fillOpacity: 0.75,
      interactive: false,
    };

    const { south, west, north, east } = bounds;

    // Bande au nord de la zone.
    addMaskRectangle(
      group,
      [
        [north, maskWest],
        [maskNorth, maskEast],
      ],
      maskOptions,
    );

    // Bande au sud de la zone.
    addMaskRectangle(
      group,
      [
        [maskSouth, maskWest],
        [south, maskEast],
      ],
      maskOptions,
    );

    // Bande à l'ouest de la zone.
    addMaskRectangle(
      group,
      [
        [south, maskWest],
        [north, west],
      ],
      maskOptions,
    );

    // Bande à l'est de la zone.
    addMaskRectangle(
      group,
      [
        [south, east],
        [north, maskEast],
      ],
      maskOptions,
    );

    group.addTo(map);

    return () => {
      group.removeFrom(map);
    };
  }, [map, currentMode, workspaceBounds, basemapId, activeBasemapBounds]);

  return null;
}
