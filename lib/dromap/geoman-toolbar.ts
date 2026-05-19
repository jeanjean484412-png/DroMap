import type L from "leaflet";

import type { EditorMode } from "@/lib/dromap/editor-mode";

const SHARED_DISABLED_DRAW = {
  drawMarker: false,
  drawPolyline: false,
  drawPolygon: false,
  drawCircle: false,
  drawCircleMarker: false,
  drawText: false,
  cutPolygon: false,
  rotateMode: false,
};

/** Mode édition : dessin marker / ligne / zone + édition. */
export const GEOMAN_EDIT_TOOLBAR = {
  position: "topleft" as const,
  ...SHARED_DISABLED_DRAW,
  drawRectangle: false,
  drawMarker: true,
  drawPolyline: true,
  drawPolygon: true,
  editMode: true,
  dragMode: true,
  removalMode: true,
};

/** Mode sélection zone : rectangle de zone de travail uniquement. */
export const GEOMAN_WORKSPACE_SELECT_TOOLBAR = {
  position: "topleft" as const,
  ...SHARED_DISABLED_DRAW,
  drawRectangle: true,
  editMode: false,
  dragMode: false,
  removalMode: false,
};

/** Désactive les modes Geoman actifs (dessin, édition globale, etc.). */
export function deactivateGeomanModes(map: L.Map): void {
  map.pm.disableDraw();
  if (map.pm.globalEditModeEnabled()) map.pm.disableGlobalEditMode();
  if (map.pm.globalDragModeEnabled()) map.pm.disableGlobalDragMode();
  if (map.pm.globalRemovalModeEnabled()) map.pm.disableGlobalRemovalMode();
}

/** Affiche ou masque la barre Geoman selon le mode éditeur. */
export function applyGeomanForEditorMode(map: L.Map, mode: EditorMode): void {
  deactivateGeomanModes(map);

  switch (mode) {
    case "navigation":
      if (map.pm.controlsVisible()) {
        map.pm.removeControls();
      }
      break;
    case "workspace-select":
      if (map.pm.controlsVisible()) {
        map.pm.removeControls();
      }
      map.pm.addControls(GEOMAN_WORKSPACE_SELECT_TOOLBAR);
      break;
    case "edit":
      if (map.pm.controlsVisible()) {
        map.pm.removeControls();
      }
      map.pm.addControls(GEOMAN_EDIT_TOOLBAR);
      break;
  }
}
