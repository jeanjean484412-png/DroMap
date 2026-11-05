"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import { getDromapBasemapConfig } from "@/lib/dromap/basemap";
import {
  getWorkspaceClampBoundsFromLatLngBounds,
  resizeWorkspaceBounds,
  type WorkspaceBounds,
  type WorkspaceResizeHandle,
} from "@/lib/dromap/workspace-bounds";
import {
  clearWorkspaceRectangleFromMap,
  ensureWorkspaceRectangleOnMap,
} from "@/lib/dromap/workspace-rectangle";
import { useEditorBasemapStore } from "@/stores/editor-basemap";
import { useEditorModeStore } from "@/stores/editor-mode";
import { useEditorWorkspaceStore } from "@/stores/editor-workspace";
import {
  DROMAP_WORLD_BOUNDS,
  dromapBasemapBoundsToLeafletBounds,
  getBasemapWorkspaceBounds,
} from "./basemap-viewport-bounds";
import { applyGeomanForEditorMode } from "@/lib/dromap/geoman-toolbar";

const RESIZE_HANDLES: WorkspaceResizeHandle[] = [
  "north-west", "north", "north-east", "east",
  "south-east", "south", "south-west", "west",
];

const HANDLE_LABELS: Record<WorkspaceResizeHandle, string> = {
  "north-west": "l’angle supérieur gauche",
  north: "le côté supérieur",
  "north-east": "l’angle supérieur droit",
  east: "le côté droit",
  "south-east": "l’angle inférieur droit",
  south: "le côté inférieur",
  "south-west": "l’angle inférieur gauche",
  west: "le côté gauche",
};

function getHandleLatLng(map: L.Map, bounds: WorkspaceBounds, handle: WorkspaceResizeHandle) {
  const southWest = map.latLngToLayerPoint(bounds.southWest);
  const northEast = map.latLngToLayerPoint(bounds.northEast);
  const x = handle.includes("west") ? southWest.x : handle.includes("east") ? northEast.x : (southWest.x + northEast.x) / 2;
  const y = handle.includes("north") ? northEast.y : handle.includes("south") ? southWest.y : (southWest.y + northEast.y) / 2;
  return map.layerPointToLatLng(L.point(x, y));
}

/**
 * Garde le rectangle de zone aligné avec workspaceBounds.
 *
 * En édition, la zone de travail ne doit plus teinter la carte ni afficher de
 * contour par-dessus le fond : le cadre est donc retiré dès que la zone est
 * validée. Il revient uniquement en sélection/modification de zone pour garder
 * un repère pendant le recadrage.
 */
export default function WorkspaceBoundsLayer() {
  const map = useMap();
  const currentMode = useEditorModeStore((s) => s.currentMode);
  const workspaceBounds = useEditorWorkspaceStore((s) => s.workspaceBounds);
  const setWorkspaceBounds = useEditorWorkspaceStore((s) => s.setWorkspaceBounds);
  const basemapId = useEditorBasemapStore((s) => s.basemapId);
  const activeBasemapBounds = useEditorBasemapStore((s) => s.activeBasemapBounds);
  const workspaceZoneEditLocked = useEditorWorkspaceStore((s) => s.workspaceZoneEditLocked);

  useEffect(() => {
    if (currentMode === "workspace-select" && workspaceBounds) {
      ensureWorkspaceRectangleOnMap(map, workspaceBounds);
      return;
    }

    clearWorkspaceRectangleFromMap(map);
  }, [map, currentMode, workspaceBounds]);

  useEffect(() => {
    if (currentMode !== "workspace-select" || !workspaceBounds || workspaceZoneEditLocked) return;

    const basemap = getDromapBasemapConfig(basemapId);
    const viewportBounds = activeBasemapBounds
      ? dromapBasemapBoundsToLeafletBounds(activeBasemapBounds)
      : DROMAP_WORLD_BOUNDS;
    const clampBounds = getWorkspaceClampBoundsFromLatLngBounds(
      getBasemapWorkspaceBounds(basemap, viewportBounds),
    );
    const group = L.layerGroup();
    const markers = new Map<WorkspaceResizeHandle, L.Marker>();

    function positionHandles(bounds: WorkspaceBounds, activeHandle?: WorkspaceResizeHandle) {
      for (const [handle, marker] of markers) {
        if (handle !== activeHandle) marker.setLatLng(getHandleLatLng(map, bounds, handle));
      }
    }

    for (const handle of RESIZE_HANDLES) {
      const marker = L.marker(getHandleLatLng(map, workspaceBounds, handle), {
        draggable: true,
        autoPan: false,
        bubblingMouseEvents: false,
        zIndexOffset: 10000,
        keyboard: false,
        title: `Étirer la zone par ${HANDLE_LABELS[handle]}`,
        icon: L.divIcon({
          className: `dromap-workspace-handle dromap-workspace-handle--${handle}`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
        pmIgnore: true,
      });
      let dragStartBounds = workspaceBounds;

      marker.on("dragstart", () => {
        dragStartBounds = useEditorWorkspaceStore.getState().workspaceBounds ?? workspaceBounds;
        map.pm.disableDraw();
      });
      marker.on("drag", () => {
        const nextBounds = resizeWorkspaceBounds(dragStartBounds, handle, marker.getLatLng(), clampBounds);
        ensureWorkspaceRectangleOnMap(map, nextBounds);
        positionHandles(nextBounds, handle);
      });
      marker.on("dragend", () => {
        const nextBounds = resizeWorkspaceBounds(dragStartBounds, handle, marker.getLatLng(), clampBounds);
        ensureWorkspaceRectangleOnMap(map, nextBounds);
        positionHandles(nextBounds);
        setWorkspaceBounds(nextBounds);
        if (useEditorModeStore.getState().currentMode === "workspace-select") {
          applyGeomanForEditorMode(map, "workspace-select");
        }
      });

      marker.addTo(group);
      markers.set(handle, marker);
    }

    group.addTo(map);
    for (const marker of markers.values()) {
      const element = marker.getElement();
      if (element) L.DomEvent.disableClickPropagation(element);
    }

    return () => {
      group.removeFrom(map);
    };
  }, [map, currentMode, workspaceBounds, workspaceZoneEditLocked, basemapId, activeBasemapBounds, setWorkspaceBounds]);

  return null;
}
