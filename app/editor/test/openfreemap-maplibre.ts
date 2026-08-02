"use client";

import type { ExportLatLngPoint } from "./export-layout";

/**
 * MapLibre GL JS 6 est distribué uniquement en ESM et ne publie plus le
 * bundle UMD `dist/maplibre-gl.js`. L'ancienne URL sans version suivait
 * automatiquement `latest` et a donc cessé de fonctionner à la sortie de v6.
 *
 * DroMap utilise encore le bundle global compatible avec son intégration
 * Leaflet actuelle. On épingle donc la dernière branche v5 utilisée par le
 * projet et on prévoit deux CDN pour éviter qu'une panne ponctuelle d'un
 * fournisseur ne rende les fonds vectoriels indisponibles.
 */
const MAPLIBRE_GL_CSS_URLS = [
  "https://cdn.jsdelivr.net/npm/maplibre-gl@5.10.0/dist/maplibre-gl.css",
  "https://unpkg.com/maplibre-gl@5.10.0/dist/maplibre-gl.css",
] as const;

const MAPLIBRE_GL_JS_URLS = [
  "https://cdn.jsdelivr.net/npm/maplibre-gl@5.10.0/dist/maplibre-gl.js",
  "https://unpkg.com/maplibre-gl@5.10.0/dist/maplibre-gl.js",
] as const;

const MAPLIBRE_GL_LEAFLET_JS_URLS = [
  "https://cdn.jsdelivr.net/npm/@maplibre/maplibre-gl-leaflet@0.1.3/leaflet-maplibre-gl.js",
  "https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.3/leaflet-maplibre-gl.js",
] as const;

const MAPLIBRE_GL_CSS_ID = "dromap-maplibre-gl-css";
const MAPLIBRE_GL_JS_ID = "dromap-maplibre-gl-js";
const MAPLIBRE_GL_LEAFLET_JS_ID = "dromap-maplibre-gl-leaflet-js";

const MAPLIBRE_EXPORT_TIMEOUT_MS = 16000;
const TILE_SIZE = 256;
const MAPLIBRE_LEAFLET_ZOOM_OFFSET = -1;
const MAX_EXPORT_PIXEL_RATIO = 4;

type MapLibreConstructor = new (options: Record<string, unknown>) => any;

type MapLibreStyleSource = {
  url?: string;
  tiles?: string[];
  scheme?: "xyz" | "tms";
  attribution?: string;
  [key: string]: unknown;
};

type MapLibreStyleDocument = {
  version: number;
  sources?: Record<string, MapLibreStyleSource>;
  sprite?: string | Array<{ id?: string; url: string }>;
  glyphs?: string;
  [key: string]: unknown;
};

type MapLibreRuntimeError = Error & {
  status?: number;
  statusText?: string;
  url?: string;
};

type MapLibreRuntimeErrorEvent = {
  error?: MapLibreRuntimeError;
};

type MapLibreErrorMonitor = {
  getFatalError: () => Error | null;
  subscribe: (listener: (error: Error) => void) => () => void;
  dispose: () => void;
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
    L?: unknown;
    maplibregl?: {
      Map: MapLibreConstructor;
    };
  }
}

let mapLibreCssPromise: Promise<void> | null = null;
let mapLibreGlPromise: Promise<void> | null = null;
let mapLibreLeafletPromise: Promise<void> | null = null;
const mapLibreStylePromiseByUrl = new Map<
  string,
  Promise<string | MapLibreStyleDocument>
>();

function isIgnPlanVectorStyleUrl(styleUrl: string) {
  return (
    styleUrl.includes("data.geopf.fr") &&
    styleUrl.includes("/vectorTiles/styles/PLAN.IGN/")
  );
}

const IGN_VECTOR_GLYPHS_URL =
  "https://data.geopf.fr/annexes/ressources/vectorTiles/fonts/{fontstack}/{range}.pbf";

function hasMapLibreGlyphTokens(value: string) {
  return value.includes("{fontstack}") && value.includes("{range}");
}

/**
 * Résout une ressource relative du style sans laisser `URL` encoder les
 * variables MapLibre (`{z}`, `{x}`, `{y}`, `{fontstack}`, `{range}`, etc.).
 *
 * `new URL(...).toString()` transforme normalement les accolades en `%7B` et
 * `%7D`. MapLibre ne reconnaît alors plus les tokens et refuse notamment
 * l'URL des glyphes avec :
 *   glyphs url must include a "{fontstack}" / "{range}" token.
 */
function resolveStyleResourceUrl(value: string, styleUrl: string) {
  const tokens: string[] = [];
  const protectedValue = value.replace(/\{[^{}]+\}/g, (token) => {
    const marker = `DROMAP_MAPLIBRE_TOKEN_${tokens.length}_PLACEHOLDER`;
    tokens.push(token);
    return marker;
  });

  try {
    let resolvedValue = new URL(protectedValue, styleUrl).toString();

    tokens.forEach((token, index) => {
      const marker = `DROMAP_MAPLIBRE_TOKEN_${index}_PLACEHOLDER`;
      resolvedValue = resolvedValue.replaceAll(marker, token);
    });

    return resolvedValue;
  } catch {
    return value;
  }
}

function normalizeIgnPlanVectorStyle(
  style: MapLibreStyleDocument,
  styleUrl: string,
) {
  if (typeof style.glyphs === "string") {
    const resolvedGlyphsUrl = resolveStyleResourceUrl(style.glyphs, styleUrl);

    style.glyphs = hasMapLibreGlyphTokens(resolvedGlyphsUrl)
      ? resolvedGlyphsUrl
      : IGN_VECTOR_GLYPHS_URL;
  } else {
    // Le style PLAN.IGN utilise des couches symboles. On fournit donc toujours
    // une URL de glyphes valide, même si une version du style omet ce champ.
    style.glyphs = IGN_VECTOR_GLYPHS_URL;
  }

  if (typeof style.sprite === "string") {
    style.sprite = resolveStyleResourceUrl(style.sprite, styleUrl);
  } else if (Array.isArray(style.sprite)) {
    style.sprite = style.sprite.map((sprite) => ({
      ...sprite,
      url: resolveStyleResourceUrl(sprite.url, styleUrl),
    }));
  }

  for (const source of Object.values(style.sources ?? {})) {
    if (typeof source.url === "string") {
      source.url = resolveStyleResourceUrl(source.url, styleUrl);
    }

    if (Array.isArray(source.tiles)) {
      source.tiles = source.tiles.map((tileUrl) =>
        resolveStyleResourceUrl(tileUrl, styleUrl),
      );
    }

    const sourceUrls = [source.url, ...(source.tiles ?? [])].filter(
      (value): value is string => typeof value === "string",
    );

    if (
      sourceUrls.some((value) =>
        value.includes("data.geopf.fr/tms/1.0.0/PLAN.IGN"),
      )
    ) {
      // Le service public porte le nom TMS, mais ses indices Y sont servis dans
      // l’ordre XYZ attendu par MapLibre. Sans ce correctif, le plan peut être
      // retourné verticalement ou demander de mauvaises tuiles.
      source.scheme = "xyz";
      source.attribution ??= "Données cartographiques : © IGN";
    }
  }

  return style;
}

export function resolveDromapMapLibreStyle(
  styleUrl: string,
): Promise<string | MapLibreStyleDocument> {
  if (!isIgnPlanVectorStyleUrl(styleUrl)) {
    return Promise.resolve(styleUrl);
  }

  const existingPromise = mapLibreStylePromiseByUrl.get(styleUrl);

  if (existingPromise) {
    return existingPromise;
  }

  const stylePromise = fetch(styleUrl, {
    mode: "cors",
    credentials: "omit",
    cache: "force-cache",
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Style vectoriel non récupérable : ${response.status}`);
      }

      const style = (await response.json()) as MapLibreStyleDocument;

      if (!style || typeof style !== "object" || style.version !== 8) {
        throw new Error("Le style Plan IGN reçu est invalide.");
      }

      return normalizeIgnPlanVectorStyle(style, styleUrl);
    })
    .catch((error) => {
      console.warn(
        "Normalisation du style Plan IGN impossible, utilisation de l’URL directe.",
        error,
      );
      return styleUrl;
    });

  mapLibreStylePromiseByUrl.set(styleUrl, stylePromise);

  return stylePromise;
}

function ensureStylesheet(urls: readonly string[], id: string) {
  if (typeof document === "undefined") {
    return Promise.resolve();
  }

  const existingLink = document.getElementById(id) as HTMLLinkElement | null;

  if (existingLink?.dataset.loaded === "true") {
    return Promise.resolve();
  }

  existingLink?.remove();

  return new Promise<void>((resolve, reject) => {
    let urlIndex = 0;
    const failures: string[] = [];

    const tryNextUrl = () => {
      const url = urls[urlIndex];
      urlIndex += 1;

      if (!url) {
        reject(
          new Error(
            `Feuille MapLibre impossible à charger. Essais : ${failures.join(
              " | ",
            )}`,
          ),
        );
        return;
      }

      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = url;
      link.crossOrigin = "anonymous";

      link.onload = () => {
        link.dataset.loaded = "true";
        resolve();
      };

      link.onerror = () => {
        failures.push(url);
        link.remove();
        tryNextUrl();
      };

      document.head.appendChild(link);
    };

    tryNextUrl();
  });
}

function ensureScript(urls: readonly string[], id: string) {
  if (typeof document === "undefined") {
    return Promise.resolve();
  }

  const existingScript = document.getElementById(id) as HTMLScriptElement | null;

  if (existingScript?.dataset.loaded === "true") {
    return Promise.resolve();
  }

  existingScript?.remove();

  return new Promise<void>((resolve, reject) => {
    let urlIndex = 0;
    const failures: string[] = [];

    const tryNextUrl = () => {
      const url = urls[urlIndex];
      urlIndex += 1;

      if (!url) {
        reject(
          new Error(
            `Script MapLibre impossible à charger. Essais : ${failures.join(
              " | ",
            )}`,
          ),
        );
        return;
      }

      const script = document.createElement("script");
      script.id = id;
      script.src = url;
      script.async = true;
      script.crossOrigin = "anonymous";

      script.onload = () => {
        script.dataset.loaded = "true";
        resolve();
      };

      script.onerror = () => {
        failures.push(url);
        script.remove();
        tryNextUrl();
      };

      document.head.appendChild(script);
    };

    tryNextUrl();
  });
}

export async function ensureMapLibreGl() {
  if (typeof window === "undefined") {
    throw new Error("MapLibre ne peut être chargé que côté navigateur.");
  }

  if (window.maplibregl?.Map) {
    return window.maplibregl;
  }

  mapLibreCssPromise ??= ensureStylesheet(MAPLIBRE_GL_CSS_URLS, MAPLIBRE_GL_CSS_ID);
  await mapLibreCssPromise;

  mapLibreGlPromise ??= ensureScript(MAPLIBRE_GL_JS_URLS, MAPLIBRE_GL_JS_ID);
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
  const leaflet = (leafletModule.default ??
    leafletModule) as typeof import("leaflet");
  window.L = leaflet;

  if ((window.L as any)?.maplibreGL) {
    return window.L;
  }

  mapLibreLeafletPromise ??= ensureScript(
    MAPLIBRE_GL_LEAFLET_JS_URLS,
    MAPLIBRE_GL_LEAFLET_JS_ID,
  );
  await mapLibreLeafletPromise;

  if (!(window.L as any)?.maplibreGL) {
    throw new Error("Le pont Leaflet / MapLibre n’est pas disponible après chargement.");
  }

  return window.L;
}

function getMapLibreRuntimeError(event: unknown) {
  if (!event || typeof event !== "object") {
    return null;
  }

  const error = (event as MapLibreRuntimeErrorEvent).error;

  if (error instanceof Error) {
    return error;
  }

  return null;
}

function isBenignMapLibreAbortError(event: unknown) {
  const error = getMapLibreRuntimeError(event);
  const message = error?.message ?? "";

  return (
    error?.name === "AbortError" ||
    /operation was aborted|request (?:was )?aborted|aborterror|signal is aborted/i.test(
      message,
    )
  );
}

function shouldAbortMapLibreRender(event: unknown, styleUrl: string) {
  const error = getMapLibreRuntimeError(event);
  const errorUrl = typeof error?.url === "string" ? error.url : "";
  const errorMessage = error?.message ?? "";
  const concernsPlanIgn =
    isIgnPlanVectorStyleUrl(styleUrl) ||
    errorUrl.includes("data.geopf.fr/tms/1.0.0/PLAN.IGN/");

  if (!concernsPlanIgn) {
    return false;
  }

  return (
    errorUrl.includes("data.geopf.fr/tms/1.0.0/PLAN.IGN/") ||
    error?.status === 0 ||
    /NetworkError|Failed to fetch|AJAXError/i.test(errorMessage)
  );
}

function createMapLibreErrorMonitor(
  map: any,
  styleUrl: string,
): MapLibreErrorMonitor {
  let fatalError: Error | null = null;
  const listeners = new Set<(error: Error) => void>();

  const handleError = (event: unknown) => {
    const error = getMapLibreRuntimeError(event);

    // Un changement de détail ou la destruction d'une preview interrompt
    // normalement les requêtes de sprite/tuiles de l'ancien rendu.
    if (isBenignMapLibreAbortError(event)) {
      return;
    }

    if (shouldAbortMapLibreRender(event, styleUrl)) {
      fatalError =
        error ??
        new Error(
          "Le service vectoriel Plan IGN est temporairement indisponible.",
        );

      for (const listener of listeners) {
        listener(fatalError);
      }

      return;
    }

    // Avec un écouteur `error`, MapLibre n'envoie plus automatiquement ces
    // incidents vers console.error. On garde un avertissement non bloquant.
    console.warn("Ressource MapLibre non disponible.", error);
  };

  map.on("error", handleError);

  return {
    getFatalError: () => fatalError,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    dispose: () => {
      listeners.clear();
      map.off("error", handleError);
    },
  };
}

function waitForMapEvent(
  map: any,
  eventName: string,
  timeoutMs: number,
  errorMonitor: MapLibreErrorMonitor,
) {
  return new Promise<void>((resolve, reject) => {
    let timeoutId: number | null = null;
    let unsubscribeFromErrors: () => void = () => {};

    const cleanup = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }

      map.off(eventName, done);
      unsubscribeFromErrors();
    };

    const done = () => {
      cleanup();
      resolve();
    };

    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };

    const existingError = errorMonitor.getFatalError();

    if (existingError) {
      reject(existingError);
      return;
    }

    unsubscribeFromErrors = errorMonitor.subscribe(fail);
    map.once(eventName, done);
    timeoutId = window.setTimeout(() => {
      fail(
        new Error(
          `Le fond vectoriel n'a pas terminé l'événement ${eventName} à temps.`,
        ),
      );
    }, timeoutMs);
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

function serializeMapLibreLayoutValue(value: unknown) {
  try {
    return JSON.stringify(value ?? "").toLocaleLowerCase("fr");
  } catch {
    return String(value ?? "").toLocaleLowerCase("fr");
  }
}

function getMapLibreLayoutValue(map: any, layer: any, property: string) {
  if (typeof map?.getLayoutProperty === "function") {
    return map.getLayoutProperty(layer.id, property);
  }

  return layer?.layout?.[property];
}

/**
 * Détermine si une couche texte utilise un cartouche routier comme « VL7 ».
 * Dans ce cas, masquer seulement `text-field` laisserait le rectangle vide :
 * on masque donc toute la couche, texte et cartouche compris.
 */
function isMapLibreRoadShieldLayer(map: any, layer: any, textField: unknown) {
  const iconImage = getMapLibreLayoutValue(map, layer, "icon-image");

  if (iconImage === undefined || iconImage === null || iconImage === "") {
    return false;
  }

  const iconTextFit = getMapLibreLayoutValue(map, layer, "icon-text-fit");
  const sourceLayer = layer?.["source-layer"] ?? layer?.sourceLayer ?? "";
  const searchable = [
    layer?.id,
    sourceLayer,
    serializeMapLibreLayoutValue(textField),
    serializeMapLibreLayoutValue(iconImage),
    serializeMapLibreLayoutValue(iconTextFit),
  ]
    .join(" ")
    .toLocaleLowerCase("fr");

  const textUsesRouteReference =
    /(?:^|[^a-z])(ref|route_ref|road_ref|shield|network)(?:[^a-z]|$)/i.test(
      serializeMapLibreLayoutValue(textField),
    );
  const layerLooksLikeShield =
    /shield|road[-_ ]?(?:number|ref)|route[-_ ]?(?:number|ref)|highway[-_ ]?(?:number|ref)|motorway[-_ ]?(?:number|ref)|route badge|road badge/.test(
      searchable,
    );
  const iconFittedToText =
    iconTextFit !== undefined &&
    iconTextFit !== null &&
    String(iconTextFit).toLocaleLowerCase("fr") !== "none";

  return textUsesRouteReference || layerLooksLikeShield || iconFittedToText;
}

/**
 * Masque les écritures d'un style MapLibre.
 *
 * - les textes ordinaires sont retirés en conservant les pictogrammes ;
 * - les références routières placées dans un rectangle/cartouche sont
 *   masquées avec leur rectangle afin de ne jamais laisser un cadre vide ;
 * - lorsqu'un symbole avec fond n'est pas identifié avec assez de certitude,
 *   il reste intact plutôt que d'afficher un rectangle vide.
 */
export function applyMapLibreBasemapTextVisibility(
  map: any,
  visible: boolean,
) {
  if (visible || !map || typeof map.getStyle !== "function") {
    return;
  }

  const layers = map.getStyle()?.layers;

  if (!Array.isArray(layers)) {
    return;
  }

  for (const layer of layers) {
    if (!layer || layer.type !== "symbol" || typeof layer.id !== "string") {
      continue;
    }

    try {
      const textField = getMapLibreLayoutValue(map, layer, "text-field");

      if (textField === undefined || textField === null || textField === "") {
        continue;
      }

      if (isMapLibreRoadShieldLayer(map, layer, textField)) {
        map.setLayoutProperty(layer.id, "visibility", "none");
        continue;
      }

      map.setLayoutProperty(layer.id, "text-field", "");
    } catch {
      // Une couche non modifiable ne doit pas empêcher le reste du fond.
    }
  }
}

export async function renderMapLibreStyleToCanvas(input: {
  styleUrl: string;
  bounds: WorkspaceBoundsPoints;
  width: number;
  height: number;
  detailLeafletZoom?: number | null;
  renderWorldCopies?: boolean;
  showTextLabels?: boolean;
}) {
  const maplibregl = await ensureMapLibreGl();
  const resolvedStyle = await resolveDromapMapLibreStyle(input.styleUrl);
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
    style: resolvedStyle,
    interactive: false,
    attributionControl: false,
    renderWorldCopies: input.renderWorldCopies ?? true,
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
  const errorMonitor = createMapLibreErrorMonitor(map, input.styleUrl);

  try {
    if (typeof map.setPixelRatio === "function") {
      map.setPixelRatio(renderPixelRatio);
    }

    await waitForMapEvent(
      map,
      "load",
      MAPLIBRE_EXPORT_TIMEOUT_MS,
      errorMonitor,
    );

    applyMapLibreBasemapTextVisibility(
      map,
      input.showTextLabels !== false,
    );

    map.resize();
    map.jumpTo({
      center: [renderGeometry.center.lng, renderGeometry.center.lat],
      zoom: getMapLibreZoomFromLeafletZoom(renderLeafletZoom),
      bearing: 0,
      pitch: 0,
    });

    await waitForMapEvent(
      map,
      "idle",
      MAPLIBRE_EXPORT_TIMEOUT_MS,
      errorMonitor,
    );
    map.triggerRepaint?.();
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

    const sourceCanvas = map.getCanvas() as HTMLCanvasElement;
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = width;
    outputCanvas.height = height;

    const outputContext = outputCanvas.getContext("2d");

    if (!outputContext) {
      throw new Error("Impossible de créer le canvas du fond vectoriel.");
    }

    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = "high";
    outputContext.drawImage(sourceCanvas, 0, 0, width, height);

    return outputCanvas;
  } finally {
    // Laisser le moniteur actif pendant remove() afin d'absorber les
    // annulations normales des requêtes encore en vol.
    map.remove();
    errorMonitor.dispose();
    container.remove();
  }
}
