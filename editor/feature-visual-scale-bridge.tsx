"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

import {
  setCurrentEditorMapZoom,
  setEditorFeatureVisualScalingEnabled,
} from "@/lib/dromap/feature-visual-scale";
import { useEditorModeStore } from "@/stores/editor-mode";
import { useEditorWorkspaceStore } from "@/stores/editor-workspace";

export function FeatureVisualScaleBridge() {
  const map = useMap();
  const currentMode = useEditorModeStore((state) => state.currentMode);
  const workspaceBounds = useEditorWorkspaceStore(
    (state) => state.workspaceBounds,
  );

  useEffect(() => {
    setEditorFeatureVisualScalingEnabled(
      currentMode === "edit" && workspaceBounds !== null,
    );
  }, [currentMode, workspaceBounds]);

  useEffect(() => {
    const syncZoom = () => {
      setCurrentEditorMapZoom(map.getZoom());
    };

    syncZoom();
    map.on("zoom zoomend moveend", syncZoom);

    return () => {
      map.off("zoom zoomend moveend", syncZoom);
      setCurrentEditorMapZoom(null);
      setEditorFeatureVisualScalingEnabled(false);
    };
  }, [map]);

  return null;
}
