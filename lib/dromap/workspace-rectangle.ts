import L from "leaflet";

import {
  boundsFromRectangle,
  toLatLngBounds,
} from "@/lib/dromap/workspace-bounds";
import type {
  WorkspaceBounds,
  WorkspaceClampBounds,
} from "@/lib/dromap/workspace-bounds";

const WORKSPACE_RECT_STYLE: L.PathOptions = {
  // La zone de travail ne doit plus poser de voile jaunâtre sur la carte.
  // Elle reste seulement visible pendant la sélection/modification de zone,
  // avec un contour neutre et aucun remplissage. En mode édition, elle est
  // complètement retirée par WorkspaceBoundsLayer.
  color: "#2563eb",
  opacity: 0.9,
  weight: 2,
  dashArray: "6 6",
  fill: false,
  fillOpacity: 0,
  interactive: false,
  bubblingMouseEvents: false,
  className: "dromap-workspace-rectangle",
};

type DroMapWorkspaceRectangle = L.Rectangle & {
  dromapWorkspaceRectangle?: true;
};

let workspaceRectangleLayer: DroMapWorkspaceRectangle | null = null;

function disableWorkspaceLayerPointerEvents(layer: L.Rectangle) {
  const element = layer.getElement() as SVGElement | HTMLElement | null;

  if (!element) {
    return;
  }

  element.classList.remove("leaflet-interactive");
  element.classList.remove("dromap-selectable-layer");
  element.style.pointerEvents = "none";
  element.style.cursor = "default";
}

function configureWorkspaceLayer(layer: L.Rectangle): DroMapWorkspaceRectangle {
  const workspaceLayer = layer as DroMapWorkspaceRectangle;

  workspaceLayer.dromapWorkspaceRectangle = true;
  workspaceLayer.setStyle(WORKSPACE_RECT_STYLE);
  workspaceLayer.options.pmIgnore = true;
  workspaceLayer.options.interactive = false;
  workspaceLayer.options.bubblingMouseEvents = false;
  disableWorkspaceLayerPointerEvents(workspaceLayer);

  return workspaceLayer;
}

/** Remplace le rectangle de zone de travail sur la carte. */
export function replaceWorkspaceRectangle(
  map: L.Map,
  layer: L.Rectangle,
  clampBounds?: WorkspaceClampBounds | null,
): WorkspaceBounds {
  if (workspaceRectangleLayer && map.hasLayer(workspaceRectangleLayer)) {
    map.removeLayer(workspaceRectangleLayer);
  }

  const configuredLayer = configureWorkspaceLayer(layer);
  workspaceRectangleLayer = configuredLayer;

  const bounds = boundsFromRectangle(configuredLayer, clampBounds);
  configuredLayer.setBounds(toLatLngBounds(bounds));

  return bounds;
}

/**
 * Affiche ou met à jour le rectangle à partir des bounds stockés.
 *
 * Important :
 * l'ancienne version ne faisait rien si un rectangle existait déjà.
 * Donc après chargement d'une sauvegarde, l'ancien rectangle pouvait rester visible.
 */
export function ensureWorkspaceRectangleOnMap(
  map: L.Map,
  bounds: WorkspaceBounds,
): void {
  const latLngBounds = toLatLngBounds(bounds);

  if (workspaceRectangleLayer && map.hasLayer(workspaceRectangleLayer)) {
    workspaceRectangleLayer.setBounds(latLngBounds);
    configureWorkspaceLayer(workspaceRectangleLayer);
    return;
  }

  const layer = L.rectangle(latLngBounds, WORKSPACE_RECT_STYLE);
  const configuredLayer = configureWorkspaceLayer(layer);

  configuredLayer.addTo(map);
  configureWorkspaceLayer(configuredLayer);
  workspaceRectangleLayer = configuredLayer;
}

export function clearWorkspaceRectangleFromMap(map: L.Map): void {
  if (workspaceRectangleLayer && map.hasLayer(workspaceRectangleLayer)) {
    map.removeLayer(workspaceRectangleLayer);
  }

  workspaceRectangleLayer = null;
}

export function isWorkspaceRectangleLayer(layer: L.Layer): boolean {
  return layer === workspaceRectangleLayer;
}
