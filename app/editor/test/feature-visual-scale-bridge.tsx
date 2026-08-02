"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

import {
  setCurrentEditorMapZoom,
  setEditorFeatureVisualScalingEnabled,
} from "@/lib/dromap/feature-visual-scale";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

export function FeatureVisualScaleBridge() {
  const map = useMap();
  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const workspaceBounds = useEditorTestWorkspaceStore(
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
