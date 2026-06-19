"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import { ensureMapLibreGl } from "./openfreemap-maplibre";

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
};

type LeafletZoomAnimationEvent = {
  center?: L.LatLng;
  zoom?: number;
};

const MAPLIBRE_BASEMAP_PANE = "dromapMapLibreBasemapPane";
const MAPLIBRE_LEAFLET_ZOOM_OFFSET = -1;
const MIN_MAPLIBRE_ZOOM = 0;
const MAX_LOCK_SCALE = 8;
const MIN_LOCK_SCALE = 1 / 8;

function getSafeZoom(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function getDetailZoom(currentLeafletZoom: number, lockedNativeZoom?: number | null) {
  if (typeof lockedNativeZoom === "number" && Number.isFinite(lockedNativeZoom)) {
    return getSafeZoom(lockedNativeZoom);
  }

  return getSafeZoom(currentLeafletZoom);
}

function getMapLibreZoomFromLeafletZoom(leafletZoom: number) {
  return Math.max(
    MIN_MAPLIBRE_ZOOM,
    getSafeZoom(leafletZoom) + MAPLIBRE_LEAFLET_ZOOM_OFFSET,
  );
}

function clampScale(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  return Math.min(MAX_LOCK_SCALE, Math.max(MIN_LOCK_SCALE, value));
}

export function MapLibreBasemapLayer({
  styleUrl,
  attribution,
  lockedNativeZoom = null,
}: MapLibreBasemapLayerProps) {
  const map = useMap();

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
    let isCancelled = false;
    let mapLibreMap: any = null;
    let lastContainerWidth = -1;
    let lastContainerHeight = -1;
    let lastInnerWidth = -1;
    let lastInnerHeight = -1;
    let lastVisualScale = -1;

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
     * Contrairement au premier essai, on ne passe plus par un requestAnimationFrame
     * systématique. Le fond MapLibre était donc toujours mis à jour avec une image
     * de retard par rapport aux SVG/DOM DroMap gérés directement par Leaflet.
     *
     * Ici, l'ancienne image du fond est transformée immédiatement pendant le zoom,
     * puis MapLibre reçoit aussi le centre/zoom cible sans animation. Le rendu
     * vectoriel peut prendre quelques millisecondes, mais la couche visible suit la
     * zone de travail et les objets au même moment.
     */
    const applyView = (options?: { center?: L.LatLng; zoom?: number }) => {
      if (!mapLibreMap || isCancelled) {
        return;
      }

      const size = map.getSize();
      const currentZoom = getSafeZoom(options?.zoom ?? map.getZoom());
      const detailLeafletZoom = getDetailZoom(currentZoom, lockedNativeZoom);
      const visualScale = clampScale(2 ** (currentZoom - detailLeafletZoom));
      const innerWidth = Math.max(1, Math.ceil(size.x / visualScale));
      const innerHeight = Math.max(1, Math.ceil(size.y / visualScale));
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      const center = options?.center ?? map.getCenter();
      const containerWidth = Math.max(1, size.x);
      const containerHeight = Math.max(1, size.y);
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

      if (visualScale !== lastVisualScale) {
        inner.style.transform = `translate3d(0, 0, 0) scale(${visualScale})`;
        lastVisualScale = visualScale;
      }

      if (needsResize) {
        mapLibreMap.resize();
      }

      mapLibreMap.jumpTo({
        center: [center.lng, center.lat],
        zoom: getMapLibreZoomFromLeafletZoom(detailLeafletZoom),
        bearing: 0,
        pitch: 0,
      });

      if (typeof mapLibreMap.triggerRepaint === "function") {
        mapLibreMap.triggerRepaint();
      }
    };

    ensureMapLibreGl()
      .then((maplibregl) => {
        if (isCancelled) {
          return;
        }

        const size = map.getSize();
        const currentZoom = getSafeZoom(map.getZoom());
        const detailLeafletZoom = getDetailZoom(currentZoom, lockedNativeZoom);
        const visualScale = clampScale(2 ** (currentZoom - detailLeafletZoom));
        const center = map.getCenter();
        const innerWidth = Math.max(1, Math.ceil(size.x / visualScale));
        const innerHeight = Math.max(1, Math.ceil(size.y / visualScale));

        lastContainerWidth = Math.max(1, size.x);
        lastContainerHeight = Math.max(1, size.y);
        lastInnerWidth = innerWidth;
        lastInnerHeight = innerHeight;
        lastVisualScale = visualScale;

        container.style.width = `${lastContainerWidth}px`;
        container.style.height = `${lastContainerHeight}px`;
        inner.style.width = `${innerWidth}px`;
        inner.style.height = `${innerHeight}px`;
        inner.style.transform = `translate3d(0, 0, 0) scale(${visualScale})`;

        mapLibreMap = new maplibregl.Map({
          container: inner,
          style: styleUrl,
          interactive: false,
          attributionControl: false,
          renderWorldCopies: true,
          preserveDrawingBuffer: false,
          fadeDuration: 0,
          center: [center.lng, center.lat],
          zoom: getMapLibreZoomFromLeafletZoom(detailLeafletZoom),
          bearing: 0,
          pitch: 0,
        });

        if (typeof mapLibreMap.setPixelRatio === "function") {
          mapLibreMap.setPixelRatio(window.devicePixelRatio || 1);
        }

        const canvas = mapLibreMap.getCanvas?.() as HTMLCanvasElement | undefined;

        if (canvas) {
          canvas.style.transition = "none";
          canvas.style.willChange = "transform";
          canvas.style.backfaceVisibility = "hidden";
        }

        mapLibreMap.on("load", () => applyView());
        applyView();
      })
      .catch((error) => {
        console.warn("Fond OpenFreeMap impossible à charger.", error);
      });

    const handleImmediateViewChange = () => {
      applyView();
    };

    const handleZoomAnimation = (event: LeafletZoomAnimationEvent) => {
      applyView({
        center: event.center ?? map.getCenter(),
        zoom: event.zoom ?? map.getZoom(),
      });
    };

    map.on("move zoom resize viewreset moveend zoomend", handleImmediateViewChange);
    map.on("zoomanim", handleZoomAnimation as L.LeafletEventHandlerFn);

    return () => {
      isCancelled = true;

      map.off("move zoom resize viewreset moveend zoomend", handleImmediateViewChange);
      map.off("zoomanim", handleZoomAnimation as L.LeafletEventHandlerFn);

      if (mapLibreMap) {
        mapLibreMap.remove();
      }

      container.remove();
    };
  }, [attribution, lockedNativeZoom, map, styleUrl]);

  return null;
}
