"use client";

import { useEffect } from "react";
import L, { type Coords, type DoneCallback } from "leaflet";
import { useMap } from "react-leaflet";

const CACHE_NAME = "dromap-ign-satellite-tiles-v1";
const MAX_CACHED_TILES = 1200;
const pendingTiles = new Map<string, Promise<Blob>>();
let cachePromise: Promise<Cache | undefined> | undefined;
let writesUntilTrim = 1;

function getTileCache() {
  return cachePromise ??= typeof caches === "undefined"
    ? Promise.resolve(undefined)
    : caches.open(CACHE_NAME).catch(() => undefined);
}

async function loadTile(url: string) {
  const cache = await getTileCache();
  const cached = await cache?.match(url).catch(() => undefined);
  if (cached) return cached.blob();

  const response = await fetch(url, {
    credentials: "omit",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) {
    throw new Error("Tuile satellite indisponible.");
  }

  if (cache) {
    const copy = response.clone();
    const save = cache.put(url, copy).then(async () => {
      if (--writesUntilTrim > 0) return;
      writesUntilTrim = 32;
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_CACHED_TILES))
        .map((key) => cache.delete(key)));
    }).catch(() => undefined);
    const [blob] = await Promise.all([response.blob(), save]);
    return blob;
  }

  return response.blob();
}

function getTile(url: string) {
  const pending = pendingTiles.get(url);
  if (pending) return pending;

  const request = loadTile(url).finally(() => pendingTiles.delete(url));
  pendingTiles.set(url, request);
  return request;
}

class CachedSatelliteLayer extends L.TileLayer {
  private readonly unloadedTiles = new WeakSet<HTMLElement>();
  private readonly objectUrls = new WeakMap<HTMLElement, string>();

  constructor(url: string, options: L.TileLayerOptions) {
    super(url, options);
    this.on("tileunload tileabort", (event) => {
      const { tile } = event as L.TileEvent;
      this.unloadedTiles.add(tile);
      this.releaseObjectUrl(tile);
    });
  }

  private releaseObjectUrl(tile: HTMLElement) {
    const objectUrl = this.objectUrls.get(tile);
    if (!objectUrl) return;
    URL.revokeObjectURL(objectUrl);
    this.objectUrls.delete(tile);
  }

  protected createTile(coords: Coords, done: DoneCallback) {
    const tile = document.createElement("img");
    tile.alt = "";
    tile.crossOrigin = "anonymous";
    const url = this.getTileUrl(coords);
    tile.onload = () => {
      this.releaseObjectUrl(tile);
      if (!this.unloadedTiles.has(tile)) done(undefined, tile);
    };
    tile.onerror = () => {
      if (this.objectUrls.has(tile) && !this.unloadedTiles.has(tile)) {
        this.releaseObjectUrl(tile);
        tile.src = url;
        return;
      }
      this.releaseObjectUrl(tile);
      if (!this.unloadedTiles.has(tile)) done(new Error("Tuile satellite indisponible."), tile);
    };

    void getTile(url).then(
      (blob) => {
        if (this.unloadedTiles.has(tile)) return;
        const objectUrl = URL.createObjectURL(blob);
        this.objectUrls.set(tile, objectUrl);
        tile.src = objectUrl;
      },
      () => {
        if (!this.unloadedTiles.has(tile)) tile.src = url;
      },
    );
    return tile;
  }
}

export function CachedSatelliteTileLayer({
  url,
  attribution,
  maxZoom,
  maxNativeZoom,
}: {
  url: string;
  attribution: string;
  maxZoom: number;
  maxNativeZoom?: number;
}) {
  const map = useMap();

  useEffect(() => {
    const layer = new CachedSatelliteLayer(url, {
      attribution,
      maxZoom,
      maxNativeZoom,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 6,
      className: "dromap-basemap-tile dromap-satellite-seamless-tile",
    }).addTo(map);
    return () => { layer.remove(); };
  }, [map, url, attribution, maxZoom, maxNativeZoom]);

  return null;
}
