"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

import { getDromapBasemapConfig } from "@/lib/dromap/basemap";
import { applyGeomanForEditorMode } from "@/lib/dromap/geoman-toolbar";
import {
  bindLayerGeomanEvents,
  syncCreateToStore,
  syncEditToStore,
  syncRemoveFromStore,
} from "@/lib/dromap/geoman-sync";
import {
  isWorkspaceRectangleLayer,
  replaceWorkspaceRectangle,
} from "@/lib/dromap/workspace-rectangle";
import { configureLeafletIcons, defaultMarkerIcon } from "@/lib/leaflet-icon";
import { getWorkspaceClampBoundsFromLatLngBounds } from "@/lib/dromap/workspace-bounds";
import { useEditorTestBasemapStore } from "@/stores/editor-test-basemap";
import {
  DROMAP_WORLD_BOUNDS,
  dromapBasemapBoundsToLeafletBounds,
  getBasemapWorkspaceBounds,
} from "./basemap-viewport-bounds";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

type GeomanLayerEvent = {
  layer: L.Layer;
  shape: string;
};

export default function GeomanControls() {
  const map = useMap();
  const currentMode = useEditorTestModeStore((state) => state.currentMode);

  useEffect(() => {
    configureLeafletIcons();

    map.pm.setGlobalOptions({
      markerStyle: { icon: defaultMarkerIcon },
    });

    const onCreate = (event: GeomanLayerEvent) => {
      const mode = useEditorTestModeStore.getState().currentMode;

      if (mode === "workspace-select") {
        if (
          event.shape === "Rectangle" &&
          event.layer instanceof L.Rectangle
        ) {
          const basemapState = useEditorTestBasemapStore.getState();
          const activeBasemapBounds = basemapState.activeBasemapBounds;
          const basemap = getDromapBasemapConfig(basemapState.basemapId);
          const viewportClampBounds = activeBasemapBounds
            ? dromapBasemapBoundsToLeafletBounds(activeBasemapBounds)
            : DROMAP_WORLD_BOUNDS;
          const workspaceClampBounds = getBasemapWorkspaceBounds(
            basemap,
            viewportClampBounds,
          );
          const bounds = replaceWorkspaceRectangle(
            map,
            event.layer,
            getWorkspaceClampBoundsFromLatLngBounds(workspaceClampBounds),
          );
          useEditorTestWorkspaceStore.getState().setWorkspaceBounds(bounds);

          window.setTimeout(() => {
            const latestMode = useEditorTestModeStore.getState().currentMode;

            if (latestMode === "workspace-select") {
              applyGeomanForEditorMode(map, latestMode);
            }
          }, 0);
        } else {
          map.removeLayer(event.layer);
        }

        return;
      }

      if (mode === "edit") {
        if (
          event.shape === "Rectangle" ||
          isWorkspaceRectangleLayer(event.layer)
        ) {
          map.removeLayer(event.layer);
          return;
        }

        if (event.layer instanceof L.Marker) {
          event.layer.setIcon(defaultMarkerIcon);
        }

        syncCreateToStore(event);
        bindLayerGeomanEvents(event.layer);
        return;
      }

      map.removeLayer(event.layer);
    };

    const onEdit = (event: GeomanLayerEvent) => {
      if (isWorkspaceRectangleLayer(event.layer)) return;
      syncEditToStore(event);
    };

    const onRemove = (event: GeomanLayerEvent) => {
      if (isWorkspaceRectangleLayer(event.layer)) return;
      syncRemoveFromStore(event);
    };

    map.on("pm:create", onCreate);
    map.on("pm:edit", onEdit);
    map.on("pm:remove", onRemove);

    applyGeomanForEditorMode(map, currentMode);

    return () => {
      map.off("pm:create", onCreate);
      map.off("pm:edit", onEdit);
      map.off("pm:remove", onRemove);

      if (map.pm.controlsVisible()) {
        map.pm.removeControls();
      }

      map.pm.disableDraw();
    };
  }, [map, currentMode]);

  return null;
}