import type L from "leaflet";

import type { EditorMode } from "@/lib/dromap/editor-mode";

const DROMAP_SNAP_DISTANCE = 5;

type GeomanDrawApi = {
  disableDraw: () => void;
  enableDraw: (shape: "Rectangle", options?: unknown) => void;
  controlsVisible: () => boolean;
  removeControls: () => void;
  globalEditModeEnabled: () => boolean;
  disableGlobalEditMode: () => void;
  globalDragModeEnabled: () => boolean;
  disableGlobalDragMode: () => void;
  globalRemovalModeEnabled: () => boolean;
  disableGlobalRemovalMode: () => void;
};

function getGeoman(map: L.Map): GeomanDrawApi {
  return map.pm as unknown as GeomanDrawApi;
}

export function deactivateGeomanModes(map: L.Map): void {
  const pm = getGeoman(map);

  pm.disableDraw();

  if (pm.globalEditModeEnabled()) {
    pm.disableGlobalEditMode();
  }

  if (pm.globalDragModeEnabled()) {
    pm.disableGlobalDragMode();
  }

  if (pm.globalRemovalModeEnabled()) {
    pm.disableGlobalRemovalMode();
  }

  if (pm.controlsVisible()) {
    pm.removeControls();
  }
}

export function applyGeomanForEditorMode(map: L.Map, mode: EditorMode): void {
  const pm = getGeoman(map);

  deactivateGeomanModes(map);

  if (mode === "workspace-select") {
    pm.enableDraw("Rectangle", {
      snappable: true,
      snapDistance: DROMAP_SNAP_DISTANCE,
      pathOptions: {
        color: "#f97316",
        weight: 2,
        opacity: 1,
        fillColor: "#f97316",
        fillOpacity: 0.08,
      },
    });
  }
}