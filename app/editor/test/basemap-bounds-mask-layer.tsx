"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import { getDromapBasemapConfig } from "@/lib/dromap/basemap";
import { useEditorTestBasemapStore } from "@/stores/editor-test-basemap";

const WORLD_SOUTH = -85.05112878;
const WORLD_NORTH = 85.05112878;
const WORLD_WEST = -180;
const WORLD_EAST = 180;

/**
 * Fond utile du monde pour les fonds vectoriels blancs.
 *
 * Important : cette couche ne masque plus les bornes du pays/continent actif.
 * Le gris autour de la carte vient maintenant seulement du fond de la carte
 * Leaflet quand l'utilisateur se déplace un peu hors du monde réel. Cela
 * permet de centrer une zone de travail au bord du monde sans griser l'espace
 * autour d'un pays ou d'un continent sélectionné.
 */
export function BasemapBoundsMaskLayer() {
  const map = useMap();
  const basemapId = useEditorTestBasemapStore((state) => state.basemapId);

  useEffect(() => {
    const basemap = getDromapBasemapConfig(basemapId);

    if (basemap.kind !== "solid") {
      return;
    }

    let pane = map.getPane("basemapWorldBackgroundPane");

    if (!pane) {
      pane = map.createPane("basemapWorldBackgroundPane");
      pane.style.zIndex = "180";
      pane.style.pointerEvents = "none";
    }

    const backgroundBounds = basemap.worldBackgroundBounds ?? {
      south: WORLD_SOUTH,
      west: WORLD_WEST,
      north: WORLD_NORTH,
      east: WORLD_EAST,
    };

    const worldBackground = L.rectangle(
      [
        [backgroundBounds.south, backgroundBounds.west],
        [backgroundBounds.north, backgroundBounds.east],
      ],
      {
        pane: "basemapWorldBackgroundPane",
        stroke: false,
        fill: true,
        fillColor: basemap.background,
        fillOpacity: 1,
        interactive: false,
        bubblingMouseEvents: false,
      },
    ).addTo(map);

    return () => {
      worldBackground.removeFrom(map);
    };
  }, [basemapId, map]);

  return null;
}
