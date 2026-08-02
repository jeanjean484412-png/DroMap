"use client";

import L from "leaflet";

import {
  type DromapBasemapBounds,
  type DromapBasemapConfig,
} from "@/lib/dromap/basemap";
import {
  getDromapBoundaryFeatureForLayer,
  getDromapBoundaryLineStrings,
  loadDromapBoundaryFeatureCollection,
} from "@/lib/dromap/basemap-boundaries";

export const DROMAP_WORLD_BOUNDS = L.latLngBounds(
  [-85.05112878, -180],
  [85.05112878, 180],
);

const CLASSIC_TILE_WORKSPACE_BOUNDS = L.latLngBounds(
  [-85.05112878, -360],
  [85.05112878, 360],
);

const BLANK_WORLD_BOUNDS = L.latLngBounds([-60, -170], [84, 170]);

function clampLatitude(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, -85.05112878), 85.05112878);
}

function clampLongitude(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  // Certains fonds blancs vectoriels ciblés déplient la Russie au-delà de
  // l'antiméridien pour éviter un morceau isolé à gauche du monde. On garde
  // donc une marge contrôlée identique à la marge de déplacement Leaflet.
  return Math.min(Math.max(value, -360), 360);
}

function extendBoundsWithPosition(
  bounds: L.LatLngBounds,
  position: [number, number],
) {
  const [lng, lat] = position;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return;
  }

  bounds.extend(L.latLng(clampLatitude(lat), clampLongitude(lng)));
}

function extendBoundsWithLineString(
  bounds: L.LatLngBounds,
  lineString: [number, number][],
) {
  lineString.forEach((position) => extendBoundsWithPosition(bounds, position));
}

function cloneBounds(bounds: L.LatLngBounds) {
  return L.latLngBounds(bounds.getSouthWest(), bounds.getNorthEast());
}

export function leafletBoundsToDromapBasemapBounds(
  bounds: L.LatLngBounds,
): DromapBasemapBounds {
  return {
    west: clampLongitude(bounds.getWest()),
    south: clampLatitude(bounds.getSouth()),
    east: clampLongitude(bounds.getEast()),
    north: clampLatitude(bounds.getNorth()),
  };
}

export function dromapBasemapBoundsToLeafletBounds(
  bounds: DromapBasemapBounds,
) {
  return L.latLngBounds(
    [clampLatitude(bounds.south), clampLongitude(bounds.west)],
    [clampLatitude(bounds.north), clampLongitude(bounds.east)],
  );
}

function getBackgroundBoundsForBasemap(basemap: DromapBasemapConfig) {
  if (!basemap.worldBackgroundBounds) {
    return null;
  }

  return dromapBasemapBoundsToLeafletBounds(basemap.worldBackgroundBounds);
}

/**
 * Bornes utilisées pour la sélection de zone et les contraintes de navigation.
 *
 * Les fonds Russie / Europe peuvent afficher un morceau russe déplié à droite
 * de l'antiméridien. Les frontières visibles restent la référence verticale,
 * mais on étend horizontalement la zone sélectionnable jusqu'au fond blanc
 * réellement affiché, sinon l'utilisateur est bloqué avant ce morceau.
 */
export function getBasemapWorkspaceBounds(
  basemap: DromapBasemapConfig,
  viewportBounds: L.LatLngBounds,
) {
  if (basemap.kind === "tile" || basemap.kind === "maplibre") {
    return cloneBounds(CLASSIC_TILE_WORKSPACE_BOUNDS);
  }

  const backgroundBounds = getBackgroundBoundsForBasemap(basemap);

  if (!backgroundBounds) {
    return cloneBounds(viewportBounds);
  }

  const bounds = cloneBounds(viewportBounds);

  if (backgroundBounds.getEast() > bounds.getEast()) {
    bounds.extend([bounds.getSouth(), backgroundBounds.getEast()]);
    bounds.extend([bounds.getNorth(), backgroundBounds.getEast()]);
  }

  return bounds;
}

function shouldUseFullWorldBounds(basemap: DromapBasemapConfig) {
  return (
    basemap.kind === "tile" ||
    basemap.kind === "maplibre" ||
    basemap.id === "blank-white" ||
    basemap.id === "white-borders" ||
    basemap.id === "white-borders-basic"
  );
}

/**
 * Bornes réellement utiles du fond actif dans l'éditeur.
 *
 * Pour les fonds pays/continents, on se base sur les mêmes géométries filtrées
 * que le rendu des frontières. Cela évite les zones de travail dessinées dans
 * du vide autour du fond blanc sélectionné.
 */
export async function getBasemapViewportBounds(
  basemap: DromapBasemapConfig,
): Promise<L.LatLngBounds> {
  if (basemap.viewportBounds) {
    return dromapBasemapBoundsToLeafletBounds(basemap.viewportBounds);
  }

  if (shouldUseFullWorldBounds(basemap)) {
    return cloneBounds(DROMAP_WORLD_BOUNDS);
  }

  if (basemap.kind === "solid" && !basemap.boundaryOverlay) {
    return basemap.id === "blank-white"
      ? cloneBounds(BLANK_WORLD_BOUNDS)
      : cloneBounds(DROMAP_WORLD_BOUNDS);
  }

  const boundaryOverlay = basemap.boundaryOverlay;

  if (!boundaryOverlay) {
    return cloneBounds(DROMAP_WORLD_BOUNDS);
  }

  const bounds = L.latLngBounds([]);

  for (const layer of boundaryOverlay.layers) {
    if (layer.displayRole === "country-neighbor-context") {
      continue;
    }

    try {
      const featureCollection = await loadDromapBoundaryFeatureCollection(
        layer.dataUrl,
      );

      for (const feature of featureCollection.features) {
        const visibleFeature = getDromapBoundaryFeatureForLayer(feature, layer);

        if (!visibleFeature?.geometry) {
          continue;
        }

        getDromapBoundaryLineStrings(visibleFeature.geometry).forEach(
          (lineString) => extendBoundsWithLineString(bounds, lineString),
        );
      }
    } catch (error) {
      console.warn("Fond de carte impossible à borner automatiquement.", error);
    }
  }

  return bounds.isValid() ? bounds : cloneBounds(DROMAP_WORLD_BOUNDS);
}
