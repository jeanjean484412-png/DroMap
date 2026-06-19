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
  dromapBasemapBoundsToLeafletBounds,
  getBasemapViewportBounds,
  getBasemapWorkspaceBounds,
  leafletBoundsToDromapBasemapBounds,
} from "./basemap-viewport-bounds";

const WORKSPACE_FIT_PADDING: [number, number] = [32, 32];
const GEOMAN_CURSOR_REPLAY_EVENT = "dromap:replay-map-pointer";
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

    return L.latLngBounds(maxBounds as L.LatLngBoundsLiteral);
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

function constrainViewToPannableWorld(
  map: L.Map,
  basemapBounds: L.LatLngBounds = DROMAP_WORLD_BOUNDS,
) {
  const zoom = map.getZoom();

  if (!Number.isFinite(zoom)) {
    return false;
  }

  const northWest = map.project(basemapBounds.getNorthWest(), zoom);
  const southEast = map.project(basemapBounds.getSouthEast(), zoom);
  const size = map.getSize();
  const currentCenter = map.project(map.getCenter(), zoom);

  const xConstraint = getWorldAxisConstraint(northWest.x, southEast.x, size.x);
  const yConstraint = getWorldAxisConstraint(northWest.y, southEast.y, size.y);
  const constrainedCenter = L.point(
    clamp(currentCenter.x, xConstraint),
    clamp(currentCenter.y, yConstraint),
  );

  if (
    constrainedCenter.distanceTo(currentCenter) <= VIEW_CONSTRAINT_EPSILON_PX
  ) {
    return false;
  }

  map.setView(map.unproject(constrainedCenter, zoom), zoom, {
    animate: false,
  });

  return true;
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

function constrainViewToWorkspace(map: L.Map, workspaceBounds: L.LatLngBounds) {
  const zoom = map.getZoom();

  if (!Number.isFinite(zoom)) {
    return false;
  }

  const northWest = map.project(workspaceBounds.getNorthWest(), zoom);
  const southEast = map.project(workspaceBounds.getSouthEast(), zoom);
  const size = map.getSize();
  const currentCenter = map.project(map.getCenter(), zoom);

  const xConstraint = getWorkspaceAxisConstraint(
    northWest.x,
    southEast.x,
    size.x,
  );
  const yConstraint = getWorkspaceAxisConstraint(
    northWest.y,
    southEast.y,
    size.y,
  );
  const constrainedCenter = L.point(
    clamp(currentCenter.x, xConstraint),
    clamp(currentCenter.y, yConstraint),
  );

  if (
    constrainedCenter.distanceTo(currentCenter) <= VIEW_CONSTRAINT_EPSILON_PX
  ) {
    return false;
  }

  map.setView(map.unproject(constrainedCenter, zoom), zoom, {
    animate: false,
  });

  return true;
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
  const activeBasemapBounds = useEditorTestBasemapStore(
    (state) => state.activeBasemapBounds,
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

    const targetBounds = toLatLngBounds(mapBoundsFitRequest.bounds);

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
    map.fitBounds(targetBounds, {
      padding: GEOJSON_IMPORT_FIT_PADDING,
      animate: false,
      maxZoom: Math.min(
        14,
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
    const workspaceLatLngBounds = toLatLngBounds(workspaceBounds);
    const rawBasemapConstraintBounds = activeBasemapBounds
      ? dromapBasemapBoundsToLeafletBounds(activeBasemapBounds)
      : DROMAP_WORLD_BOUNDS;
    const basemapConstraintBounds = getBasemapWorkspaceBounds(
      getDromapBasemapConfig(basemapId),
      rawBasemapConstraintBounds,
    );
    const shouldFit = useEditorTestWorkspaceStore
      .getState()
      .consumePendingWorkspaceFit();

    let animationFrameId: number | null = null;
    let isApplyingViewConstraint = false;

    const constrainEditorViewport = () => {
      if (isApplyingViewConstraint || isWorkspaceConstraintSuspended()) {
        return;
      }

      isApplyingViewConstraint = true;

      try {
        constrainViewToWorkspace(map, workspaceLatLngBounds);
        constrainViewToPannableWorld(map, basemapConstraintBounds);
      } finally {
        isApplyingViewConstraint = false;
      }
    };

    const refreshZoomConstraints = () => {
      const lockedBasemapZoom =
        useEditorTestWorkspaceStore.getState().workspaceBasemapZoom;
      const minZoom = getLockedMinZoom(lockedBasemapZoom, map.getZoom());
      const maxZoom = getLockedMaxZoom(lockedBasemapZoom, map.getMaxZoom());
      const safeMaxZoom = Math.max(minZoom, maxZoom);

      map.setMinZoom(minZoom);
      map.setMaxZoom(safeMaxZoom);

      if (map.getZoom() < minZoom) {
        map.setZoom(minZoom, { animate: false });
      }

      if (map.getZoom() > safeMaxZoom) {
        map.setZoom(safeMaxZoom, { animate: false });
      }

      if (!isWorkspaceConstraintSuspended()) {
        constrainEditorViewport();
      }
    };

    const scheduleRefreshZoomConstraints = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        refreshZoomConstraints();
        requestDrawCursorReplay();
      });
    };

    const scheduleWorkspaceConstraint = () => {
      if (isWorkspaceConstraintSuspended()) {
        requestDrawCursorReplay();
        return;
      }

      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        constrainEditorViewport();
        requestDrawCursorReplay();
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
     * maxBounds Leaflet est volontairement retiré en édition : il bloque trop
     * fort aux bords. DroMap applique à la place une contrainte graphique :
     * zone de travail visible + petite marge grise autour du monde.
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

    map.on("zoomend", scheduleRefreshZoomConstraints);
    map.on("resize", scheduleRefreshZoomConstraints);
    map.on("drag", scheduleWorkspaceConstraint);
    map.on("moveend", scheduleWorkspaceConstraint);

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      map.off("zoomend", scheduleRefreshZoomConstraints);
      map.off("resize", scheduleRefreshZoomConstraints);
      map.off("drag", scheduleWorkspaceConstraint);
      map.off("moveend", scheduleWorkspaceConstraint);

      restoreNavigationSnapshot(map, snapshot);
    };
  }, [
    map,
    currentMode,
    workspaceBounds,
    basemapId,
    activeBasemapBounds,
    activeTool,
  ]);

  return null;
}
