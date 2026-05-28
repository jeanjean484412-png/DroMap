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
  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );

  useEffect(() => {
    if (currentMode !== "edit") {
      unfreezeMapNavigation(map);
      return;
    }

    let animationFrameId: number | null = null;
    const timeoutIds: number[] = [];

    const saveCurrentBasemapZoom = () => {
      const zoom = map.getZoom();

      if (Number.isFinite(zoom)) {
        useEditorTestWorkspaceStore
          .getState()
          .setWorkspaceBasemapZoom(zoom);
      }
    };

    const scheduleSaveCurrentBasemapZoom = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = window.requestAnimationFrame(saveCurrentBasemapZoom);
    };

    const scheduleDelayedSave = (delay: number) => {
      const timeoutId = window.setTimeout(saveCurrentBasemapZoom, delay);
      timeoutIds.push(timeoutId);
    };

    const shouldFit =
      useEditorTestWorkspaceStore.getState().consumePendingWorkspaceFit();

    if (shouldFit && workspaceBounds) {
      map.fitBounds(toLatLngBounds(workspaceBounds), {
        padding: WORKSPACE_FIT_PADDING,
        animate: false,
      });

      scheduleSaveCurrentBasemapZoom();
      scheduleDelayedSave(50);
      scheduleDelayedSave(250);
      scheduleDelayedSave(600);
    } else {
      scheduleSaveCurrentBasemapZoom();
    }

    map.on("zoomend", saveCurrentBasemapZoom);
    map.on("moveend", saveCurrentBasemapZoom);
    map.on("resize", scheduleSaveCurrentBasemapZoom);

    freezeMapNavigation(map);

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId);
      }

      map.off("zoomend", saveCurrentBasemapZoom);
      map.off("moveend", saveCurrentBasemapZoom);
      map.off("resize", scheduleSaveCurrentBasemapZoom);

      unfreezeMapNavigation(map);
    };
  }, [map, currentMode, workspaceBounds]);

  return null;
}