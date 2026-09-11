"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

import { setFeatureDuplicationMap } from "./feature-duplication";

/**
 * Rend la carte Leaflet courante accessible à la duplication.
 *
 * La copie est ainsi déplacée d'un nombre fixe de pixels à l'écran, plutôt
 * que d'une distance géographique fixe qui paraîtrait énorme au dézoom et
 * minuscule au zoom.
 */
export function FeatureDuplicationMapBridge() {
  const map = useMap();

  useEffect(() => {
    setFeatureDuplicationMap(map);

    return () => {
      setFeatureDuplicationMap(null);
    };
  }, [map]);

  return null;
}
