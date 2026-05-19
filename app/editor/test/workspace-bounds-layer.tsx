"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

import {
  clearWorkspaceRectangleFromMap,
  ensureWorkspaceRectangleOnMap,
} from "@/lib/dromap/workspace-rectangle";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

/** Garde le rectangle de zone aligné avec workspaceBounds (affichage / effacement). */
export default function WorkspaceBoundsLayer() {
  const map = useMap();
  const workspaceBounds = useEditorTestWorkspaceStore((s) => s.workspaceBounds);

  useEffect(() => {
    if (workspaceBounds) {
      ensureWorkspaceRectangleOnMap(map, workspaceBounds);
    } else {
      clearWorkspaceRectangleFromMap(map);
    }
  }, [map, workspaceBounds]);

  return null;
}
