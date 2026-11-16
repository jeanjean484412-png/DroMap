"use client";

import { useEffect } from "react";
import L, { type Coords, type DoneCallback } from "leaflet";
import { useMap } from "react-leaflet";

const CACHE_NAME = "dromap-ign-satellite-tiles-v1";
const MAX_CACHED_TILES = 1200;
const CONTEXT_NATIVE_ZOOM = 12;
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

  constructor(
    url: string,
    options: L.TileLayerOptions,
    private readonly workspace?: { map: L.Map; bounds: L.LatLngBounds },
  ) {
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

    if (this.workspace) {
      const { map, bounds } = this.workspace;
      const { x: width, y: height } = this.getTileSize();
      const originX = coords.x * width;
      const originY = coords.y * height;
      const nw = map.project(bounds.getNorthWest(), coords.z);
      const se = map.project(bounds.getSouthEast(), coords.z);

      // Leaflet limite les requêtes aux tuiles qui croisent la zone. Une
      // tuile à cheval sur le bord ne doit en afficher que la partie intérieure.
      const top = Math.max(0, nw.y - originY);
      const left = Math.max(0, nw.x - originX);
      const right = Math.max(0, originX + width - se.x);
      const bottom = Math.max(0, originY + height - se.y);
      if (top || right || bottom || left) {
        tile.style.clipPath = `inset(${top / height * 100}% ${right / width * 100}% ${bottom / height * 100}% ${left / width * 100}%)`;
      }
    }

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
  workspaceBounds,
}: {
  url: string;
  attribution: string;
  maxZoom: number;
  maxNativeZoom?: number;
  workspaceBounds: [L.LatLngTuple, L.LatLngTuple] | null;
}) {
  const map = useMap();

  useEffect(() => {
    const layer = new CachedSatelliteLayer(url, {
      attribution,
      maxZoom,
      maxNativeZoom: Math.min(maxNativeZoom ?? CONTEXT_NATIVE_ZOOM, CONTEXT_NATIVE_ZOOM),
      zIndex: 1,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 6,
      className: "dromap-basemap-tile dromap-satellite-seamless-tile",
    }).addTo(map);
    return () => { layer.remove(); };
  }, [map, url, attribution, maxZoom, maxNativeZoom]);

  useEffect(() => {
    if (!workspaceBounds) return;

    const bounds = L.latLngBounds(workspaceBounds);
    const layer = new CachedSatelliteLayer(url, {
      bounds,
      minZoom: CONTEXT_NATIVE_ZOOM + 1,
      maxZoom,
      maxNativeZoom,
      zIndex: 2,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 6,
      className: "dromap-basemap-tile dromap-satellite-seamless-tile",
    }, { map, bounds }).addTo(map);
    return () => { layer.remove(); };
  }, [map, url, maxZoom, maxNativeZoom, workspaceBounds]);

  return null;
}
