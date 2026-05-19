"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

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

export default function GeomanControls() {
  const map = useMap();

  useEffect(() => {
    configureLeafletIcons();

    map.pm.setGlobalOptions({
      markerStyle: { icon: defaultMarkerIcon },
    });

    map.pm.addControls(GEOMAN_TOOLBAR);

    const onCreate = (event: { layer: L.Layer }) => {
      if (event.layer instanceof L.Marker) {
        event.layer.setIcon(defaultMarkerIcon);
      }
    };

    map.on("pm:create", onCreate);

    return () => {
      map.off("pm:create", onCreate);
      if (map.pm.controlsVisible()) {
        map.pm.removeControls();
      }
    };
  }, [map]);

  return null;
}
