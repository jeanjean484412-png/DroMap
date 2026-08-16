"use client";

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import {
  getDromapBasemapConfig,
  type DromapBasemapConfig,
  type DromapBasemapId,
} from "@/lib/dromap/basemap";
import { BasemapBoundariesLayer } from "@/app/editor/test/basemap-boundaries-layer";
import { MapLibreBasemapLayer } from "@/app/editor/test/maplibre-basemap-layer";
import { getBasemapViewportBounds } from "@/app/editor/test/basemap-viewport-bounds";

const CLASSIC_PREVIEW_BOUNDS = L.latLngBounds([42.2, -4.8], [51.2, 9.3]);

function PreviewViewportController({ basemap }: { basemap: DromapBasemapConfig }) {
  const map = useMap();
  const [renderBounds, setRenderBounds] = useState<L.LatLngBounds | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fitPreview() {
      const bounds =
        basemap.kind === "tile" || basemap.kind === "maplibre"
          ? basemap.viewportBounds
            ? L.latLngBounds(
                [basemap.viewportBounds.south, basemap.viewportBounds.west],
                [basemap.viewportBounds.north, basemap.viewportBounds.east],
              )
            : CLASSIC_PREVIEW_BOUNDS
          : await getBasemapViewportBounds(basemap);

      if (cancelled) return;
      setRenderBounds(bounds);
      map.invalidateSize({ pan: false });
      map.fitBounds(bounds, {
        animate: false,
        padding: [24, 24],
        maxZoom: basemap.kind === "solid" ? 8 : 7,
      });
    }

    void fitPreview();

    return () => {
      cancelled = true;
    };
  }, [basemap, map]);

  return (
    <BasemapBoundariesLayer
      boundaryOverlay={basemap.boundaryOverlay}
      renderBounds={renderBounds ?? undefined}
    />
  );
}

export function BasemapLivePreview({ basemapId }: { basemapId: DromapBasemapId }) {
  const basemap = getDromapBasemapConfig(basemapId);
  const fallbackBasemap =
    basemap.kind === "maplibre" && basemap.fallbackTileBasemapId
      ? getDromapBasemapConfig(basemap.fallbackTileBasemapId)
      : null;
  const fallbackTileUrl =
    fallbackBasemap?.kind === "tile"
      ? fallbackBasemap.screenTileUrl ?? fallbackBasemap.tileUrl
      : undefined;
  const tileUrl =
    basemap.kind === "tile"
      ? basemap.screenTileUrl ?? basemap.tileUrl
      : undefined;
  const mapKey = useMemo(() => `basemap-preview-${basemap.id}`, [basemap.id]);

  return (
    <div className="relative h-full min-h-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
      <MapContainer
        key={mapKey}
        center={[46.6, 1.9]}
        zoom={5}
        zoomControl={false}
        attributionControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        boxZoom={false}
        keyboard={false}
        touchZoom={false}
        className="h-full w-full"
        style={{
          background:
            basemap.kind === "solid" ? basemap.background : basemap.exportBackground,
        }}
      >
        {basemap.kind === "tile" && tileUrl ? (
          <TileLayer
            key={`${basemap.id}-${tileUrl}`}
            url={tileUrl}
            attribution={basemap.attribution}
            maxZoom={basemap.maxZoom}
            maxNativeZoom={basemap.maxNativeZoom}
            crossOrigin="anonymous"
            detectRetina={false}
            updateWhenIdle
            keepBuffer={2}
          />
        ) : null}

        {basemap.kind === "maplibre" ? (
          <MapLibreBasemapLayer
            key={`${basemap.id}-${basemap.styleUrl}`}
            styleUrl={basemap.styleUrl}
            attribution={basemap.attribution}
            fallbackTileUrl={fallbackTileUrl}
            fallbackTileMaxZoom={
              fallbackBasemap?.kind === "tile" ? fallbackBasemap.maxZoom : undefined
            }
            fallbackTileMaxNativeZoom={
              fallbackBasemap?.kind === "tile"
                ? fallbackBasemap.maxNativeZoom
                : undefined
            }
            renderWorldCopies={false}
            showTextLabels
          />
        ) : null}

        <PreviewViewportController basemap={basemap} />
      </MapContainer>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/70 to-transparent px-4 pb-3 pt-10 text-white">
        <div className="font-black">{basemap.label}</div>
        <div className="mt-0.5 line-clamp-2 text-xs text-white/85">
          {basemap.description}
        </div>
      </div>
    </div>
  );
}
