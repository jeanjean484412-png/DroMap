"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

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
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

type GeomanLayerEvent = {
  layer: L.Layer;
  shape: string;
};

export default function GeomanControls() {
  const map = useMap();
  const currentMode = useEditorTestModeStore((s) => s.currentMode);

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
          const bounds = replaceWorkspaceRectangle(map, event.layer);
          useEditorTestWorkspaceStore.getState().setWorkspaceBounds(bounds);
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
    };
  }, [map, currentMode]);

  return null;
}
