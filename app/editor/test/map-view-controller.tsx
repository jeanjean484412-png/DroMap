"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import { getDromapBasemapConfig } from "@/lib/dromap/basemap";
import { toLatLngBounds } from "@/lib/dromap/workspace-bounds";
import { useEditorTestBasemapStore } from "@/stores/editor-test-basemap";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestToolStore } from "@/stores/editor-test-tool";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import {
  DROMAP_WORLD_BOUNDS,
  getBasemapViewportBounds,
  getBasemapWorkspaceBounds,
  leafletBoundsToDromapBasemapBounds,
} from "./basemap-viewport-bounds";

const WORKSPACE_FIT_PADDING: [number, number] = [32, 32];
const GEOMAN_CURSOR_REPLAY_EVENT = "dromap:replay-map-pointer";
const CONTINUOUS_WHEEL_ZOOM_DATASET_KEY = "dromapContinuousWheelZoom";
const CONTINUOUS_WHEEL_ZOOM_END_EVENT =
  "dromap:continuous-wheel-zoom-end";
const TILE_BASEMAP_EXTRA_SHARP_ZOOM = 1.35;
const SOLID_BASEMAP_EXTRA_GRAPHIC_ZOOM = 5;

/**
 * Petite marge de dézoom graphique autorisée en édition.
 * Le niveau de détail du fond reste verrouillé par TileLayer
 * via minNativeZoom/maxNativeZoom dans test-map.tsx.
 */
const EDIT_EXTRA_DEZOOM_LEVELS = 1.25;

/**
 * Marge contrôlée de déplacement autour de la zone de travail.
 */
const WORKSPACE_MIN_VISIBLE_RATIO_WHEN_SMALLER_THAN_VIEWPORT = 0.44;
const WORKSPACE_MIN_VISIBLE_VIEWPORT_RATIO_WHEN_LARGER_THAN_VIEWPORT = 0.46;

/**
 * Marge contrôlée autour du monde réel.
 * Le but est de voir un peu de gris au bord du monde pour centrer une zone de
 * travail proche de la limite, sans pouvoir partir loin dans le vide.
 */
const WORLD_MIN_VISIBLE_RATIO_WHEN_SMALLER_THAN_VIEWPORT = 0.58;
const WORLD_MIN_VISIBLE_VIEWPORT_RATIO_WHEN_LARGER_THAN_VIEWPORT = 0.52;
const MIN_OUTSIDE_VIEWPORT_MARGIN_RATIO_WHEN_DEZOOMED = 0.08;
const VIEW_CONSTRAINT_EPSILON_PX = 0.5;
const BASEMAP_FIT_PADDING: [number, number] = [48, 48];
const GEOJSON_IMPORT_FIT_PADDING: [number, number] = [72, 72];
const BASEMAP_FIT_CONSTRAINT_SUSPEND_MS = 900;
const PANNABLE_WORLD_BOUNDS = L.latLngBounds([-88, -360], [88, 360]);

let workspaceConstraintSuspendedUntil = 0;

function suspendWorkspaceConstraint(milliseconds: number) {
  workspaceConstraintSuspendedUntil = Math.max(
    workspaceConstraintSuspendedUntil,
    Date.now() + milliseconds,
  );
}

function isWorkspaceConstraintSuspended() {
  return Date.now() < workspaceConstraintSuspendedUntil;
}

type HandlerLike = {
  enabled: () => boolean;
  enable: () => void;
  disable: () => void;
};

type NavigationSnapshot = {
  dragging: boolean;
  scrollWheelZoom: boolean;
  doubleClickZoom: boolean;
  boxZoom: boolean;
  keyboard: boolean;
  touchZoom: boolean;
  minZoom: number;
  maxZoom: number;
  maxBounds: L.LatLngBounds | null;
  maxBoundsViscosity: number | undefined;
};

type AxisConstraint = {
  min: number;
  max: number;
};

function readHandlerState(handler: HandlerLike) {
  return handler.enabled();
}

function setHandlerState(handler: HandlerLike, enabled: boolean) {
  if (enabled) {
    handler.enable();
  } else {
    handler.disable();
  }
}

function readCurrentMaxBounds(map: L.Map): L.LatLngBounds | null {
  const maxBounds = map.options.maxBounds;

  if (!maxBounds) {
    return null;
  }

  try {
    if (maxBounds instanceof L.LatLngBounds) {
      return maxBounds;
    }

    return L.latLngBounds(maxBounds as L.LatLngExpression[]);
  } catch {
    return null;
  }
}

function readNavigationSnapshot(map: L.Map): NavigationSnapshot {
  return {
    dragging: readHandlerState(map.dragging),
    scrollWheelZoom: readHandlerState(map.scrollWheelZoom),
    doubleClickZoom: readHandlerState(map.doubleClickZoom),
    boxZoom: readHandlerState(map.boxZoom),
    keyboard: readHandlerState(map.keyboard),
    touchZoom: readHandlerState(map.touchZoom),
    minZoom: map.getMinZoom(),
    maxZoom: map.getMaxZoom(),
    maxBounds: readCurrentMaxBounds(map),
    maxBoundsViscosity: map.options.maxBoundsViscosity,
  };
}

function canSafelyMutateMapBounds(map: L.Map) {
  const internalMap = map as L.Map & {
    _container?: HTMLElement | null;
    _mapPane?: HTMLElement | null;
    _loaded?: boolean;
  };

  return Boolean(
    internalMap._container &&
    internalMap._mapPane &&
    internalMap._loaded !== false,
  );
}

function restoreNavigationSnapshot(map: L.Map, snapshot: NavigationSnapshot) {
  setHandlerState(map.dragging, snapshot.dragging);
  setHandlerState(map.scrollWheelZoom, snapshot.scrollWheelZoom);
  setHandlerState(map.doubleClickZoom, snapshot.doubleClickZoom);
  setHandlerState(map.boxZoom, snapshot.boxZoom);
  setHandlerState(map.keyboard, snapshot.keyboard);
  setHandlerState(map.touchZoom, snapshot.touchZoom);

  map.setMinZoom(snapshot.minZoom);
  map.setMaxZoom(snapshot.maxZoom);
  map.options.maxBoundsViscosity = snapshot.maxBoundsViscosity;

  /**
   * Leaflet peut déclencher un pan interne pendant setMaxBounds(). Pendant les
   * changements rapides de mode/fond, la cleanup React peut passer ici alors
   * que le pane Leaflet n'est plus totalement disponible, ce qui provoque
   * "el is undefined". Dans ce cas, on restaure l'option sans forcer de pan.
   */
  if (!canSafelyMutateMapBounds(map)) {
    map.options.maxBounds = snapshot.maxBounds ?? undefined;
    return;
  }

  try {
    if (snapshot.maxBounds) {
      map.setMaxBounds(snapshot.maxBounds);
    } else {
      map.setMaxBounds(null as unknown as L.LatLngBoundsExpression);
    }
  } catch {
    map.options.maxBounds = snapshot.maxBounds ?? undefined;
  }
}

function enableConstrainedEditNavigation(
  map: L.Map,
  options: { allowDragging: boolean },
) {
  if (options.allowDragging) {
    map.dragging.enable();
  } else {
    map.dragging.disable();
  }

  map.scrollWheelZoom.enable();
  map.doubleClickZoom.disable();
  map.boxZoom.disable();
  map.keyboard.disable();
  map.touchZoom.disable();
}

function getLockedMinZoom(
  lockedBasemapZoom: number | null,
  fallbackZoom: number,
) {
  if (lockedBasemapZoom === null || !Number.isFinite(lockedBasemapZoom)) {
    return fallbackZoom;
  }

  return Math.max(0, lockedBasemapZoom - EDIT_EXTRA_DEZOOM_LEVELS);
}

function getLockedMaxZoom(
  lockedBasemapZoom: number | null,
  fallbackZoom: number,
) {
  if (lockedBasemapZoom === null || !Number.isFinite(lockedBasemapZoom)) {
    return fallbackZoom;
  }

  const basemap = getDromapBasemapConfig(
    useEditorTestBasemapStore.getState().basemapId,
  );
  const lockedNativeZoom = Math.floor(lockedBasemapZoom);

  if (basemap.kind === "tile" || basemap.kind === "maplibre") {
    return Math.min(
      basemap.maxZoom,
      lockedNativeZoom + TILE_BASEMAP_EXTRA_SHARP_ZOOM,
    );
  }

  return Math.max(
    lockedBasemapZoom + 1,
    lockedBasemapZoom + SOLID_BASEMAP_EXTRA_GRAPHIC_ZOOM,
  );
}

function lockBasemapDetailToCurrentZoom(map: L.Map) {
  const zoom = map.getZoom();

  if (!Number.isFinite(zoom)) {
    return;
  }

  useEditorTestWorkspaceStore.getState().setWorkspaceBasemapBaseZoom(zoom);
}

function requestDrawCursorReplay() {
  window.dispatchEvent(new Event(GEOMAN_CURSOR_REPLAY_EVENT));
}

function clamp(value: number, constraint: AxisConstraint) {
  if (constraint.min > constraint.max) {
    return (constraint.min + constraint.max) / 2;
  }

  return Math.min(Math.max(value, constraint.min), constraint.max);
}

function getAxisConstraintWithVisibility(
  boundsStart: number,
  boundsEnd: number,
  viewportSize: number,
  minVisibleBoundsRatioWhenSmallerThanViewport: number,
  minVisibleViewportRatioWhenLargerThanViewport: number,
): AxisConstraint {
  const min = Math.min(boundsStart, boundsEnd);
  const max = Math.max(boundsStart, boundsEnd);
  const boundsSize = max - min;
  const halfViewport = viewportSize / 2;

  if (boundsSize <= viewportSize) {
    const allowedOutsideFromBounds =
      boundsSize * (1 - minVisibleBoundsRatioWhenSmallerThanViewport);
    const allowedOutsideFromViewport =
      viewportSize * MIN_OUTSIDE_VIEWPORT_MARGIN_RATIO_WHEN_DEZOOMED;
    const allowedOutside = Math.max(
      allowedOutsideFromBounds,
      allowedOutsideFromViewport,
    );

    return {
      min: max - halfViewport - allowedOutside,
      max: min + halfViewport + allowedOutside,
    };
  }

  const allowedOutside =
    viewportSize * (1 - minVisibleViewportRatioWhenLargerThanViewport);

  return {
    min: min + halfViewport - allowedOutside,
    max: max - halfViewport + allowedOutside,
  };
}

function getWorkspaceAxisConstraint(
  boundsStart: number,
  boundsEnd: number,
  viewportSize: number,
): AxisConstraint {
  return getAxisConstraintWithVisibility(
    boundsStart,
    boundsEnd,
    viewportSize,
    WORKSPACE_MIN_VISIBLE_RATIO_WHEN_SMALLER_THAN_VIEWPORT,
    WORKSPACE_MIN_VISIBLE_VIEWPORT_RATIO_WHEN_LARGER_THAN_VIEWPORT,
  );
}

function getWorldAxisConstraint(
  boundsStart: number,
  boundsEnd: number,
  viewportSize: number,
): AxisConstraint {
  return getAxisConstraintWithVisibility(
    boundsStart,
    boundsEnd,
    viewportSize,
    WORLD_MIN_VISIBLE_RATIO_WHEN_SMALLER_THAN_VIEWPORT,
    WORLD_MIN_VISIBLE_VIEWPORT_RATIO_WHEN_LARGER_THAN_VIEWPORT,
  );
}

type ViewConstraintOptions = {
  animate?: boolean;
};

function getConstrainedProjectedCenter(
  map: L.Map,
  bounds: L.LatLngBounds,
  currentCenter: L.Point,
  axisConstraintFactory: (
    boundsStart: number,
    boundsEnd: number,
    viewportSize: number,
  ) => AxisConstraint,
) {
  const zoom = map.getZoom();
  const northWest = map.project(bounds.getNorthWest(), zoom);
  const southEast = map.project(bounds.getSouthEast(), zoom);
  const size = map.getSize();
  const xConstraint = axisConstraintFactory(
    northWest.x,
    southEast.x,
    size.x,
  );
  const yConstraint = axisConstraintFactory(
    northWest.y,
    southEast.y,
    size.y,
  );

  return L.point(
    clamp(currentCenter.x, xConstraint),
    clamp(currentCenter.y, yConstraint),
  );
}

function applyConstrainedProjectedCenter(
  map: L.Map,
  currentCenter: L.Point,
  constrainedCenter: L.Point,
  options: ViewConstraintOptions = {},
) {
  const distance = constrainedCenter.distanceTo(currentCenter);

  if (distance <= VIEW_CONSTRAINT_EPSILON_PX) {
    return false;
  }

  const zoom = map.getZoom();
  const targetCenter = map.unproject(constrainedCenter, zoom);
  const viewportSize = map.getSize();
  const maximumAnimatedDistance = Math.max(
    160,
    Math.max(viewportSize.x, viewportSize.y) * 0.42,
  );
  const shouldAnimate =
    options.animate === true && distance <= maximumAnimatedDistance;

  if (shouldAnimate) {
    map.panTo(targetCenter, {
      animate: true,
      duration: 0.18,
      easeLinearity: 0.28,
      noMoveStart: true,
    });
  } else {
    map.setView(targetCenter, zoom, {
      animate: false,
    });
  }

  return true;
}

function constrainViewToPannableWorld(
  map: L.Map,
  basemapBounds: L.LatLngBounds = DROMAP_WORLD_BOUNDS,
  options: ViewConstraintOptions = {},
) {
  const zoom = map.getZoom();

  if (!Number.isFinite(zoom)) {
    return false;
  }

  const currentCenter = map.project(map.getCenter(), zoom);
  const constrainedCenter = getConstrainedProjectedCenter(
    map,
    basemapBounds,
    currentCenter,
    getWorldAxisConstraint,
  );

  return applyConstrainedProjectedCenter(
    map,
    currentCenter,
    constrainedCenter,
    options,
  );
}

function getPreWorkspacePannableBounds(basemapBounds: L.LatLngBounds) {
  const sourceBounds = basemapBounds.isValid()
    ? basemapBounds
    : DROMAP_WORLD_BOUNDS;
  const latSpan = Math.max(
    8,
    Math.abs(sourceBounds.getNorth() - sourceBounds.getSouth()),
  );
  const lngSpan = Math.max(
    12,
    Math.abs(sourceBounds.getEast() - sourceBounds.getWest()),
  );
  const latMargin = Math.max(12, latSpan * 0.85);
  const lngMargin = Math.max(18, lngSpan * 0.85);

  return L.latLngBounds(
    [
      Math.max(
        PANNABLE_WORLD_BOUNDS.getSouth(),
        sourceBounds.getSouth() - latMargin,
      ),
      Math.max(
        PANNABLE_WORLD_BOUNDS.getWest(),
        sourceBounds.getWest() - lngMargin,
      ),
    ],
    [
      Math.min(
        PANNABLE_WORLD_BOUNDS.getNorth(),
        sourceBounds.getNorth() + latMargin,
      ),
      Math.min(
        PANNABLE_WORLD_BOUNDS.getEast(),
        sourceBounds.getEast() + lngMargin,
      ),
    ],
  );
}

/**
 * Applique les contraintes de zone de travail puis de fond en un seul
 * déplacement. L'ancienne logique appelait deux setView() successifs à la fin
 * d'un zoom. Selon la position de la zone, cela produisait un double
 * repositionnement perceptible comme un saut de l'image.
 */
function constrainViewToWorkspaceAndWorld(
  map: L.Map,
  workspaceBounds: L.LatLngBounds,
  basemapBounds: L.LatLngBounds,
  options: ViewConstraintOptions = {},
) {
  const zoom = map.getZoom();

  if (!Number.isFinite(zoom)) {
    return false;
  }

  const currentCenter = map.project(map.getCenter(), zoom);
  const workspaceConstrainedCenter = getConstrainedProjectedCenter(
    map,
    workspaceBounds,
    currentCenter,
    getWorkspaceAxisConstraint,
  );
  const fullyConstrainedCenter = getConstrainedProjectedCenter(
    map,
    basemapBounds,
    workspaceConstrainedCenter,
    getWorldAxisConstraint,
  );

  return applyConstrainedProjectedCenter(
    map,
    currentCenter,
    fullyConstrainedCenter,
    options,
  );
}

export default function MapViewController() {
  const map = useMap();
  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const basemapId = useEditorTestBasemapStore((state) => state.basemapId);
  const basemapFitRequestId = useEditorTestBasemapStore(
    (state) => state.basemapFitRequestId,
  );
  const consumedBasemapFitRequestIdRef = useRef(0);
  const consumedMapBoundsFitRequestIdRef = useRef(0);
  const mapBoundsFitRequest = useEditorTestSelectionStore(
    (state) => state.mapBoundsFitRequest,
  );
  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );
  const activeTool = useEditorTestToolStore((state) => state.activeTool);

  useEffect(() => {
    let isCancelled = false;
    const basemap = getDromapBasemapConfig(basemapId);
    const shouldFit =
      basemapFitRequestId > 0 &&
      consumedBasemapFitRequestIdRef.current !== basemapFitRequestId;

    if (shouldFit) {
      consumedBasemapFitRequestIdRef.current = basemapFitRequestId;
    }

    getBasemapViewportBounds(basemap).then((bounds) => {
      if (isCancelled || !bounds.isValid()) {
        return;
      }

      useEditorTestBasemapStore
        .getState()
        .setActiveBasemapBounds(leafletBoundsToDromapBasemapBounds(bounds));

      const selectableBasemapBounds = getBasemapWorkspaceBounds(
        basemap,
        bounds,
      );
      const preWorkspacePannableBounds = getPreWorkspacePannableBounds(
        selectableBasemapBounds,
      );

      if (currentMode !== "edit") {
        map.options.maxBoundsViscosity = 0.35;
        map.setMaxBounds(preWorkspacePannableBounds);
      }

      if (!shouldFit) {
        return;
      }

      suspendWorkspaceConstraint(BASEMAP_FIT_CONSTRAINT_SUSPEND_MS);
      map.setMinZoom(0);
      map.setMaxZoom(
        basemap.kind === "tile" || basemap.kind === "maplibre"
          ? basemap.maxZoom
          : 22,
      );
      map.fitBounds(bounds, {
        padding: BASEMAP_FIT_PADDING,
        animate: false,
      });
      constrainViewToPannableWorld(map, preWorkspacePannableBounds);
      lockBasemapDetailToCurrentZoom(map);
      requestDrawCursorReplay();
    });

    return () => {
      isCancelled = true;
    };
  }, [map, basemapId, basemapFitRequestId, currentMode]);

  useEffect(() => {
    if (!mapBoundsFitRequest) {
      return;
    }

    if (
      consumedMapBoundsFitRequestIdRef.current === mapBoundsFitRequest.requestId
    ) {
      return;
    }

    consumedMapBoundsFitRequestIdRef.current = mapBoundsFitRequest.requestId;

    const targetBounds = L.latLngBounds(
      toLatLngBounds(mapBoundsFitRequest.bounds),
    );

    if (!targetBounds.isValid()) {
      return;
    }

    const basemap = getDromapBasemapConfig(basemapId);

    suspendWorkspaceConstraint(BASEMAP_FIT_CONSTRAINT_SUSPEND_MS);
    map.setMinZoom(0);
    map.setMaxZoom(
      basemap.kind === "tile" || basemap.kind === "maplibre"
        ? basemap.maxZoom
        : 22,
    );
    const requestedMaxZoom = mapBoundsFitRequest.maxZoom ?? 14;
    const shouldAnimate = mapBoundsFitRequest.animate === true;

    map.fitBounds(targetBounds, {
      padding: GEOJSON_IMPORT_FIT_PADDING,
      animate: shouldAnimate,
      duration: shouldAnimate ? 0.45 : undefined,
      maxZoom: Math.min(
        requestedMaxZoom,
        basemap.kind === "tile" || basemap.kind === "maplibre"
          ? basemap.maxZoom
          : 22,
      ),
    });
    lockBasemapDetailToCurrentZoom(map);
    requestDrawCursorReplay();
  }, [map, mapBoundsFitRequest, basemapId]);

  useEffect(() => {
    if (currentMode !== "edit" || !workspaceBounds) {
      return;
    }

    const snapshot = readNavigationSnapshot(map);
    const workspaceLatLngBounds = L.latLngBounds(
      toLatLngBounds(workspaceBounds),
    );
    /**
     * Une fois la zone validée, la navigation appartient à la zone de travail,
     * pas au fond actif. Utiliser ici les limites géométriques du nouveau fond
     * pays pouvait déplacer la vue au changement de fond. On conserve donc la
     * même contrainte monde (avec l'extension antiméridien éventuelle) et la
     * zone de travail reste l'unique référence locale.
     */
    const basemapConstraintBounds = getBasemapWorkspaceBounds(
      getDromapBasemapConfig(basemapId),
      DROMAP_WORLD_BOUNDS,
    );
    const shouldFit = useEditorTestWorkspaceStore
      .getState()
      .consumePendingWorkspaceFit();

    let animationFrameId: number | null = null;
    let isApplyingViewConstraint = false;
    let smoothZoomConstraintUntil = 0;

    const constrainEditorViewport = (options: ViewConstraintOptions = {}) => {
      if (isApplyingViewConstraint || isWorkspaceConstraintSuspended()) {
        return;
      }

      isApplyingViewConstraint = true;

      try {
        constrainViewToWorkspaceAndWorld(
          map,
          workspaceLatLngBounds,
          basemapConstraintBounds,
          options,
        );
      } finally {
        isApplyingViewConstraint = false;
      }
    };

    const refreshZoomConstraints = (
      options: ViewConstraintOptions = {},
    ) => {
      const lockedBasemapZoom =
        useEditorTestWorkspaceStore.getState().workspaceBasemapZoom;
      const currentZoom = map.getZoom();
      const lockedMinZoom = getLockedMinZoom(lockedBasemapZoom, currentZoom);
      const lockedMaxZoom = getLockedMaxZoom(
        lockedBasemapZoom,
        map.getMaxZoom(),
      );

      /**
       * « Sélectionner le monde » crée seulement les mêmes bornes qu’un tracé
       * manuel autour du monde. Après validation, aucun mode de zoom spécial
       * n’est appliqué : la zone, le masque, le fond et les objets suivent le
       * zoom Leaflet ordinaire de l’éditeur.
       */
      const safeMinZoom = Math.min(lockedMinZoom, currentZoom);
      const safeMaxZoom = Math.max(safeMinZoom, lockedMaxZoom, currentZoom);

      map.setMinZoom(safeMinZoom);
      map.setMaxZoom(safeMaxZoom);

      if (!isWorkspaceConstraintSuspended()) {
        constrainEditorViewport(options);
      }
    };

    const scheduleRefreshZoomConstraints = (
      options: ViewConstraintOptions = {},
    ) => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        refreshZoomConstraints(options);
        requestDrawCursorReplay();
      });
    };

    const scheduleWorkspaceConstraint = (
      options: ViewConstraintOptions = {},
    ) => {
      if (isWorkspaceConstraintSuspended()) {
        requestDrawCursorReplay();
        return;
      }

      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        constrainEditorViewport(options);
        requestDrawCursorReplay();
      });
    };

    const isContinuousWheelZoomActive = () =>
      map.getContainer().dataset[CONTINUOUS_WHEEL_ZOOM_DATASET_KEY] ===
      "true";

    const finalizeContinuousWheelZoom = () => {
      smoothZoomConstraintUntil = window.performance.now() + 260;
      scheduleRefreshZoomConstraints({ animate: true });
    };

    const handleZoomEnd = () => {
      /**
       * Un trackpad envoie de nombreux micro-zooms successifs. Recontraindre la
       * vue à chaque zoomend produirait un petit recentrage répété et donc une
       * sensation de vibration. Pendant le geste continu, on laisse Leaflet
       * suivre le trackpad puis on applique une seule contrainte à la fin.
       */
      if (isContinuousWheelZoomActive()) {
        requestDrawCursorReplay();
        return;
      }

      /**
       * Leaflet termine d'abord son animation de zoom, puis DroMap recale si
       * nécessaire la vue pour garder suffisamment de zone visible. Ce petit
       * recalage est maintenant animé au lieu d'être appliqué par un setView
       * instantané, ce qui évite l'impression de saut.
       */
      smoothZoomConstraintUntil = window.performance.now() + 260;
      scheduleRefreshZoomConstraints({ animate: true });
    };

    const handleResize = () => {
      scheduleRefreshZoomConstraints();
    };

    const handleDrag = () => {
      scheduleWorkspaceConstraint();
    };

    const handleMoveEnd = () => {
      if (isContinuousWheelZoomActive()) {
        requestDrawCursorReplay();
        return;
      }

      scheduleWorkspaceConstraint({
        animate: window.performance.now() < smoothZoomConstraintUntil,
      });
    };

    if (shouldFit) {
      map.fitBounds(workspaceLatLngBounds, {
        padding: WORKSPACE_FIT_PADDING,
        animate: false,
      });

      // Comportement rétabli : la base de détail est celle du fond après le
      // cadrage de la zone validée. Le curseur de preview part donc du rendu
      // final de la zone de travail, pas du zoom vu avant fitBounds.
      lockBasemapDetailToCurrentZoom(map);
    } else if (
      useEditorTestWorkspaceStore.getState().workspaceBasemapZoom === null
    ) {
      lockBasemapDetailToCurrentZoom(map);
    }

    /**
     * Comme pour toute zone tracée manuellement, les contraintes sont gérées
     * par DroMap plutôt que par maxBounds Leaflet.
     */
    map.options.maxBoundsViscosity = 0;
    map.setMaxBounds(null as unknown as L.LatLngBoundsExpression);

    refreshZoomConstraints();
    enableConstrainedEditNavigation(map, {
      allowDragging:
        activeTool !== "freehand" &&
        activeTool !== "freehand-zone" &&
        activeTool !== "trace-line",
    });

    const mapContainer = map.getContainer();

    map.on("zoomend", handleZoomEnd);
    map.on("resize", handleResize);
    map.on("drag", handleDrag);
    map.on("moveend", handleMoveEnd);
    mapContainer.addEventListener(
      CONTINUOUS_WHEEL_ZOOM_END_EVENT,
      finalizeContinuousWheelZoom,
    );

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      map.off("zoomend", handleZoomEnd);
      map.off("resize", handleResize);
      map.off("drag", handleDrag);
      map.off("moveend", handleMoveEnd);
      mapContainer.removeEventListener(
        CONTINUOUS_WHEEL_ZOOM_END_EVENT,
        finalizeContinuousWheelZoom,
      );

      restoreNavigationSnapshot(map, snapshot);
    };
  }, [
    map,
    currentMode,
    workspaceBounds,
    basemapId,
    activeTool,
  ]);

  return null;
}
