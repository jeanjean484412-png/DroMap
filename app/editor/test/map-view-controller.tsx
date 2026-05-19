"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

import {
  freezeMapNavigation,
  unfreezeMapNavigation,
} from "@/lib/dromap/map-navigation";
import { toLatLngBounds } from "@/lib/dromap/workspace-bounds";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

const WORKSPACE_FIT_PADDING: [number, number] = [32, 32];

export default function MapViewController() {
  const map = useMap();
  const currentMode = useEditorTestModeStore((s) => s.currentMode);
  const workspaceBounds = useEditorTestWorkspaceStore((s) => s.workspaceBounds);

  useEffect(() => {
    if (currentMode === "edit") {
      const shouldFit =
        useEditorTestWorkspaceStore.getState().consumePendingWorkspaceFit();
      if (shouldFit && workspaceBounds) {
        map.fitBounds(toLatLngBounds(workspaceBounds), {
          padding: WORKSPACE_FIT_PADDING,
        });
      }
      freezeMapNavigation(map);
      return () => {
        unfreezeMapNavigation(map);
      };
    }

    unfreezeMapNavigation(map);
  }, [map, currentMode, workspaceBounds]);

  return null;
}
