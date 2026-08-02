"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import type { DroMapFeature } from "@/lib/dromap/feature";
import {
  isBoundaryFillZoneFeature,
  isFeatureGeometryLocked,
  isFreehandLineFeature,
  isTracedLineFeature,
  isFeatureLocked,
  isFreehandZoneFeature,
  isQuickShapeZoneFeature,
  layerToDroMapFeature,
} from "@/lib/dromap/feature";
import { deactivateGeomanModes } from "@/lib/dromap/geoman-toolbar";
import { createQuickShapeFeatureFromPlacement } from "./quick-shape";
import { getLayerFeatureId as getStoredLayerFeatureId } from "@/lib/dromap/layer-id";
import {
  applyDrawingPresetToFeature,
  useEditorTestDrawingOptionsStore,
} from "@/stores/editor-test-drawing-options";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import {
  isFeatureEffectivelyLocked,
  useEditorTestLayersStore,
} from "@/stores/editor-test-layers";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import type { EditorTestActiveTool } from "@/stores/editor-test-tool";
import { useEditorTestToolStore } from "@/stores/editor-test-tool";

const DROMAP_SNAP_DISTANCE = 5;
const DRAG_CLICK_SUPPRESSION_DISTANCE = 5;
const DRAG_CLICK_SUPPRESSION_DELAY_MS = 250;
const SHAPE_PLACEMENT_CLICK_MAX_DISTANCE = 5;
const SHAPE_PLACEMENT_CLICK_MAX_DURATION_MS = 650;
const GEOMAN_CURSOR_REPLAY_EVENT = "dromap:replay-map-pointer";

type GeomanDrawShape = "Marker" | "Line" | "Polygon";

type GeomanDrawApi = {
  enableDraw: (shape: GeomanDrawShape, options?: unknown) => void;
};

type DroMapEditableLayer = L.Layer & {
  dromapFeatureId?: string;
  dromapHitboxOwnerId?: string;
  dromapSuppressNextClick?: boolean;
  pm?: {
    enable?: (options?: unknown) => void;
    disable?: () => void;
    enabled?: () => boolean;
  };
};

type LastMousePosition = {
  clientX: number;
  clientY: number;
  screenX: number;
  screenY: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
};

type ShapePlacementCandidate = {
  pointerId: number;
  clientX: number;
  clientY: number;
  timeStamp: number;
};

function replayLastMousePositionOnMap(
  map: L.Map,
  lastMousePosition: LastMousePosition | null,
) {
  if (!lastMousePosition || typeof document === "undefined") {
    return;
  }

  const container = map.getContainer();

  const syntheticEvent = new MouseEvent("mousemove", {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: lastMousePosition.clientX,
    clientY: lastMousePosition.clientY,
    screenX: lastMousePosition.screenX,
    screenY: lastMousePosition.screenY,
    ctrlKey: lastMousePosition.ctrlKey,
    shiftKey: lastMousePosition.shiftKey,
    altKey: lastMousePosition.altKey,
    metaKey: lastMousePosition.metaKey,
  });

  const elementUnderPointer = document.elementFromPoint(
    lastMousePosition.clientX,
    lastMousePosition.clientY,
  );

  const target =
    elementUnderPointer && container.contains(elementUnderPointer)
      ? elementUnderPointer
      : container;

  target.dispatchEvent(syntheticEvent);

  /**
   * Geoman suit normalement le mousemove Leaflet. Après un pan/focus
   * programmatique, le curseur fantôme de dessin peut rester au centre
   * jusqu'au prochain vrai mouvement de souris. On réinjecte donc aussi
   * l'évènement au niveau Leaflet pour recaler immédiatement la preview.
   */
  try {
    map.fire("mousemove", {
      latlng: map.mouseEventToLatLng(syntheticEvent),
      layerPoint: map.mouseEventToLayerPoint(syntheticEvent),
      containerPoint: map.mouseEventToContainerPoint(syntheticEvent),
      originalEvent: syntheticEvent,
    } as L.LeafletMouseEvent);
  } catch {
    // Sécurité : un event synthétique ne doit jamais casser l'éditeur.
  }
}

function getShapeForTool(tool: EditorTestActiveTool): GeomanDrawShape | null {
  /**
   * Les marqueurs sont poses manuellement par clic sur la carte.
   * On evite ainsi le curseur fantome Geoman qui apparait brièvement
   * au centre de la carte quand le mode Marker est relance.
   */
  if (tool === "line") return "Line";
  if (tool === "zone") return "Polygon";

  return null;
}

function getShapeForLayer(
  layer: L.Layer,
): "Marker" | "Line" | "Polygon" | null {
  if (layer instanceof L.Marker) {
    return "Marker";
  }

  if (layer instanceof L.Polygon) {
    return "Polygon";
  }

  if (layer instanceof L.Polyline) {
    return "Line";
  }

  return null;
}

function getDashArray(
  dashStyle: "solid" | "dashed" | "dotted",
  weight: number,
) {
  if (dashStyle === "dashed") {
    return `${weight * 3} ${weight * 2}`;
  }

  if (dashStyle === "dotted") {
    return `0.001 ${weight * 2.2}`;
  }

  return undefined;
}

function createMarkerFeature(latLng: L.LatLng): DroMapFeature {
  const feature: DroMapFeature = {
    type: "Feature",
    id: crypto.randomUUID(),
    geometry: {
      type: "Point",
      coordinates: [latLng.lng, latLng.lat],
    },
    properties: {
      type: "marker",
      label: "Marqueur",
      style: {
        color: "#e63946",
        opacity: 1,
        markerSize: 22,
      },
      symbol: {
        type: "builtin",
        id: "circle",
      },
      meta: { version: 1 },
    },
  };

  return applyDrawingPresetToFeature(feature);
}

function getLayerFeatureId(layer: L.Layer): string | undefined {
  return getStoredLayerFeatureId(layer);
}

function getLayerHitboxOwnerId(layer: L.Layer): string | undefined {
  return (layer as DroMapEditableLayer).dromapHitboxOwnerId;
}

function getEditableFeatureId(layer: L.Layer): string | undefined {
  return getLayerFeatureId(layer) ?? getLayerHitboxOwnerId(layer);
}

function isHitboxLayer(layer: L.Layer) {
  return Boolean(getLayerHitboxOwnerId(layer));
}

function isDroMapEditableLayer(layer: L.Layer): layer is DroMapEditableLayer {
  const candidate = layer as DroMapEditableLayer;

  return Boolean(getLayerFeatureId(layer) && candidate.pm);
}

function isDroMapDraggableLayer(layer: L.Layer): layer is DroMapEditableLayer {
  return Boolean(getEditableFeatureId(layer));
}

function getDroMapEditableLayer(layer: L.Layer): DroMapEditableLayer {
  return layer as DroMapEditableLayer;
}

function disableLayerEdit(layer: L.Layer) {
  if (!isDroMapEditableLayer(layer)) {
    return;
  }

  if (layer.pm?.enabled?.()) {
    layer.pm.disable?.();
  }
}

function disableAllLayerEdit(map: L.Map) {
  map.eachLayer((layer) => {
    disableLayerEdit(layer);
  });
}

function getFeatureForLayer(layer: L.Layer) {
  const featureId = getEditableFeatureId(layer);

  if (!featureId) {
    return null;
  }

  return (
    useEditorTestFeaturesStore
      .getState()
      .features.find((feature) => feature.id === featureId) ?? null
  );
}

function enableLayerEdit(layer: L.Layer) {
  if (!isDroMapEditableLayer(layer)) {
    return;
  }

  /**
   * Marker, texte et dessin libre :
   * pas de mode edit Geoman.
   * - les marqueurs/textes évitent les accrochages parasites ;
   * - les dessins libres évitent l'affichage de centaines de poignées.
   * Le déplacement du corps reste géré par notre drag manuel.
   */
  const feature = getFeatureForLayer(layer);

  if (isFeatureEffectivelyLocked(feature, useEditorTestLayersStore.getState().layers)) {
    disableLayerEdit(layer);
    return;
  }

  if (
    layer instanceof L.Marker ||
    (feature && isFreehandLineFeature(feature)) ||
    (feature && isTracedLineFeature(feature)) ||
    (feature && isFreehandZoneFeature(feature)) ||
    (feature && isQuickShapeZoneFeature(feature)) ||
    (feature && isFeatureGeometryLocked(feature)) ||
    (feature && isBoundaryFillZoneFeature(feature))
  ) {
    disableLayerEdit(layer);
    return;
  }

  /**
   * Ligne classique / zone :
   * Geoman garde les poignées de modification.
   * Le déplacement du corps de l'objet est géré manuellement plus bas.
   */
  layer.pm?.enable?.({
    snappable: true,
    snapDistance: DROMAP_SNAP_DISTANCE,
    allowSelfIntersection: false,
  });
}

function enableAllLayerEdit(map: L.Map) {
  map.eachLayer((layer) => {
    enableLayerEdit(layer);
  });
}

function enableDrawForCurrentTool(map: L.Map, tool: EditorTestActiveTool) {
  const shape = getShapeForTool(tool);

  if (!shape) {
    return;
  }

  const drawingOptions = useEditorTestDrawingOptionsStore.getState();
  const geomanDraw = map.pm as unknown as GeomanDrawApi;

  if (shape === "Line") {
    const style = drawingOptions.lineStyle;

    geomanDraw.enableDraw("Line", {
      snappable: true,
      snapDistance: DROMAP_SNAP_DISTANCE,
      cursorMarker: false,
      markerStyle: {
        opacity: 0,
        fillOpacity: 0,
      },
      templineStyle: {
        opacity: 0,
        fillOpacity: 0,
      },
      hintlineStyle: {
        opacity: 0,
        fillOpacity: 0,
      },
      pathOptions: {
        color: style.color,
        opacity: style.opacity,
        weight: style.weight,
        dashArray: getDashArray(style.dashStyle, style.weight),
        lineCap: "round",
        lineJoin: "round",
      },
    });
    return;
  }

  if (shape === "Polygon") {
    const style = drawingOptions.zoneStyle;

    geomanDraw.enableDraw("Polygon", {
      snappable: true,
      snapDistance: DROMAP_SNAP_DISTANCE,
      cursorMarker: false,
      markerStyle: {
        opacity: 0,
        fillOpacity: 0,
      },
      templineStyle: {
        opacity: 0,
        fillOpacity: 0,
      },
      hintlineStyle: {
        opacity: 0,
        fillOpacity: 0,
      },
      pathOptions: {
        color: style.color,
        opacity: style.zoneStrokeEnabled ? style.opacity : 0,
        weight: style.zoneStrokeEnabled ? style.weight : 0,
        stroke: style.zoneStrokeEnabled,
        fill: true,
        fillColor: style.fillColor,
        fillOpacity: style.zoneFillEnabled ? style.fillOpacity : 0,
        dashArray: getDashArray(style.dashStyle, style.weight),
        lineCap: "round",
        lineJoin: "round",
      },
    });
  }
}

function translateLatLngs(
  value: unknown,
  latDelta: number,
  lngDelta: number,
): unknown {
  if (value instanceof L.LatLng) {
    return L.latLng(value.lat + latDelta, value.lng + lngDelta);
  }

  if (Array.isArray(value)) {
    return value.map((item) => translateLatLngs(item, latDelta, lngDelta));
  }

  return value;
}

function translateLayer(layer: L.Layer, latDelta: number, lngDelta: number) {
  if (layer instanceof L.Marker) {
    const currentLatLng = layer.getLatLng();

    layer.setLatLng(
      L.latLng(currentLatLng.lat + latDelta, currentLatLng.lng + lngDelta),
    );

    return;
  }

  if (layer instanceof L.Polygon || layer instanceof L.Polyline) {
    const currentLatLngs = layer.getLatLngs();

    layer.setLatLngs(
      translateLatLngs(
        currentLatLngs,
        latDelta,
        lngDelta,
      ) as L.LatLngExpression[],
    );
  }
}

function syncLayerGeometryToStore(layer: L.Layer) {
  const featureId = getEditableFeatureId(layer);
  const shape = getShapeForLayer(layer);

  if (!featureId || !shape) {
    return;
  }

  const store = useEditorTestFeaturesStore.getState();

  const existingFeature = store.features.find(
    (feature) => feature.id === featureId,
  );

  if (
    !existingFeature ||
    isFeatureEffectivelyLocked(existingFeature, useEditorTestLayersStore.getState().layers) ||
    isFeatureGeometryLocked(existingFeature) ||
    isBoundaryFillZoneFeature(existingFeature)
  ) {
    return;
  }

  if (isHitboxLayer(layer)) {
    const geometryLayer = layer as L.Layer & {
      toGeoJSON?: () => unknown;
    };
    const raw = geometryLayer.toGeoJSON?.() as {
      type?: string;
      geometry?: DroMapFeature["geometry"];
    };

    if (raw?.type !== "Feature" || raw.geometry?.type !== "LineString") {
      return;
    }

    store.updateFeature(featureId, {
      ...existingFeature,
      geometry: raw.geometry,
      properties: {
        ...existingFeature.properties,
        style: { ...existingFeature.properties.style },
        meta: { version: 1 },
      },
    });

    return;
  }

  const nextFeature = layerToDroMapFeature(layer, shape, existingFeature);

  if (!nextFeature) {
    return;
  }

  store.updateFeature(featureId, nextFeature);
}

function suppressNextLayerClick(layer: L.Layer) {
  const dromapLayer = getDroMapEditableLayer(layer);

  dromapLayer.dromapSuppressNextClick = true;

  window.setTimeout(() => {
    dromapLayer.dromapSuppressNextClick = false;
  }, DRAG_CLICK_SUPPRESSION_DELAY_MS);
}

function toggleLayerSelection(layer: L.Layer) {
  const featureId = getEditableFeatureId(layer);

  if (!featureId) {
    return;
  }

  const selectionStore = useEditorTestSelectionStore.getState();

  if (selectionStore.selectedFeatureId === featureId) {
    selectionStore.clearSelectedFeatureId();
    return;
  }

  selectionStore.setSelectedFeatureId(featureId);
}

function bindManualBodyDrag(map: L.Map, layer: L.Layer): () => void {
  if (!isDroMapDraggableLayer(layer)) {
    return () => {};
  }

  let isDragging = false;
  let previousLatLng: L.LatLng | null = null;
  let startPoint: L.Point | null = null;
  let hasMovedEnough = false;
  let hasCommittedHistory = false;
  let wasMapDraggingEnabled = false;

  const container = map.getContainer();

  const cleanupDocumentListeners = () => {
    document.removeEventListener("mousemove", handleDocumentMouseMove, true);
    document.removeEventListener("mouseup", handleDocumentMouseUp, true);
  };

  const stopDragging = () => {
    if (!isDragging) {
      return;
    }

    const shouldTreatAsDrag = hasMovedEnough;

    isDragging = false;

    if (shouldTreatAsDrag) {
      suppressNextLayerClick(layer);
      syncLayerGeometryToStore(layer);
    } else {
      /**
       * Clic court en mode Modifier :
       * sélection / désélection de l'objet.
       */
      suppressNextLayerClick(layer);
      toggleLayerSelection(layer);
    }

    previousLatLng = null;
    startPoint = null;
    hasMovedEnough = false;
    hasCommittedHistory = false;

    container.style.cursor = "default";

    if (wasMapDraggingEnabled) {
      map.dragging.enable();
    }

    cleanupDocumentListeners();
  };

  const handleDocumentMouseMove = (event: MouseEvent) => {
    if (!isDragging || !previousLatLng || !startPoint) {
      return;
    }

    const currentPoint = map.mouseEventToContainerPoint(event);

    if (
      !hasMovedEnough &&
      currentPoint.distanceTo(startPoint) < DRAG_CLICK_SUPPRESSION_DISTANCE
    ) {
      return;
    }

    const currentLatLng = map.mouseEventToLatLng(event);

    if (!hasMovedEnough) {
      hasMovedEnough = true;

      if (!hasCommittedHistory) {
        useEditorTestFeaturesStore.getState().commitFeaturesHistory();
        hasCommittedHistory = true;
      }
    }

    const latDelta = currentLatLng.lat - previousLatLng.lat;
    const lngDelta = currentLatLng.lng - previousLatLng.lng;

    previousLatLng = currentLatLng;

    translateLayer(layer, latDelta, lngDelta);
    syncLayerGeometryToStore(layer);
  };

  const handleDocumentMouseUp = () => {
    stopDragging();
  };

  const handleMouseDown = (event: L.LeafletMouseEvent) => {
    const latestMode = useEditorTestModeStore.getState().currentMode;
    const latestTool = useEditorTestToolStore.getState().activeTool;
    const featureId = getEditableFeatureId(layer);
    const selectedFeatureId =
      useEditorTestSelectionStore.getState().selectedFeatureId;

    const feature = getFeatureForLayer(layer);
    const canDragLayer =
      latestMode === "edit" &&
      !isFeatureEffectivelyLocked(feature, useEditorTestLayersStore.getState().layers) &&
      !isFeatureGeometryLocked(feature) &&
      !isBoundaryFillZoneFeature(feature) &&
      (latestTool === "edit" ||
        (latestTool === "select" &&
          Boolean(featureId) &&
          selectedFeatureId === featureId));

    if (!canDragLayer) {
      return;
    }

    if (event.originalEvent.button !== 0) {
      return;
    }

    /**
     * Important :
     * On ne bloque plus les lignes/zones avec un test fragile sur SVGElement.
     * Les poignées Geoman sont des couches séparées.
     * Ici, le handler est lié au corps réel de l'objet DroMap.
     */

    L.DomEvent.stop(event.originalEvent);

    isDragging = true;
    hasMovedEnough = false;
    hasCommittedHistory = false;
    previousLatLng = event.latlng;
    startPoint = map.latLngToContainerPoint(event.latlng);
    wasMapDraggingEnabled = map.dragging.enabled();

    map.dragging.disable();
    container.style.cursor = "grabbing";

    document.addEventListener("mousemove", handleDocumentMouseMove, true);
    document.addEventListener("mouseup", handleDocumentMouseUp, true);
  };

  layer.on("mousedown", handleMouseDown);

  return () => {
    layer.off("mousedown", handleMouseDown);
    cleanupDocumentListeners();

    if (wasMapDraggingEnabled) {
      map.dragging.enable();
    }

    container.style.cursor = "default";

    isDragging = false;
    previousLatLng = null;
    startPoint = null;
    hasMovedEnough = false;
    hasCommittedHistory = false;
  };
}

function bindManualBodyDragToAllLayers(map: L.Map): (() => void)[] {
  const cleanups: (() => void)[] = [];

  map.eachLayer((layer) => {
    if (!getEditableFeatureId(layer)) {
      return;
    }

    cleanups.push(bindManualBodyDrag(map, layer));
  });

  return cleanups;
}

function enableSelectedLayerEdit(map: L.Map, selectedFeatureId: string | null) {
  if (!selectedFeatureId) {
    return;
  }

  map.eachLayer((layer) => {
    if (getLayerFeatureId(layer) !== selectedFeatureId) {
      return;
    }

    enableLayerEdit(layer);
  });
}

function bindManualBodyDragToSelectedLayer(
  map: L.Map,
  selectedFeatureId: string | null,
): (() => void)[] {
  if (!selectedFeatureId) {
    return [];
  }

  const cleanups: (() => void)[] = [];

  map.eachLayer((layer) => {
    if (getEditableFeatureId(layer) !== selectedFeatureId) {
      return;
    }

    cleanups.push(bindManualBodyDrag(map, layer));
  });

  return cleanups;
}

export function DrawingToolController() {
  const map = useMap();
  const lastMousePositionRef = useRef<LastMousePosition | null>(null);

  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const activeTool = useEditorTestToolStore((state) => state.activeTool);
  const selectedFeatureId = useEditorTestSelectionStore(
    (state) => state.selectedFeatureId,
  );

  const markerStyle = useEditorTestDrawingOptionsStore(
    (state) => state.markerStyle,
  );
  const markerSymbol = useEditorTestDrawingOptionsStore(
    (state) => state.markerSymbol,
  );
  const lineStyle = useEditorTestDrawingOptionsStore(
    (state) => state.lineStyle,
  );
  const zoneStyle = useEditorTestDrawingOptionsStore(
    (state) => state.zoneStyle,
  );

  const layersEditabilitySignature = useEditorTestLayersStore((state) =>
    state.layers
      .map((layer) => `${layer.id}:${layer.visible ? "visible" : "hidden"}:${layer.locked ? "locked" : "unlocked"}`)
      .join("|"),
  );

  const featureEditabilitySignature = useEditorTestFeaturesStore((state) =>
    state.features
      .map((feature) =>
        `${feature.id}:${feature.properties.layerId ?? "default"}:${isFeatureLocked(feature) ? "locked" : "unlocked"}`,
      )
      .join("|"),
  );

  useEffect(() => {
    const container = map.getContainer();

    const rememberMousePosition = (event: MouseEvent) => {
      lastMousePositionRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        screenX: event.screenX,
        screenY: event.screenY,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      };
    };

    container.addEventListener("mousemove", rememberMousePosition, true);

    return () => {
      container.removeEventListener("mousemove", rememberMousePosition, true);
    };
  }, [map]);

  useEffect(() => {
    /**
     * En mode workspace-select, ce contrôleur ne touche pas au dessin Geoman.
     * C'est GeomanControls qui active automatiquement le rectangle de zone.
     */
    if (currentMode !== "edit") {
      disableAllLayerEdit(map);
      return;
    }

    if (activeTool === "select") {
      deactivateGeomanModes(map);
      map.pm.disableDraw();
      disableAllLayerEdit(map);

      const container = map.getContainer();
      const previousCursor = container.style.cursor;
      container.style.cursor = "default";

      enableSelectedLayerEdit(map, selectedFeatureId);
      const cleanups = bindManualBodyDragToSelectedLayer(
        map,
        selectedFeatureId,
      );

      const handleLayerAdd = (event: L.LayerEvent) => {
        window.setTimeout(() => {
          const latestMode = useEditorTestModeStore.getState().currentMode;
          const latestTool = useEditorTestToolStore.getState().activeTool;
          const latestSelectedFeatureId =
            useEditorTestSelectionStore.getState().selectedFeatureId;

          if (
            latestMode !== "edit" ||
            latestTool !== "select" ||
            !latestSelectedFeatureId ||
            getEditableFeatureId(event.layer) !== latestSelectedFeatureId
          ) {
            return;
          }

          if (getLayerFeatureId(event.layer) === latestSelectedFeatureId) {
            enableLayerEdit(event.layer);
          }

          cleanups.push(bindManualBodyDrag(map, event.layer));
        }, 0);
      };

      map.on("layeradd", handleLayerAdd);

      return () => {
        map.off("layeradd", handleLayerAdd);
        container.style.cursor = previousCursor;

        for (const cleanup of cleanups) {
          cleanup();
        }

        disableAllLayerEdit(map);
      };
    }

    if (activeTool === "shape") {
      deactivateGeomanModes(map);
      map.pm.disableDraw();
      disableAllLayerEdit(map);

      const container = map.getContainer();
      const previousCursor = container.style.cursor;
      container.style.cursor = "none";
      let firstPoint: L.LatLng | null = null;
      let candidate: ShapePlacementCandidate | null = null;

      const isPointerInsideMap = (event: PointerEvent) => {
        const rect = container.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        return x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      };

      const resetShapePlacement = () => {
        firstPoint = null;
        candidate = null;
      };

      const rememberPotentialShapePoint = (event: PointerEvent) => {
        const latestMode = useEditorTestModeStore.getState().currentMode;
        const latestTool = useEditorTestToolStore.getState().activeTool;

        if (latestMode !== "edit" || latestTool !== "shape") {
          resetShapePlacement();
          return;
        }

        if (event.button !== 0 || !isPointerInsideMap(event)) {
          candidate = null;
          return;
        }

        /**
         * Une forme rapide se pose uniquement par clic court et immobile.
         * Si l'utilisateur garde le clic enfoncé et bouge la souris, c'est une
         * intention de déplacement de carte : on laisse Leaflet gérer le pan et
         * on ne pose surtout pas de point en même temps.
         */
        candidate = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          timeStamp: event.timeStamp,
        };
      };

      const confirmPotentialShapePoint = (event: PointerEvent) => {
        const currentCandidate = candidate;
        candidate = null;

        const latestMode = useEditorTestModeStore.getState().currentMode;
        const latestTool = useEditorTestToolStore.getState().activeTool;

        if (
          !currentCandidate ||
          latestMode !== "edit" ||
          latestTool !== "shape" ||
          event.pointerId !== currentCandidate.pointerId ||
          !isPointerInsideMap(event)
        ) {
          return;
        }

        const deltaX = event.clientX - currentCandidate.clientX;
        const deltaY = event.clientY - currentCandidate.clientY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const duration = event.timeStamp - currentCandidate.timeStamp;

        if (
          distance > SHAPE_PLACEMENT_CLICK_MAX_DISTANCE ||
          duration > SHAPE_PLACEMENT_CLICK_MAX_DURATION_MS
        ) {
          return;
        }

        L.DomEvent.stop(event);

        const latLng = map.mouseEventToLatLng(event);

        if (!firstPoint) {
          firstPoint = latLng;
          return;
        }

        const feature = createQuickShapeFeatureFromPlacement({
          map,
          startLatLng: firstPoint,
          endLatLng: latLng,
          style: useEditorTestDrawingOptionsStore.getState().zoneStyle,
        });

        useEditorTestFeaturesStore.getState().addFeatureWithHistory(feature);
        firstPoint = null;
      };

      const cancelPotentialShapePoint = () => {
        candidate = null;
      };

      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          resetShapePlacement();
        }
      };

      container.addEventListener(
        "pointerdown",
        rememberPotentialShapePoint,
        true,
      );
      container.addEventListener(
        "pointerup",
        confirmPotentialShapePoint,
        true,
      );
      container.addEventListener(
        "pointercancel",
        cancelPotentialShapePoint,
        true,
      );
      container.addEventListener(
        "pointerleave",
        cancelPotentialShapePoint,
        true,
      );
      window.addEventListener("keydown", handleEscape, true);

      return () => {
        container.removeEventListener(
          "pointerdown",
          rememberPotentialShapePoint,
          true,
        );
        container.removeEventListener(
          "pointerup",
          confirmPotentialShapePoint,
          true,
        );
        container.removeEventListener(
          "pointercancel",
          cancelPotentialShapePoint,
          true,
        );
        container.removeEventListener(
          "pointerleave",
          cancelPotentialShapePoint,
          true,
        );
        window.removeEventListener("keydown", handleEscape, true);
        container.style.cursor = previousCursor;
        resetShapePlacement();
        map.pm.disableDraw();
      };
    }

    if (activeTool === "marker") {
      deactivateGeomanModes(map);
      map.pm.disableDraw();
      disableAllLayerEdit(map);

      const container = map.getContainer();
      const previousCursor = container.style.cursor;
      container.style.cursor = "none";

      const handleMapClick = (event: L.LeafletMouseEvent) => {
        const latestMode = useEditorTestModeStore.getState().currentMode;
        const latestTool = useEditorTestToolStore.getState().activeTool;

        if (latestMode !== "edit" || latestTool !== "marker") {
          return;
        }

        if (event.originalEvent) {
          L.DomEvent.stop(event.originalEvent);
        }

        const feature = createMarkerFeature(event.latlng);

        useEditorTestFeaturesStore.getState().addFeatureWithHistory(feature);
      };

      map.on("click", handleMapClick);

      return () => {
        map.off("click", handleMapClick);
        container.style.cursor = previousCursor;
        map.pm.disableDraw();
      };
    }

    if (activeTool === "edit") {
      deactivateGeomanModes(map);
      disableAllLayerEdit(map);
      enableSelectedLayerEdit(map, selectedFeatureId);

      const container = map.getContainer();
      const previousCursor = container.style.cursor;
      container.style.cursor = "default";

      const cleanups = bindManualBodyDragToSelectedLayer(map, selectedFeatureId);

      const handleLayerAdd = (event: L.LayerEvent) => {
        window.setTimeout(() => {
          const latestMode = useEditorTestModeStore.getState().currentMode;
          const latestTool = useEditorTestToolStore.getState().activeTool;
          const latestSelectedFeatureId =
            useEditorTestSelectionStore.getState().selectedFeatureId;

          if (
            latestMode !== "edit" ||
            latestTool !== "edit" ||
            !latestSelectedFeatureId ||
            getEditableFeatureId(event.layer) !== latestSelectedFeatureId
          ) {
            return;
          }

          if (getLayerFeatureId(event.layer) === latestSelectedFeatureId) {
            enableLayerEdit(event.layer);
          }

          cleanups.push(bindManualBodyDrag(map, event.layer));
        }, 0);
      };

      map.on("layeradd", handleLayerAdd);

      return () => {
        map.off("layeradd", handleLayerAdd);
        container.style.cursor = previousCursor;

        for (const cleanup of cleanups) {
          cleanup();
        }

        disableAllLayerEdit(map);
      };
    }

    const shape = getShapeForTool(activeTool);

    if (!shape) {
      map.pm.disableDraw();
      disableAllLayerEdit(map);
      return;
    }

    disableAllLayerEdit(map);
    deactivateGeomanModes(map);
    enableDrawForCurrentTool(map, activeTool);

    const replayDrawCursor = () => {
      window.setTimeout(() => {
        replayLastMousePositionOnMap(map, lastMousePositionRef.current);
      }, 0);
      window.setTimeout(() => {
        replayLastMousePositionOnMap(map, lastMousePositionRef.current);
      }, 80);
      window.setTimeout(() => {
        replayLastMousePositionOnMap(map, lastMousePositionRef.current);
      }, 220);
    };

    replayDrawCursor();

    const container = map.getContainer();
    const previousCursor = container.style.cursor;
    container.style.cursor = "none";

    const restartCurrentDrawTool = () => {
      window.setTimeout(() => {
        const latestMode = useEditorTestModeStore.getState().currentMode;
        const latestTool = useEditorTestToolStore.getState().activeTool;

        if (latestMode !== "edit" || latestTool !== activeTool) {
          return;
        }

        enableDrawForCurrentTool(map, latestTool);
        replayDrawCursor();
      }, 0);
    };

    const replayAfterProgrammaticMapChange = () => {
      const latestMode = useEditorTestModeStore.getState().currentMode;
      const latestTool = useEditorTestToolStore.getState().activeTool;

      if (latestMode !== "edit" || latestTool !== activeTool) {
        return;
      }

      replayDrawCursor();
    };

    map.on("pm:create", restartCurrentDrawTool);
    map.on("moveend zoomend resize", replayAfterProgrammaticMapChange);
    window.addEventListener(
      GEOMAN_CURSOR_REPLAY_EVENT,
      replayAfterProgrammaticMapChange,
    );

    return () => {
      map.off("pm:create", restartCurrentDrawTool);
      map.off("moveend zoomend resize", replayAfterProgrammaticMapChange);
      window.removeEventListener(
        GEOMAN_CURSOR_REPLAY_EVENT,
        replayAfterProgrammaticMapChange,
      );
      map.pm.disableDraw();
      container.style.cursor = previousCursor;
    };
  }, [
    map,
    currentMode,
    activeTool,
    selectedFeatureId,
    markerStyle,
    markerSymbol,
    lineStyle,
    zoneStyle,
    featureEditabilitySignature,
    layersEditabilitySignature,
  ]);

  return null;
}
