"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

import {
  bindLayerGeomanEvents,
  syncCreateToStore,
  syncEditToStore,
  syncRemoveFromStore,
} from "@/lib/dromap/geoman-sync";
import { configureLeafletIcons, defaultMarkerIcon } from "@/lib/leaflet-icon";

const GEOMAN_TOOLBAR = {
  position: "topleft" as const,
  drawMarker: true,
  drawPolyline: true,
  drawPolygon: true,
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

type GeomanLayerEvent = {
  layer: L.Layer;
  shape: string;
};

export default function GeomanControls() {
  const map = useMap();

  useEffect(() => {
    configureLeafletIcons();

    map.pm.setGlobalOptions({
      markerStyle: { icon: defaultMarkerIcon },
    });

    map.pm.addControls(GEOMAN_TOOLBAR);

    const onCreate = (event: GeomanLayerEvent) => {
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

    return () => {
      map.off("pm:create", onCreate);
      map.off("pm:edit", onEdit);
      map.off("pm:remove", onRemove);
      if (map.pm.controlsVisible()) {
        map.pm.removeControls();
      }
    };
  }, [map]);

  return null;
}
