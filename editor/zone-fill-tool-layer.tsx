"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import { getDromapBasemapConfig } from "@/lib/dromap/basemap";
import { useEditorBasemapStore } from "@/stores/editor-basemap";
import { useEditorDrawingOptionsStore } from "@/stores/editor-drawing-options";
import { useEditorFeaturesStore } from "@/stores/editor-features";
import { useEditorGeoJsonLayersStore } from "@/stores/editor-geojson-layers";
import { useEditorModeStore } from "@/stores/editor-mode";
import { useEditorToolStore } from "@/stores/editor-tool";
import { useEditorWorkspaceStore } from "@/stores/editor-workspace";
import {
  createZoneFillFeatureAtLngLat,
  createZoneFillFeatureFromGeoJsonLayersAtLngLat,
  createWorkspaceWaterFillFeatureAtLngLat,
} from "./zone-fill";

export function ZoneFillToolLayer() {
  const map = useMap();
  const requestIdRef = useRef(0);
  const messageTimeoutRef = useRef<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const currentMode = useEditorModeStore((state) => state.currentMode);
  const activeTool = useEditorToolStore((state) => state.activeTool);
  const basemapId = useEditorBasemapStore((state) => state.basemapId);
  const zoneStyle = useEditorDrawingOptionsStore((state) => state.zoneStyle);

  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current !== null) {
        window.clearTimeout(messageTimeoutRef.current);
        messageTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (currentMode !== "edit" || activeTool !== "fill-zone") {
      setStatusMessage(null);
      return;
    }

    const showTemporaryStatus = (message: string, duration = 3600) => {
      if (messageTimeoutRef.current !== null) {
        window.clearTimeout(messageTimeoutRef.current);
      }

      setStatusMessage(message);
      messageTimeoutRef.current = window.setTimeout(() => {
        setStatusMessage(null);
        messageTimeoutRef.current = null;
      }, duration);
    };

    const handleClick = async (event: L.LeafletMouseEvent) => {
      const latestMode = useEditorModeStore.getState().currentMode;
      const latestTool = useEditorToolStore.getState().activeTool;

      if (latestMode !== "edit" || latestTool !== "fill-zone") {
        return;
      }

      if (event.originalEvent) {
        L.DomEvent.stop(event.originalEvent);
      }

      const geoJsonResult = createZoneFillFeatureFromGeoJsonLayersAtLngLat({
        layers: useEditorGeoJsonLayersStore.getState().geoJsonLayers,
        lngLat: [event.latlng.lng, event.latlng.lat],
        style: useEditorDrawingOptionsStore.getState().zoneStyle,
        workspaceBounds: useEditorWorkspaceStore.getState().workspaceBounds,
      });

      if (geoJsonResult.match) {
        useEditorFeaturesStore
          .getState()
          .addFeatureWithHistory(geoJsonResult.match.feature);
        setStatusMessage(null);
        return;
      }

      const latestBasemapId = useEditorBasemapStore.getState().basemapId;
      const latestBasemap = getDromapBasemapConfig(latestBasemapId);

      if (latestBasemap.kind === "tile") {
        showTemporaryStatus(
          "Aucune zone GeoJSON trouvée ici. Le remplissage des fonds classiques reste indisponible ; utilise un fond blanc/vectoriel ou clique dans une zone GeoJSON visible.",
          4200,
        );
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setStatusMessage("Recherche de la zone vectorielle…");

      const result = await createZoneFillFeatureAtLngLat({
        basemapId: latestBasemapId,
        lngLat: [event.latlng.lng, event.latlng.lat],
        style: useEditorDrawingOptionsStore.getState().zoneStyle,
      });

      if (requestIdRef.current !== requestId) {
        return;
      }

      const stillInFillMode =
        useEditorModeStore.getState().currentMode === "edit" &&
        useEditorToolStore.getState().activeTool === "fill-zone";

      if (!stillInFillMode) {
        setStatusMessage(null);
        return;
      }

      const waterResult = result.match
        ? result
        : await createWorkspaceWaterFillFeatureAtLngLat({
            basemapId: latestBasemapId,
            lngLat: [event.latlng.lng, event.latlng.lat],
            style: useEditorDrawingOptionsStore.getState().zoneStyle,
            workspaceBounds: useEditorWorkspaceStore.getState().workspaceBounds,
          });

      if (requestIdRef.current !== requestId) {
        return;
      }

      if (!waterResult.match) {
        showTemporaryStatus(
          "Aucune zone vectorielle, mer ou océan remplissable trouvé ici.",
          3200,
        );
        return;
      }

      useEditorFeaturesStore
        .getState()
        .addFeatureWithHistory(waterResult.match.feature);
      setStatusMessage(null);
    };

    map.on("click", handleClick);

    return () => {
      map.off("click", handleClick);
      requestIdRef.current += 1;
    };
  }, [activeTool, basemapId, currentMode, map, zoneStyle]);

  if (currentMode !== "edit" || activeTool !== "fill-zone" || !statusMessage) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-[900] max-w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-slate-200 bg-white/95 px-3 py-1.5 text-center text-xs font-medium leading-snug text-slate-700 shadow-lg">
      {statusMessage}
    </div>
  );
}
