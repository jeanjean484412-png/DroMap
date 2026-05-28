import L from "leaflet";

import {
  boundsFromRectangle,
  toLatLngBounds,
} from "@/lib/dromap/workspace-bounds";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";

const WORKSPACE_RECT_STYLE: L.PathOptions = {
  color: "#d97706",
  weight: 2,
  fillColor: "#fbbf24",
  fillOpacity: 0.12,
};

type DroMapWorkspaceRectangle = L.Rectangle & {
  dromapWorkspaceRectangle?: true;
};

let workspaceRectangleLayer: DroMapWorkspaceRectangle | null = null;

function configureWorkspaceLayer(layer: L.Rectangle): DroMapWorkspaceRectangle {
  const workspaceLayer = layer as DroMapWorkspaceRectangle;

  workspaceLayer.dromapWorkspaceRectangle = true;
  workspaceLayer.setStyle(WORKSPACE_RECT_STYLE);
  workspaceLayer.options.pmIgnore = true;
  workspaceLayer.options.interactive = false;

  return workspaceLayer;
}

/** Remplace le rectangle de zone de travail sur la carte. */
export function replaceWorkspaceRectangle(
  map: L.Map,
  layer: L.Rectangle,
): WorkspaceBounds {
  if (workspaceRectangleLayer && map.hasLayer(workspaceRectangleLayer)) {
    map.removeLayer(workspaceRectangleLayer);
  }

  const configuredLayer = configureWorkspaceLayer(layer);
  workspaceRectangleLayer = configuredLayer;

  return boundsFromRectangle(configuredLayer);
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