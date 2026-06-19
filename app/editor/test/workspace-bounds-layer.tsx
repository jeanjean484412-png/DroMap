"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

import {
  clearWorkspaceRectangleFromMap,
  ensureWorkspaceRectangleOnMap,
} from "@/lib/dromap/workspace-rectangle";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

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
  const currentMode = useEditorTestModeStore((s) => s.currentMode);
  const workspaceBounds = useEditorTestWorkspaceStore((s) => s.workspaceBounds);

  useEffect(() => {
    if (currentMode === "workspace-select" && workspaceBounds) {
      ensureWorkspaceRectangleOnMap(map, workspaceBounds);
      return;
    }

    clearWorkspaceRectangleFromMap(map);
  }, [map, currentMode, workspaceBounds]);

  return null;
}
