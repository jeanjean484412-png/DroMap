"use client";

import type { DromapBasemapConfig } from "@/lib/dromap/basemap";
import { DROMAP_FULL_WORLD_WORKSPACE_BOUNDS } from "@/lib/dromap/workspace-bounds";

import { renderMapLibreStyleToCanvas } from "./openfreemap-maplibre";

const TILE_SIZE = 256;
const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;
const DEFAULT_WORLD_SNAPSHOT_SIZE = 2048;
const SATELLITE_WORLD_SNAPSHOT_SIZE = 3072;
const MAX_SIMULTANEOUS_TILE_REQUESTS = 12;
const TILE_REQUEST_TIMEOUT_MS = 20000;

export type WorldBasemapSnapshot = {
  url: string;
  width: number;
  height: number;
  detailLeafletZoom: number;
};

type TileRange = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const snapshotPromiseCache = new Map<string, Promise<WorldBasemapSnapshot>>();

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeDetailZoom(value: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.round(clamp(value, 0, 20) * 4) / 4;
}

function longitudeToTileX(longitude: number, zoom: number) {
  const worldTileCount = 2 ** zoom;
  return ((longitude + 180) / 360) * worldTileCount;
}

function latitudeToTileY(latitude: number, zoom: number) {
  const safeLatitude = clamp(
    latitude,
    -WEB_MERCATOR_MAX_LATITUDE,
    WEB_MERCATOR_MAX_LATITUDE,
  );
  const radians = (safeLatitude * Math.PI) / 180;
  const worldTileCount = 2 ** zoom;

  return (
    ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) /
      2) *
    worldTileCount
  );
}

function getTileRangeForBounds(
  bounds: {
    west: number;
    south: number;
    east: number;
    north: number;
  },
  zoom: number,
): TileRange {
  const worldTileCount = 2 ** zoom;
  const westX = longitudeToTileX(bounds.west, zoom);
  const eastX = longitudeToTileX(bounds.east, zoom);
  const northY = latitudeToTileY(bounds.north, zoom);
  const southY = latitudeToTileY(bounds.south, zoom);

  return {
    minX: clamp(Math.floor(Math.min(westX, eastX)), 0, worldTileCount - 1),
    maxX: clamp(
      Math.ceil(Math.max(westX, eastX)) - 1,
      0,
      worldTileCount - 1,
    ),
    minY: clamp(Math.floor(Math.min(northY, southY)), 0, worldTileCount - 1),
    maxY: clamp(
      Math.ceil(Math.max(northY, southY)) - 1,
      0,
      worldTileCount - 1,
    ),
  };
}

function canvasToObjectUrl(canvas: HTMLCanvasElement) {
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Impossible de créer l’image du fond monde."));
        return;
      }

      resolve(URL.createObjectURL(blob));
    }, "image/png");
  });
}

async function fetchImage(url: string) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    TILE_REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      mode: "cors",
      credentials: "omit",
      cache: "force-cache",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Tuile non récupérable : ${response.status}`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const nextImage = new Image();

        nextImage.onload = () => resolve(nextImage);
        nextImage.onerror = () =>
          reject(new Error("Impossible de lire une tuile du fond monde."));
        nextImage.src = objectUrl;
      });

      return image;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function runWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
) {
  const results: Array<PromiseSettledResult<T>> = new Array(tasks.length);
  let nextTaskIndex = 0;

  async function worker() {
    while (true) {
      const taskIndex = nextTaskIndex;
      nextTaskIndex += 1;

      if (taskIndex >= tasks.length) {
        return;
      }

      try {
        results[taskIndex] = {
          status: "fulfilled",
          value: await tasks[taskIndex](),
        };
      } catch (reason) {
        results[taskIndex] = {
          status: "rejected",
          reason,
        };
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), tasks.length) },
      () => worker(),
    ),
  );

  return results;
}

function getTileSnapshotZoom(
  basemap: Extract<DromapBasemapConfig, { kind: "tile" }>,
  detailLeafletZoom: number,
) {
  const maxNativeZoom = basemap.maxNativeZoom ?? basemap.maxZoom;

  if (basemap.id === "ign-satellite") {
    // La vue monde utilise volontairement les détails d'un faible zoom, mais
    // l'orthophotographie peut être capturée deux niveaux plus précisément sans
    // modifier les labels ni la géométrie. Le zoom 3 couvre le monde avec
    // seulement 64 tuiles et conserve aussi les éventuelles emprises ultramarines.
    return clamp(3, 0, maxNativeZoom);
  }

  return clamp(Math.floor(detailLeafletZoom), 0, maxNativeZoom);
}

async function renderTileBasemapSnapshot(
  basemap: Extract<DromapBasemapConfig, { kind: "tile" }>,
  detailLeafletZoom: number,
) {
  const isSatellite = basemap.id === "ign-satellite";
  const outputSize = isSatellite
    ? SATELLITE_WORLD_SNAPSHOT_SIZE
    : DEFAULT_WORLD_SNAPSHOT_SIZE;
  const tileZoom = getTileSnapshotZoom(basemap, detailLeafletZoom);
  const worldTileCount = 2 ** tileZoom;
  const sourceBounds = {
    west: -180,
    south: -WEB_MERCATOR_MAX_LATITUDE,
    east: 180,
    north: WEB_MERCATOR_MAX_LATITUDE,
  };
  const tileRange = getTileRangeForBounds(sourceBounds, tileZoom);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Impossible de créer le canvas du fond monde.");
  }

  context.fillStyle = basemap.exportBackground;
  context.fillRect(0, 0, outputSize, outputSize);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const tasks: Array<() => Promise<{
    image: HTMLImageElement;
    tileX: number;
    tileY: number;
  }>> = [];

  for (let tileX = tileRange.minX; tileX <= tileRange.maxX; tileX += 1) {
    for (let tileY = tileRange.minY; tileY <= tileRange.maxY; tileY += 1) {
      tasks.push(async () => ({
        image: await fetchImage(
          basemap.getExportTileUrl(tileZoom, tileX, tileY),
        ),
        tileX,
        tileY,
      }));
    }
  }

  const tileResults = await runWithConcurrencyLimit(
    tasks,
    MAX_SIMULTANEOUS_TILE_REQUESTS,
  );
  const destinationTileSize = outputSize / worldTileCount;
  let loadedTileCount = 0;

  for (const result of tileResults) {
    if (result.status !== "fulfilled") {
      continue;
    }

    loadedTileCount += 1;

    const { image, tileX, tileY } = result.value;
    const destinationX = tileX * destinationTileSize;
    const destinationY = tileY * destinationTileSize;
    const seamOverlap = isSatellite ? 1 : 0;

    context.drawImage(
      image,
      destinationX,
      destinationY,
      destinationTileSize + seamOverlap,
      destinationTileSize + seamOverlap,
    );
  }

  if (loadedTileCount === 0) {
    throw new Error("Aucune tuile du fond monde n’a pu être chargée.");
  }

  return {
    canvas,
    outputSize,
  };
}

async function createWorldBasemapSnapshot(
  basemap: DromapBasemapConfig,
  detailLeafletZoom: number,
): Promise<WorldBasemapSnapshot> {
  const normalizedDetailZoom = normalizeDetailZoom(detailLeafletZoom);

  if (basemap.kind === "solid") {
    throw new Error("Ce fond ne nécessite pas de capture monde.");
  }

  if (basemap.kind === "maplibre") {
    const outputSize = DEFAULT_WORLD_SNAPSHOT_SIZE;
    const canvas = await renderMapLibreStyleToCanvas({
      styleUrl: basemap.styleUrl,
      bounds: DROMAP_FULL_WORLD_WORKSPACE_BOUNDS,
      width: outputSize,
      height: outputSize,
      detailLeafletZoom: normalizedDetailZoom,
      renderWorldCopies: false,
    });

    return {
      url: await canvasToObjectUrl(canvas),
      width: outputSize,
      height: outputSize,
      detailLeafletZoom: normalizedDetailZoom,
    };
  }

  const { canvas, outputSize } = await renderTileBasemapSnapshot(
    basemap,
    normalizedDetailZoom,
  );

  return {
    url: await canvasToObjectUrl(canvas),
    width: outputSize,
    height: outputSize,
    detailLeafletZoom: normalizedDetailZoom,
  };
}

export function getWorldBasemapSnapshot(
  basemap: DromapBasemapConfig,
  detailLeafletZoom: number,
) {
  const normalizedDetailZoom = normalizeDetailZoom(detailLeafletZoom);
  const outputSize =
    basemap.id === "ign-satellite"
      ? SATELLITE_WORLD_SNAPSHOT_SIZE
      : DEFAULT_WORLD_SNAPSHOT_SIZE;
  const cacheKey = `${basemap.id}:${normalizedDetailZoom}:${outputSize}`;
  const cachedPromise = snapshotPromiseCache.get(cacheKey);

  if (cachedPromise) {
    return cachedPromise;
  }

  const snapshotPromise = createWorldBasemapSnapshot(
    basemap,
    normalizedDetailZoom,
  ).catch((error) => {
    snapshotPromiseCache.delete(cacheKey);
    throw error;
  });

  snapshotPromiseCache.set(cacheKey, snapshotPromise);

  return snapshotPromise;
}
