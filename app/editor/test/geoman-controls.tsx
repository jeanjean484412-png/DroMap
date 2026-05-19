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
import { configureLeafletIcons, defaultMarkerIcon } from "@/lib/leaflet-icon";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";

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
      if (useEditorTestModeStore.getState().currentMode !== "edit") {
        map.removeLayer(event.layer);
        return;
      }

      if (event.layer instanceof L.Marker) {
        event.layer.setIcon(defaultMarkerIcon);
      }
      syncCreateToStore(event);
      bindLayerGeomanEvents(event.layer);
    };

    const onEdit = (event: GeomanLayerEvent) => syncEditToStore(event);
    const onRemove = (event: GeomanLayerEvent) => syncRemoveFromStore(event);

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
