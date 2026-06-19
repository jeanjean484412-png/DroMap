"use client";

import type * as LeafletNamespace from "leaflet";
import type { ExportLatLngPoint } from "./export-layout";

const MAPLIBRE_GL_CSS_URL = "https://unpkg.com/maplibre-gl/dist/maplibre-gl.css";
const MAPLIBRE_GL_JS_URL = "https://unpkg.com/maplibre-gl/dist/maplibre-gl.js";
const MAPLIBRE_GL_LEAFLET_JS_URL =
  "https://unpkg.com/@maplibre/maplibre-gl-leaflet/leaflet-maplibre-gl.js";

const MAPLIBRE_GL_CSS_ID = "dromap-maplibre-gl-css";
const MAPLIBRE_GL_JS_ID = "dromap-maplibre-gl-js";
const MAPLIBRE_GL_LEAFLET_JS_ID = "dromap-maplibre-gl-leaflet-js";

const MAPLIBRE_EXPORT_TIMEOUT_MS = 16000;
const TILE_SIZE = 256;
const MAPLIBRE_LEAFLET_ZOOM_OFFSET = -1;
const MAX_EXPORT_PIXEL_RATIO = 4;

type MapLibreMapInstance = {
  on: (eventName: string, callback: () => void) => void;
  once: (eventName: string, callback: () => void) => void;
  off: (eventName: string, callback: () => void) => void;
  remove: () => void;
  getCanvas: () => HTMLCanvasElement;
  setPixelRatio?: (pixelRatio: number) => void;
  resize: () => void;
  jumpTo: (options: Record<string, unknown>) => void;
  triggerRepaint?: () => void;
};

type MapLibreConstructor = new (options: Record<string, unknown>) => MapLibreMapInstance;
type LeafletGlobal = typeof LeafletNamespace & {
  maplibreGL?: unknown;
};

type WorkspaceBoundsPoints = {
  southWest: ExportLatLngPoint;
  northEast: ExportLatLngPoint;
};

type ProjectedPoint = {
  x: number;
  y: number;
};

declare global {
  interface Window {
    L?: LeafletGlobal;
    maplibregl?: {
      Map: MapLibreConstructor;
    };
  }
}

let mapLibreCssPromise: Promise<void> | null = null;
let mapLibreGlPromise: Promise<void> | null = null;
let mapLibreLeafletPromise: Promise<void> | null = null;

function ensureStylesheet(url: string, id: string) {
  if (typeof document === "undefined") {
    return Promise.resolve();
  }

  if (document.getElementById(id)) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = url;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Feuille MapLibre impossible à charger : ${url}`));
    document.head.appendChild(link);
  });
}

function ensureScript(url: string, id: string) {
  if (typeof document === "undefined") {
    return Promise.resolve();
  }

  const existingScript = document.getElementById(id) as HTMLScriptElement | null;

  if (existingScript?.dataset.loaded === "true") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const script = existingScript ?? document.createElement("script");

    script.id = id;
    script.src = url;
    script.async = true;
    script.crossOrigin = "anonymous";

    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Script MapLibre impossible à charger : ${url}`));

    if (!existingScript) {
      document.head.appendChild(script);
    }
  });
}

export async function ensureMapLibreGl() {
  if (typeof window === "undefined") {
    throw new Error("MapLibre ne peut être chargé que côté navigateur.");
  }

  if (window.maplibregl?.Map) {
    return window.maplibregl;
  }

  mapLibreCssPromise ??= ensureStylesheet(MAPLIBRE_GL_CSS_URL, MAPLIBRE_GL_CSS_ID);
  await mapLibreCssPromise;

  mapLibreGlPromise ??= ensureScript(MAPLIBRE_GL_JS_URL, MAPLIBRE_GL_JS_ID);
  await mapLibreGlPromise;

  if (!window.maplibregl?.Map) {
    throw new Error("MapLibre GL n’est pas disponible après chargement.");
  }

  return window.maplibregl;
}

export async function ensureMapLibreLeaflet() {
  if (typeof window === "undefined") {
    throw new Error("MapLibre Leaflet ne peut être chargé que côté navigateur.");
  }

  await ensureMapLibreGl();

  // Ne surtout pas importer Leaflet au niveau module ici : ce fichier est aussi
  // importé par export-download.ts, qui peut être évalué pendant le rendu serveur
  // Next/Turbopack. Un import statique de leaflet déclenche `window is not defined`.
  // On charge donc Leaflet seulement au moment où le pont MapLibre/Leaflet est
  // réellement demandé côté navigateur.
  const leafletModule = await import("leaflet");
  const leaflet = (leafletModule.default ?? leafletModule) as LeafletGlobal;
  window.L = leaflet;

  if (window.L.maplibreGL) {
    return window.L;
  }

  mapLibreLeafletPromise ??= ensureScript(
    MAPLIBRE_GL_LEAFLET_JS_URL,
    MAPLIBRE_GL_LEAFLET_JS_ID,
  );
  await mapLibreLeafletPromise;

  if (!window.L?.maplibreGL) {
    throw new Error("Le pont Leaflet / MapLibre n’est pas disponible après chargement.");
  }

  return window.L;
}

function waitForMapEvent(
  map: MapLibreMapInstance,
  eventName: string,
  timeoutMs: number,
) {
  return new Promise<void>((resolve) => {
    let timeoutId: number | null = null;

    const done = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }

      resolve();
    };

    timeoutId = window.setTimeout(done, timeoutMs);
    map.once(eventName, done);
  });
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function normalizeLat(value: number) {
  return clamp(value, -85.05112878, 85.05112878);
}

function projectPoint(point: ExportLatLngPoint, zoom: number): ProjectedPoint {
  const scale = TILE_SIZE * 2 ** zoom;
  const lat = normalizeLat(point.lat);
  const sinLat = Math.sin((lat * Math.PI) / 180);

  return {
    x: ((point.lng + 180) / 360) * scale,
    y:
      (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) *
      scale,
  };
}

function unprojectPoint(point: ProjectedPoint, zoom: number): ExportLatLngPoint {
  const scale = TILE_SIZE * 2 ** zoom;
  const lng = (point.x / scale) * 360 - 180;
  const mercatorY = Math.PI - (2 * Math.PI * point.y) / scale;
  const lat = (Math.atan(Math.sinh(mercatorY)) * 180) / Math.PI;

  return {
    lat: normalizeLat(lat),
    lng,
  };
}

function getStaticRenderGeometry(bounds: WorkspaceBoundsPoints, leafletZoom: number) {
  const zoom = Math.max(0, leafletZoom);
  const northWest = projectPoint(
    {
      lat: bounds.northEast.lat,
      lng: bounds.southWest.lng,
    },
    zoom,
  );
  const southEast = projectPoint(
    {
      lat: bounds.southWest.lat,
      lng: bounds.northEast.lng,
    },
    zoom,
  );
  const width = Math.max(1, Math.abs(southEast.x - northWest.x));
  const height = Math.max(1, Math.abs(southEast.y - northWest.y));
  const center = unprojectPoint(
    {
      x: (northWest.x + southEast.x) / 2,
      y: (northWest.y + southEast.y) / 2,
    },
    zoom,
  );

  return {
    width,
    height,
    center,
  };
}

function getMapLibreZoomFromLeafletZoom(leafletZoom: number) {
  return Math.max(0, leafletZoom + MAPLIBRE_LEAFLET_ZOOM_OFFSET);
}

function getSafeDetailZoom(value: number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    // MapLibre accepte les zooms fractionnaires. Les conserver évite de
    // changer les labels/détails au moment où DroMap fige le fond.
    return Math.max(0, value);
  }

  return null;
}

export async function renderMapLibreStyleToCanvas(input: {
  styleUrl: string;
  bounds: WorkspaceBoundsPoints;
  width: number;
  height: number;
  detailLeafletZoom?: number | null;
}) {
  const maplibregl = await ensureMapLibreGl();
  const width = Math.max(1, Math.round(input.width));
  const height = Math.max(1, Math.round(input.height));
  const detailLeafletZoom = getSafeDetailZoom(input.detailLeafletZoom);
  const fallbackLeafletZoom = Math.max(0, Math.log2(Math.max(width, height) / TILE_SIZE));
  const renderLeafletZoom = detailLeafletZoom ?? fallbackLeafletZoom;
  const renderGeometry = getStaticRenderGeometry(input.bounds, renderLeafletZoom);
  const cssWidth = Math.max(1, Math.ceil(renderGeometry.width));
  const cssHeight = Math.max(1, Math.ceil(renderGeometry.height));
  const renderPixelRatio = clamp(
    Math.max(width / cssWidth, height / cssHeight, 1),
    1,
    MAX_EXPORT_PIXEL_RATIO,
  );

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-100000px";
  container.style.top = "0";
  container.style.width = `${cssWidth}px`;
  container.style.height = `${cssHeight}px`;
  container.style.overflow = "hidden";
  container.style.opacity = "0";
  container.style.pointerEvents = "none";
  container.setAttribute("aria-hidden", "true");
  document.body.appendChild(container);

  const map = new maplibregl.Map({
    container,
    style: input.styleUrl,
    interactive: false,
    attributionControl: false,
    renderWorldCopies: true,
    preserveDrawingBuffer: true,
    canvasContextAttributes: {
      preserveDrawingBuffer: true,
    },
    fadeDuration: 0,
    center: [renderGeometry.center.lng, renderGeometry.center.lat],
    zoom: getMapLibreZoomFromLeafletZoom(renderLeafletZoom),
    bearing: 0,
    pitch: 0,
  });

  try {
    if (typeof map.setPixelRatio === "function") {
      map.setPixelRatio(renderPixelRatio);
    }

    await waitForMapEvent(map, "load", MAPLIBRE_EXPORT_TIMEOUT_MS);

    map.resize();
    map.jumpTo({
      center: [renderGeometry.center.lng, renderGeometry.center.lat],
      zoom: getMapLibreZoomFromLeafletZoom(renderLeafletZoom),
      bearing: 0,
      pitch: 0,
    });

    await waitForMapEvent(map, "idle", MAPLIBRE_EXPORT_TIMEOUT_MS);
    map.triggerRepaint?.();
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

    const sourceCanvas = map.getCanvas() as HTMLCanvasElement;
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = width;
    outputCanvas.height = height;

    const outputContext = outputCanvas.getContext("2d");

    if (!outputContext) {
      throw new Error("Impossible de créer le canvas OpenFreeMap.");
    }

    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = "high";
    outputContext.drawImage(sourceCanvas, 0, 0, width, height);

    return outputCanvas;
  } finally {
    map.remove();
    container.remove();
  }
}
