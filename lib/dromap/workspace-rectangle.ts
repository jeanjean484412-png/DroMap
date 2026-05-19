import L from "leaflet";

import { boundsFromRectangle, toLatLngBounds } from "@/lib/dromap/workspace-bounds";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";

const WORKSPACE_RECT_STYLE: L.PathOptions = {
  color: "#d97706",
  weight: 2,
  fillColor: "#fbbf24",
  fillOpacity: 0.12,
};

let workspaceRectangleLayer: L.Rectangle | null = null;

function configureWorkspaceLayer(layer: L.Rectangle): void {
  layer.setStyle(WORKSPACE_RECT_STYLE);
  layer.options.pmIgnore = true;
}

/** Remplace le rectangle de zone de travail sur la carte. */
export function replaceWorkspaceRectangle(
  map: L.Map,
  layer: L.Rectangle,
): WorkspaceBounds {
  if (workspaceRectangleLayer && map.hasLayer(workspaceRectangleLayer)) {
    map.removeLayer(workspaceRectangleLayer);
  }

  configureWorkspaceLayer(layer);
  workspaceRectangleLayer = layer;
  return boundsFromRectangle(layer);
}

/** Affiche un rectangle à partir des bounds stockés (si aucune couche active). */
export function ensureWorkspaceRectangleOnMap(
  map: L.Map,
  bounds: WorkspaceBounds,
): void {
  if (workspaceRectangleLayer && map.hasLayer(workspaceRectangleLayer)) {
    return;
  }

  const layer = L.rectangle(toLatLngBounds(bounds), WORKSPACE_RECT_STYLE);
  configureWorkspaceLayer(layer);
  layer.addTo(map);
  workspaceRectangleLayer = layer;
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
