"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import {
  isFreehandLineFeature,
  layerToDroMapFeature,
} from "@/lib/dromap/feature";
import { deactivateGeomanModes } from "@/lib/dromap/geoman-toolbar";
import { getLayerFeatureId } from "@/lib/dromap/layer-id";
import { defaultMarkerIcon } from "@/lib/leaflet-icon";
import { useEditorTestDrawingOptionsStore } from "@/stores/editor-test-drawing-options";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import type { EditorTestActiveTool } from "@/stores/editor-test-tool";
import { useEditorTestToolStore } from "@/stores/editor-test-tool";

const DROMAP_SNAP_DISTANCE = 5;
const DRAG_CLICK_SUPPRESSION_DISTANCE = 5;
const DRAG_CLICK_SUPPRESSION_DELAY_MS = 250;

type GeomanDrawShape = "Marker" | "Line" | "Polygon";

type GeomanDrawApi = {
  enableDraw: (shape: GeomanDrawShape, options?: unknown) => void;
};

type DroMapEditableLayer = L.Layer & {
  dromapFeatureId?: string;
  dromapSuppressNextClick?: boolean;
  pm?: {
    enable?: (options?: unknown) => void;
    disable?: () => void;
    enabled?: () => boolean;
  };
};

function getShapeForTool(tool: EditorTestActiveTool): GeomanDrawShape | null {
  if (tool === "marker") return "Marker";
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

function isDroMapEditableLayer(layer: L.Layer): layer is DroMapEditableLayer {
  const candidate = layer as DroMapEditableLayer;

  return Boolean(candidate.dromapFeatureId && candidate.pm);
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
  const featureId = getLayerFeatureId(layer);

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

  if (
    layer instanceof L.Marker ||
    (feature && isFreehandLineFeature(feature))
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

  if (shape === "Marker") {
    geomanDraw.enableDraw("Marker", {
      snappable: true,
      snapDistance: DROMAP_SNAP_DISTANCE,
      markerStyle: {
        icon: defaultMarkerIcon,
      },
    });
    return;
  }

  if (shape === "Line") {
    const style = drawingOptions.lineStyle;

    geomanDraw.enableDraw("Line", {
      snappable: true,
      snapDistance: DROMAP_SNAP_DISTANCE,
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
      pathOptions: {
        color: style.color,
        opacity: style.opacity,
        weight: style.weight,
        fillColor: style.fillColor,
        fillOpacity: style.fillOpacity,
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
  const featureId = getLayerFeatureId(layer);
  const shape = getShapeForLayer(layer);

  if (!featureId || !shape) {
    return;
  }

  const store = useEditorTestFeaturesStore.getState();

  const existingFeature = store.features.find(
    (feature) => feature.id === featureId,
  );

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
  const featureId = getLayerFeatureId(layer);

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
  if (!isDroMapEditableLayer(layer)) {
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

    if (latestMode !== "edit" || latestTool !== "edit") {
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
    if (!getLayerFeatureId(layer)) {
      return;
    }

    cleanups.push(bindManualBodyDrag(map, layer));
  });

  return cleanups;
}

export function DrawingToolController() {
  const map = useMap();

  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const activeTool = useEditorTestToolStore((state) => state.activeTool);

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

  const featureIdsSignature = useEditorTestFeaturesStore((state) =>
    state.features.map((feature) => feature.id).join("|"),
  );

  useEffect(() => {
    /**
     * En mode workspace-select, ce contrôleur ne touche pas au dessin Geoman.
     * C'est GeomanControls qui active automatiquement le rectangle de zone.
     */
    if (currentMode !== "edit") {
      disableAllLayerEdit(map);
      return;
    }

    if (activeTool === "edit") {
      deactivateGeomanModes(map);
      enableAllLayerEdit(map);

      const container = map.getContainer();
      const previousCursor = container.style.cursor;
      container.style.cursor = "default";

      const cleanups = bindManualBodyDragToAllLayers(map);

      const handleLayerAdd = (event: L.LayerEvent) => {
        window.setTimeout(() => {
          const latestMode = useEditorTestModeStore.getState().currentMode;
          const latestTool = useEditorTestToolStore.getState().activeTool;

          if (latestMode !== "edit" || latestTool !== "edit") {
            return;
          }

          enableLayerEdit(event.layer);

          if (getLayerFeatureId(event.layer)) {
            cleanups.push(bindManualBodyDrag(map, event.layer));
          }
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

    const container = map.getContainer();
    const previousCursor = container.style.cursor;
    container.style.cursor = "crosshair";

    const restartCurrentDrawTool = () => {
      window.setTimeout(() => {
        const latestMode = useEditorTestModeStore.getState().currentMode;
        const latestTool = useEditorTestToolStore.getState().activeTool;

        if (latestMode !== "edit" || latestTool !== activeTool) {
          return;
        }

        enableDrawForCurrentTool(map, latestTool);
      }, 0);
    };

    map.on("pm:create", restartCurrentDrawTool);

    return () => {
      map.off("pm:create", restartCurrentDrawTool);
      map.pm.disableDraw();
      container.style.cursor = previousCursor;
    };
  }, [
    map,
    currentMode,
    activeTool,
    markerStyle,
    markerSymbol,
    lineStyle,
    zoneStyle,
    featureIdsSignature,
  ]);

  return null;
}
