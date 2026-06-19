"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

import type { DromapBasemapConfig } from "@/lib/dromap/basemap";
import { getDromapBoundaryAttributionHtml } from "@/lib/dromap/credits";

type BasemapAttributionControlProps = {
  basemap: DromapBasemapConfig;
};

export function BasemapAttributionControl({
  basemap,
}: BasemapAttributionControlProps) {
  const map = useMap();

  useEffect(() => {
    const attribution = getDromapBoundaryAttributionHtml(basemap);
    const attributionControl = map.attributionControl;

    if (!attribution || !attributionControl) {
      return;
    }

    attributionControl.addAttribution(attribution);

    return () => {
      attributionControl.removeAttribution(attribution);
    };
  }, [basemap, map]);

  return null;
}
