import type L from "leaflet";

import type { EditorMode } from "@/lib/dromap/editor-mode";

const SHARED_TOOLBAR_OPTIONS = {
  position: "topleft" as const,
  drawRectangle: false,
  drawCircle: false,
  drawCircleMarker: false,
  drawText: false,
  cutPolygon: false,
  rotateMode: false,
  editMode: true,
  dragMode: true,
  removalMode: true,
};

/** Mode édition : dessin marker / ligne / zone + édition. */
export const GEOMAN_EDIT_TOOLBAR = {
  ...SHARED_TOOLBAR_OPTIONS,
  drawMarker: true,
  drawPolyline: true,
  drawPolygon: true,
};

/** Mode sélection zone : édition des couches existantes, pas de nouveau dessin. */
export const GEOMAN_WORKSPACE_SELECT_TOOLBAR = {
  ...SHARED_TOOLBAR_OPTIONS,
  drawMarker: false,
  drawPolyline: false,
  drawPolygon: false,
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
