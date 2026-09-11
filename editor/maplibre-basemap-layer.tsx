"use client";

import { useEffect, useState } from "react";
import L from "leaflet";
import { TileLayer, useMap } from "react-leaflet";

import {
  applyMapLibreBasemapTextVisibility,
  ensureMapLibreGl,
  resolveDromapMapLibreStyle,
} from "./openfreemap-maplibre";
import { getFullWorldScreenFrame } from "./full-world-screen-frame";

type MapLibreBasemapLayerProps = {
  styleUrl: string;
  attribution: string;
  /**
   * Zoom Leaflet servant de niveau de détail figé.
   *
   * Les fonds raster classiques utilisent minNativeZoom/maxNativeZoom : quand
   * l'utilisateur zoome après validation de la zone, Leaflet agrandit/réduit les
   * mêmes tuiles au lieu de demander un niveau de détail différent. Les fonds
   * OpenFreeMap sont vectoriels, donc MapLibre changerait naturellement les
   * labels/routes affichés à chaque zoom. On reproduit ici le comportement des
   * tuiles raster : MapLibre garde ce zoom de détail, puis son canvas est mis à
   * l'échelle pour suivre le zoom graphique Leaflet.
   */
  lockedNativeZoom?: number | null;
  fallbackTileUrl?: string;
  fallbackTileMaxZoom?: number;
  fallbackTileMaxNativeZoom?: number;
  renderWorldCopies?: boolean;
  /** Affiche ou masque seulement les écritures du fond vectoriel. */
  showTextLabels?: boolean;
  /**
   * En mode « Monde entier », MapLibre ne doit pas utiliser toute la largeur
   * de l’éditeur. Sinon, avec renderWorldCopies=false, MapLibre augmente
   * automatiquement son zoom minimal pour remplir le grand viewport et ne
   * montre plus qu’une partie du monde (par exemple l’Afrique).
   *
   * On lui donne donc le rectangle géographique exact du monde : son canvas
   * est limité à ce rectangle, tandis que le reste de l’éditeur reste gris.
   */
  singleWorldBounds?: L.LatLngBoundsExpression;
};

type LeafletZoomAnimationEvent = {
  center?: L.LatLng;
  zoom?: number;
};

type ApplyMapLibreViewOptions = LeafletZoomAnimationEvent & {
  deferResize?: boolean;
  deferMapLibreSync?: boolean;
};

type MapLibreRuntimeError = Error & {
  status?: number;
  statusText?: string;
  url?: string;
};

type MapLibreRuntimeErrorEvent = {
  error?: MapLibreRuntimeError;
};

const MAPLIBRE_BASEMAP_PANE = "dromapMapLibreBasemapPane";
const MAPLIBRE_LEAFLET_ZOOM_OFFSET = -1;
const MIN_MAPLIBRE_ZOOM = 0;
const MAX_LOCK_SCALE = 8;
const MIN_LOCK_SCALE = 1 / 8;
const MAPLIBRE_BASEMAP_LOAD_TIMEOUT_MS = 16000;


type DroMapMapLibreGuardWindow = Window & {
  __dromapMapLibreAbortGuardInstalled?: boolean;
};

function getErrorText(value: unknown) {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isBenignMapLibreAbortValue(value: unknown) {
  const text = getErrorText(value);
  const isAbort =
    /operation was aborted|request (?:was )?aborted|aborterror|signal is aborted/i.test(
      text,
    );
  const concernsMapLibreResource =
    /ajaxerror|maplibre|openfreemap|tiles\.openfreemap\.org|\/sprites\/|sprite.*\.json|sprite.*\.png/i.test(
      text,
    );

  return isAbort && concernsMapLibreResource;
}

function ensureMapLibreAbortConsoleGuard() {
  if (typeof window === "undefined") return;

  const guardedWindow = window as DroMapMapLibreGuardWindow;
  if (guardedWindow.__dromapMapLibreAbortGuardInstalled) return;
  guardedWindow.__dromapMapLibreAbortGuardInstalled = true;

  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (args.some(isBenignMapLibreAbortValue)) {
      return;
    }

    originalConsoleError(...args);
  };

  window.addEventListener(
    "unhandledrejection",
    (event) => {
      if (isBenignMapLibreAbortValue(event.reason)) {
        event.preventDefault();
      }
    },
    true,
  );

  window.addEventListener(
    "error",
    (event) => {
      if (
        isBenignMapLibreAbortValue(event.error) ||
        isBenignMapLibreAbortValue(event.message)
      ) {
        event.preventDefault();
      }
    },
    true,
  );
}

function getFiniteZoom(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function getMapLibreRuntimeError(event: unknown) {
  if (!event || typeof event !== "object") {
    return null;
  }

  const error = (event as MapLibreRuntimeErrorEvent).error;

  if (error instanceof Error) {
    return error;
  }

  if (error && typeof error === "object") {
    return error as MapLibreRuntimeError;
  }

  return null;
}

function isBenignMapLibreAbortError(event: unknown) {
  const error = getMapLibreRuntimeError(event);
  const message = error?.message ?? "";
  const name = error?.name ?? "";

  return (
    name === "AbortError" ||
    /operation was aborted|request (?:was )?aborted|aborterror|signal is aborted/i.test(
      message,
    )
  );
}

function isPlanIgnVectorStyle(styleUrl: string) {
  return styleUrl.includes("/vectorTiles/styles/PLAN.IGN/");
}

function shouldUseRasterFallbackForError(
  event: unknown,
  styleUrl: string,
) {
  const error = getMapLibreRuntimeError(event);
  const errorUrl = typeof error?.url === "string" ? error.url : "";
  const errorMessage = error?.message ?? "";
  const concernsPlanIgn =
    isPlanIgnVectorStyle(styleUrl) ||
    errorUrl.includes("data.geopf.fr/tms/1.0.0/PLAN.IGN/");

  if (!concernsPlanIgn) {
    return false;
  }

  // Une erreur sur une tuile PLAN.IGN peut survenir après l'événement `load`.
  // Sans écouteur dédié, MapLibre l'écrit comme Console Error et le fond peut
  // rester partiellement vide. DroMap bascule alors sur le WMTS raster IGN.
  return (
    errorUrl.includes("data.geopf.fr/tms/1.0.0/PLAN.IGN/") ||
    error?.status === 0 ||
    /NetworkError|Failed to fetch|AJAXError/i.test(errorMessage)
  );
}

function getDetailZoom(currentLeafletZoom: number, lockedNativeZoom?: number | null) {
  if (typeof lockedNativeZoom === "number" && Number.isFinite(lockedNativeZoom)) {
    return getFiniteZoom(lockedNativeZoom);
  }

  return getFiniteZoom(currentLeafletZoom);
}

function getMapLibreZoomFromLeafletZoom(leafletZoom: number) {
  return Math.max(
    MIN_MAPLIBRE_ZOOM,
    getFiniteZoom(leafletZoom) + MAPLIBRE_LEAFLET_ZOOM_OFFSET,
  );
}

/**
 * MapLibre utilise des tuiles vectorielles de 512 px alors que Leaflet raisonne
 * ici avec une grille de 256 px. Un zoom Leaflet correspond donc à un zoom
 * MapLibre inférieur d'un niveau.
 *
 * Tant que Leaflet est à z >= 1, MapLibre peut suivre directement. À z < 1,
 * MapLibre est bloqué à son zoom minimal 0. Sans compensation, le fond cesse de
 * dézoomer alors que les objets Leaflet continuent à rétrécir : leur position
 * visuelle se décale alors du fond.
 *
 * On conserve MapLibre à z 0 et on réduit graphiquement son canvas selon le
 * zoom Leaflet réellement demandé. Le fond et les objets gardent ainsi la même
 * projection jusque dans le dézoom maximal avant sélection d'une zone.
 */
function getMapLibreRenderZoom(
  currentLeafletZoom: number,
  lockedNativeZoom?: number | null,
) {
  const requestedDetailLeafletZoom = getDetailZoom(
    currentLeafletZoom,
    lockedNativeZoom,
  );
  const mapLibreZoom = getMapLibreZoomFromLeafletZoom(
    requestedDetailLeafletZoom,
  );
  const renderedDetailLeafletZoom =
    mapLibreZoom - MAPLIBRE_LEAFLET_ZOOM_OFFSET;

  return {
    mapLibreZoom,
    renderedDetailLeafletZoom,
  };
}

function clampScale(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  return Math.min(MAX_LOCK_SCALE, Math.max(MIN_LOCK_SCALE, value));
}

function getClosestWrappedLongitude(longitude: number, reference: number) {
  let wrappedLongitude = longitude;

  while (wrappedLongitude - reference > 180) {
    wrappedLongitude -= 360;
  }

  while (wrappedLongitude - reference < -180) {
    wrappedLongitude += 360;
  }

  return wrappedLongitude;
}

/**
 * À très faible zoom, le monde devient moins haut que le viewport MapLibre.
 * MapLibre recentre alors automatiquement le monde sur l'équateur, même si
 * Leaflet reste centré sur une latitude différente. Le niveau de zoom est bon,
 * mais le fond peut encore glisser de quelques pixels par rapport aux objets.
 *
 * On mesure le centre réellement retenu par MapLibre après `jumpTo`, puis on
 * translate visuellement son canvas pour remettre le centre Leaflet demandé au
 * centre exact du viewport. Les zones transparentes éventuellement révélées en
 * haut ou en bas correspondent simplement à l'extérieur du monde Mercator.
 */
function getMapLibreCenterCorrection(
  map: L.Map,
  requestedCenter: L.LatLng,
  actualCenter: { lng: number; lat: number } | null | undefined,
  leafletZoom: number,
) {
  if (
    !actualCenter ||
    !Number.isFinite(actualCenter.lng) ||
    !Number.isFinite(actualCenter.lat)
  ) {
    return L.point(0, 0);
  }

  const normalizedActualCenter = L.latLng(
    actualCenter.lat,
    getClosestWrappedLongitude(actualCenter.lng, requestedCenter.lng),
  );
  const requestedPoint = map.project(requestedCenter, leafletZoom);
  const actualPoint = map.project(normalizedActualCenter, leafletZoom);
  const correction = actualPoint.subtract(requestedPoint);

  if (Math.abs(correction.x) < 0.01 && Math.abs(correction.y) < 0.01) {
    return L.point(0, 0);
  }

  return correction;
}

export function MapLibreBasemapLayer({
  styleUrl,
  attribution,
  lockedNativeZoom = null,
  fallbackTileUrl,
  fallbackTileMaxZoom = 22,
  fallbackTileMaxNativeZoom,
  renderWorldCopies = true,
  showTextLabels = true,
  singleWorldBounds,
}: MapLibreBasemapLayerProps) {
  const map = useMap();
  const [hasLoadFailure, setHasLoadFailure] = useState(false);

  useEffect(() => {
    // MapLibre annule volontairement les anciennes requêtes de sprites quand
    // le niveau de détail change. Next.js/Turbopack transforme parfois ce
    // simple abandon en Console Error avant même que l'événement MapLibre ne
    // soit traité. Le garde ne filtre que cette signature d'annulation exacte.
    ensureMapLibreAbortConsoleGuard();
  }, []);

  useEffect(() => {
    setHasLoadFailure(false);
  }, [styleUrl]);

  useEffect(() => {
    const attributionControl = map.attributionControl;

    if (!attributionControl || !attribution) {
      return;
    }

    attributionControl.addAttribution(attribution);

    return () => {
      attributionControl.removeAttribution(attribution);
    };
  }, [attribution, map]);

  useEffect(() => {
    if (hasLoadFailure) {
      return;
    }

    let isCancelled = false;
    let mapLibreMap: any = null;
    let mapLibreErrorHandler: ((event: unknown) => void) | null = null;
    let mapLibreLoadTimeoutId: number | null = null;
    let didMapLibreLoad = false;
    let lastContainerWidth = -1;
    let lastContainerHeight = -1;
    let lastInnerWidth = -1;
    let lastInnerHeight = -1;
    let lastVisualScale = -1;
    let lastCenterCorrectionX = Number.NaN;
    let lastCenterCorrectionY = Number.NaN;
    let mapLibreResizePending = false;

    const singleWorldLatLngBounds = singleWorldBounds
      ? singleWorldBounds instanceof L.LatLngBounds
        ? singleWorldBounds
        : L.latLngBounds(singleWorldBounds as L.LatLngExpression[])
      : null;

    const getViewportLayout = () => {
      if (singleWorldLatLngBounds?.isValid()) {
        const frame = getFullWorldScreenFrame(
          map,
          {
            south: singleWorldLatLngBounds.getSouth(),
            west: singleWorldLatLngBounds.getWest(),
            north: singleWorldLatLngBounds.getNorth(),
            east: singleWorldLatLngBounds.getEast(),
          },
        );

        return {
          topLeft: map.containerPointToLayerPoint([frame.left, frame.top]),
          width: frame.width,
          height: frame.height,
          center: singleWorldLatLngBounds.getCenter(),
        };
      }

      const size = map.getSize();

      return {
        topLeft: map.containerPointToLayerPoint([0, 0]),
        width: Math.max(1, size.x),
        height: Math.max(1, size.y),
        center: map.getCenter(),
      };
    };

    let pane = map.getPane(MAPLIBRE_BASEMAP_PANE);

    if (!pane) {
      pane = map.createPane(MAPLIBRE_BASEMAP_PANE);
      pane.style.zIndex = "200";
      pane.style.pointerEvents = "none";
    }

    const container = L.DomUtil.create(
      "div",
      "dromap-maplibre-basemap-layer",
      pane,
    );
    const inner = L.DomUtil.create(
      "div",
      "dromap-maplibre-basemap-inner",
      container,
    );

    container.style.position = "absolute";
    container.style.overflow = "hidden";
    container.style.pointerEvents = "none";
    container.style.background = "transparent";
    container.style.transition = "none";
    container.style.willChange = "transform,width,height";
    container.style.backfaceVisibility = "hidden";
    container.style.transformOrigin = "0 0";
    container.setAttribute("data-dromap-attribution", attribution);

    inner.style.position = "absolute";
    inner.style.left = "0";
    inner.style.top = "0";
    inner.style.transformOrigin = "0 0";
    inner.style.pointerEvents = "none";
    inner.style.transition = "none";
    inner.style.willChange = "transform,width,height";
    inner.style.backfaceVisibility = "hidden";

    /**
     * On ne passe pas par un requestAnimationFrame systématique : la couche
     * visible suit immédiatement les transformations Leaflet. Quand le niveau
     * de détail est verrouillé, le canvas existant est mis à l'échelle pendant
     * le geste, puis MapLibre est recalé une seule fois à la fin du zoom.
     */
    const applyView = (options: ApplyMapLibreViewOptions = {}) => {
      if (!mapLibreMap || isCancelled) {
        return;
      }

      const viewport = getViewportLayout();
      const currentZoom = getFiniteZoom(options?.zoom ?? map.getZoom());
      const { mapLibreZoom, renderedDetailLeafletZoom } =
        getMapLibreRenderZoom(currentZoom, lockedNativeZoom);
      const visualScale = clampScale(
        2 ** (currentZoom - renderedDetailLeafletZoom),
      );
      const innerWidth = Math.max(1, Math.ceil(viewport.width / visualScale));
      const innerHeight = Math.max(1, Math.ceil(viewport.height / visualScale));
      const topLeft = viewport.topLeft;
      const center = options?.center ?? viewport.center;
      const containerWidth = Math.max(1, Math.ceil(viewport.width));
      const containerHeight = Math.max(1, Math.ceil(viewport.height));
      const needsResize =
        containerWidth !== lastContainerWidth ||
        containerHeight !== lastContainerHeight ||
        innerWidth !== lastInnerWidth ||
        innerHeight !== lastInnerHeight ||
        visualScale !== lastVisualScale;

      L.DomUtil.setPosition(container, topLeft);

      if (containerWidth !== lastContainerWidth) {
        container.style.width = `${containerWidth}px`;
        lastContainerWidth = containerWidth;
      }

      if (containerHeight !== lastContainerHeight) {
        container.style.height = `${containerHeight}px`;
        lastContainerHeight = containerHeight;
      }

      if (innerWidth !== lastInnerWidth) {
        inner.style.width = `${innerWidth}px`;
        lastInnerWidth = innerWidth;
      }

      if (innerHeight !== lastInnerHeight) {
        inner.style.height = `${innerHeight}px`;
        lastInnerHeight = innerHeight;
      }

      if (needsResize) {
        mapLibreResizePending = true;
      }

      /**
       * Quand la zone est validée, le niveau de détail MapLibre est figé et le
       * zoom visible est obtenu par mise à l'échelle du canvas. Redimensionner
       * et recalculer MapLibre à chaque micro-pas de molette provoquait un petit
       * décrochage du fond par rapport aux objets Leaflet.
       *
       * Pendant l'animation, on met donc seulement à jour la transformation
       * visuelle. Le resize et la synchronisation vectorielle finale sont faits
       * au zoomend, lorsque Leaflet a atteint sa position définitive.
       */
      if (!options.deferResize && mapLibreResizePending) {
        mapLibreMap.resize();
        mapLibreResizePending = false;
      }

      let centerCorrection = L.point(0, 0);

      if (!options.deferMapLibreSync) {
        mapLibreMap.jumpTo({
          center: [center.lng, center.lat],
          zoom: mapLibreZoom,
          bearing: 0,
          pitch: 0,
        });

        centerCorrection = getMapLibreCenterCorrection(
          map,
          center,
          typeof mapLibreMap.getCenter === "function"
            ? mapLibreMap.getCenter()
            : null,
          currentZoom,
        );

        if (typeof mapLibreMap.triggerRepaint === "function") {
          mapLibreMap.triggerRepaint();
        }
      } else if (
        Number.isFinite(lastCenterCorrectionX) &&
        Number.isFinite(lastCenterCorrectionY)
      ) {
        centerCorrection = L.point(
          lastCenterCorrectionX,
          lastCenterCorrectionY,
        );
      }

      if (
        visualScale !== lastVisualScale ||
        centerCorrection.x !== lastCenterCorrectionX ||
        centerCorrection.y !== lastCenterCorrectionY
      ) {
        inner.style.transform = `translate3d(${centerCorrection.x}px, ${centerCorrection.y}px, 0) scale(${visualScale})`;
        lastVisualScale = visualScale;
        lastCenterCorrectionX = centerCorrection.x;
        lastCenterCorrectionY = centerCorrection.y;
      }
    };

    Promise.all([
      ensureMapLibreGl(),
      resolveDromapMapLibreStyle(styleUrl),
    ])
      .then(([maplibregl, resolvedStyle]) => {
        if (isCancelled) {
          return;
        }

        const viewport = getViewportLayout();
        const currentZoom = getFiniteZoom(map.getZoom());
        const { mapLibreZoom, renderedDetailLeafletZoom } =
          getMapLibreRenderZoom(currentZoom, lockedNativeZoom);
        const visualScale = clampScale(
          2 ** (currentZoom - renderedDetailLeafletZoom),
        );
        const center = viewport.center;
        const innerWidth = Math.max(1, Math.ceil(viewport.width / visualScale));
        const innerHeight = Math.max(1, Math.ceil(viewport.height / visualScale));

        lastContainerWidth = Math.max(1, Math.ceil(viewport.width));
        lastContainerHeight = Math.max(1, Math.ceil(viewport.height));
        lastInnerWidth = innerWidth;
        lastInnerHeight = innerHeight;
        lastVisualScale = visualScale;
        lastCenterCorrectionX = 0;
        lastCenterCorrectionY = 0;

        L.DomUtil.setPosition(container, viewport.topLeft);
        container.style.width = `${lastContainerWidth}px`;
        container.style.height = `${lastContainerHeight}px`;
        inner.style.width = `${innerWidth}px`;
        inner.style.height = `${innerHeight}px`;
        inner.style.transform = `translate3d(0px, 0px, 0) scale(${visualScale})`;

        mapLibreMap = new maplibregl.Map({
          container: inner,
          style: resolvedStyle,
          interactive: false,
          attributionControl: false,
          renderWorldCopies,
          preserveDrawingBuffer: false,
          fadeDuration: 0,
          center: [center.lng, center.lat],
          zoom: mapLibreZoom,
          bearing: 0,
          pitch: 0,
        });

        let didRequestRasterFallback = false;

        mapLibreErrorHandler = (event: unknown) => {
          const error = getMapLibreRuntimeError(event);

          // Lors d'un changement de détail/fond, l'ancien style annule ses
          // requêtes de sprite et de tuiles. Ce n'est pas une panne réseau et
          // cela ne doit ni déclencher l'overlay Next.js ni un fallback raster.
          if (isCancelled || isBenignMapLibreAbortError(event)) {
            return;
          }

          if (
            fallbackTileUrl &&
            shouldUseRasterFallbackForError(event, styleUrl)
          ) {
            if (!didRequestRasterFallback && !isCancelled) {
              didRequestRasterFallback = true;

              if (mapLibreLoadTimeoutId !== null) {
                window.clearTimeout(mapLibreLoadTimeoutId);
                mapLibreLoadTimeoutId = null;
              }

              setHasLoadFailure(true);
            }

            return;
          }

          // La présence de cet écouteur empêche MapLibre de transformer toute
          // erreur de ressource en `console.error`. Les erreurs non couvertes
          // restent visibles comme avertissements de diagnostic.
          console.warn("Ressource du fond vectoriel non disponible.", error);
        };

        mapLibreMap.on("error", mapLibreErrorHandler);

        if (typeof mapLibreMap.setPixelRatio === "function") {
          mapLibreMap.setPixelRatio(window.devicePixelRatio || 1);
        }

        const canvas = mapLibreMap.getCanvas?.() as HTMLCanvasElement | undefined;

        if (canvas) {
          canvas.style.transition = "none";
          canvas.style.willChange = "transform";
          canvas.style.backfaceVisibility = "hidden";
        }

        mapLibreMap.on("load", () => {
          didMapLibreLoad = true;
          applyMapLibreBasemapTextVisibility(mapLibreMap, showTextLabels);

          if (mapLibreLoadTimeoutId !== null) {
            window.clearTimeout(mapLibreLoadTimeoutId);
            mapLibreLoadTimeoutId = null;
          }

          applyView();
        });

        if (fallbackTileUrl) {
          mapLibreLoadTimeoutId = window.setTimeout(() => {
            if (!isCancelled && !didMapLibreLoad) {
              console.warn(
                "Le fond vectoriel n’a pas terminé son chargement, activation du fond raster de secours.",
              );
              setHasLoadFailure(true);
            }
          }, MAPLIBRE_BASEMAP_LOAD_TIMEOUT_MS);
        }

        applyView();
      })
      .catch((error) => {
        if (
          isCancelled ||
          (error instanceof Error &&
            (error.name === "AbortError" ||
              /operation was aborted|request (?:was )?aborted|aborterror|signal is aborted/i.test(
                error.message,
              )))
        ) {
          return;
        }

        console.warn("Fond vectoriel impossible à charger.", error);

        if (fallbackTileUrl) {
          setHasLoadFailure(true);
        }
      });

    const hasLockedDetail =
      typeof lockedNativeZoom === "number" &&
      Number.isFinite(lockedNativeZoom);
    let isLeafletZooming = false;

    const applyTransientZoomView = (event?: LeafletZoomAnimationEvent) => {
      applyView({
        center: event?.center ?? map.getCenter(),
        zoom: event?.zoom ?? map.getZoom(),
        deferResize: hasLockedDetail,
        deferMapLibreSync: hasLockedDetail,
      });
    };

    const handleZoomStart = () => {
      isLeafletZooming = true;
    };

    const handleMove = () => {
      if (isLeafletZooming && hasLockedDetail) {
        applyTransientZoomView();
        return;
      }

      applyView();
    };

    const handleStableViewChange = () => {
      if (isLeafletZooming && hasLockedDetail) {
        applyTransientZoomView();
        return;
      }

      applyView();
    };

    const handleZoomFrame = () => {
      applyTransientZoomView();
    };

    const handleZoomAnimation = (event: LeafletZoomAnimationEvent) => {
      applyTransientZoomView(event);
    };

    const handleZoomEnd = () => {
      isLeafletZooming = false;
      applyView();
    };

    map.on("zoomstart", handleZoomStart);
    map.on("move", handleMove);
    map.on("resize viewreset moveend", handleStableViewChange);
    map.on("zoom", handleZoomFrame);
    map.on("zoomend", handleZoomEnd);
    map.on("zoomanim", handleZoomAnimation as L.LeafletEventHandlerFn);

    return () => {
      isCancelled = true;

      map.off("zoomstart", handleZoomStart);
      map.off("move", handleMove);
      map.off("resize viewreset moveend", handleStableViewChange);
      map.off("zoom", handleZoomFrame);
      map.off("zoomend", handleZoomEnd);
      map.off("zoomanim", handleZoomAnimation as L.LeafletEventHandlerFn);

      if (mapLibreLoadTimeoutId !== null) {
        window.clearTimeout(mapLibreLoadTimeoutId);
      }

      if (mapLibreMap) {
        // Garder l'écouteur pendant remove() : MapLibre annule alors les
        // requêtes encore en vol (sprite/tuiles). Sans écouteur, ces annulations
        // bénignes sont réémises en console.error par MapLibre. La destruction
        // de la carte nettoie ensuite ses listeners.
        mapLibreMap.remove();
      }

      container.remove();
    };
  }, [
    attribution,
    fallbackTileUrl,
    hasLoadFailure,
    lockedNativeZoom,
    map,
    renderWorldCopies,
    showTextLabels,
    singleWorldBounds,
    styleUrl,
  ]);

  if (!hasLoadFailure || !fallbackTileUrl) {
    return null;
  }

  return (
    <TileLayer
      key={`maplibre-fallback-${styleUrl}-${fallbackTileUrl}`}
      url={fallbackTileUrl}
      attribution=""
      maxZoom={fallbackTileMaxZoom}
      maxNativeZoom={fallbackTileMaxNativeZoom}
      crossOrigin="anonymous"
      detectRetina={false}
      updateWhenZooming
      updateWhenIdle={false}
      keepBuffer={6}
      updateInterval={70}
      noWrap={!renderWorldCopies}
      className="dromap-basemap-tile"
    />
  );
}
