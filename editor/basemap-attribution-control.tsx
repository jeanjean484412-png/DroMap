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

    if (!attributionControl) {
      return;
    }

    // Le préfixe « Leaflet » n'est pas une attribution cartographique
    // obligatoire. Sa licence reste documentée sur /credits et dans les
    // notices tierces ; on réserve la ligne visible aux sources de carte.
    attributionControl.setPrefix(false);

    const container = attributionControl.getContainer();
    const previousOpacity = container?.style.opacity ?? "";
    const previousBackground = container?.style.backgroundColor ?? "";

    if (container && basemap.id === "ign-satellite") {
      // Le fond satellite est très contrasté : les crédits obligatoires
      // restent entièrement opaques pour conserver une lecture immédiate.
      container.style.opacity = "1";
      container.style.backgroundColor = "rgba(255, 255, 255, 1)";
    }

    if (!attribution) {
      return () => {
        if (container) {
          container.style.opacity = previousOpacity;
          container.style.backgroundColor = previousBackground;
        }
      };
    }

    attributionControl.addAttribution(attribution);

    return () => {
      attributionControl.removeAttribution(attribution);
      if (container) {
        container.style.opacity = previousOpacity;
        container.style.backgroundColor = previousBackground;
      }
    };
  }, [basemap, map]);

  return null;
}
