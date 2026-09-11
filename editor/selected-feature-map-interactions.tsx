"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import type { DroMapFeature } from "@/lib/dromap/feature";
import { useEditorFeaturesStore } from "@/stores/editor-features";
import {
  isFeatureEffectivelyLocked,
  isFeatureLayerVisible,
  useEditorLayersStore,
} from "@/stores/editor-layers";
import { useEditorModeStore } from "@/stores/editor-mode";
import { useEditorSelectionStore } from "@/stores/editor-selection";
import { useEditorToolStore } from "@/stores/editor-tool";
import { useEditorTextEditStore } from "@/stores/editor-text-edit";

type DroMapLeafletLayer = L.Layer & {
  dromapFeatureId?: string;
  dromapHitboxOwnerId?: string;
  dromapSuppressNextClick?: boolean;
};

type PointerDownState = {
  x: number;
  y: number;
};

type LayerHandlers = {
  clickHandler: L.LeafletEventHandlerFn;
  doubleClickHandler: L.LeafletEventHandlerFn;
  mouseDownHandler: L.LeafletEventHandlerFn;
  mouseUpHandler: L.LeafletEventHandlerFn;
};

const CLICK_DRAG_DISTANCE_THRESHOLD = 5;

function shouldSuppressGlobalMapClick() {
  const win = window as Window & { dromapSuppressNextClick?: boolean };

  if (!win.dromapSuppressNextClick) {
    return false;
  }

  win.dromapSuppressNextClick = false;
  return true;
}

function getLayerFeatureId(layer: L.Layer): string | undefined {
  const dromapLayer = layer as DroMapLeafletLayer;
  return dromapLayer.dromapFeatureId ?? dromapLayer.dromapHitboxOwnerId;
}

function pointerMoved(
  pointerDownState: PointerDownState | undefined,
  event: L.LeafletMouseEvent,
) {
  if (!pointerDownState || !event.originalEvent) {
    return false;
  }

  const deltaX = event.originalEvent.clientX - pointerDownState.x;
  const deltaY = event.originalEvent.clientY - pointerDownState.y;
  return Math.hypot(deltaX, deltaY) >= CLICK_DRAG_DISTANCE_THRESHOLD;
}

type GeoPoint = [number, number];

function pointInBounds(point: GeoPoint, bounds: L.LatLngBounds) {
  return bounds.contains(L.latLng(point[1], point[0]));
}

function orientation(a: GeoPoint, b: GeoPoint, c: GeoPoint) {
  return (b[0] - a[0]) * (c[1] - a[1]) -
    (b[1] - a[1]) * (c[0] - a[0]);
}

function pointOnSegment(a: GeoPoint, b: GeoPoint, p: GeoPoint) {
  const epsilon = 1e-10;
  if (Math.abs(orientation(a, b, p)) > epsilon) {
    return false;
  }
  return (
    p[0] >= Math.min(a[0], b[0]) - epsilon &&
    p[0] <= Math.max(a[0], b[0]) + epsilon &&
    p[1] >= Math.min(a[1], b[1]) - epsilon &&
    p[1] <= Math.max(a[1], b[1]) + epsilon
  );
}

function segmentsIntersect(a: GeoPoint, b: GeoPoint, c: GeoPoint, d: GeoPoint) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  const epsilon = 1e-10;

  if (
    ((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon)) &&
    ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon))
  ) {
    return true;
  }

  return (
    (Math.abs(o1) <= epsilon && pointOnSegment(a, b, c)) ||
    (Math.abs(o2) <= epsilon && pointOnSegment(a, b, d)) ||
    (Math.abs(o3) <= epsilon && pointOnSegment(c, d, a)) ||
    (Math.abs(o4) <= epsilon && pointOnSegment(c, d, b))
  );
}

function boundsCorners(bounds: L.LatLngBounds): GeoPoint[] {
  const west = bounds.getWest();
  const east = bounds.getEast();
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ];
}

function segmentIntersectsBounds(a: GeoPoint, b: GeoPoint, bounds: L.LatLngBounds) {
  if (pointInBounds(a, bounds) || pointInBounds(b, bounds)) {
    return true;
  }

  const corners = boundsCorners(bounds);
  for (let index = 0; index < corners.length; index += 1) {
    const edgeStart = corners[index];
    const edgeEnd = corners[(index + 1) % corners.length];
    if (segmentsIntersect(a, b, edgeStart, edgeEnd)) {
      return true;
    }
  }
  return false;
}

function lineIntersectsBounds(points: GeoPoint[], bounds: L.LatLngBounds) {
  if (points.some((point) => pointInBounds(point, bounds))) {
    return true;
  }
  for (let index = 1; index < points.length; index += 1) {
    if (segmentIntersectsBounds(points[index - 1], points[index], bounds)) {
      return true;
    }
  }
  return false;
}

function pointInRing(point: GeoPoint, ring: GeoPoint[]) {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[j];
    const b = ring[i];
    if (pointOnSegment(a, b, point)) return true;
    const crosses =
      (a[1] > point[1]) !== (b[1] > point[1]) &&
      point[0] <
        ((b[0] - a[0]) * (point[1] - a[1])) /
          (b[1] - a[1] || Number.EPSILON) +
          a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: GeoPoint, rings: GeoPoint[][]) {
  if (rings.length === 0 || !pointInRing(point, rings[0])) {
    return false;
  }
  return !rings.slice(1).some((hole) => pointInRing(point, hole));
}

function polygonIntersectsBounds(rings: GeoPoint[][], bounds: L.LatLngBounds) {
  for (const ring of rings) {
    if (lineIntersectsBounds(ring, bounds)) {
      return true;
    }
    if (ring.length > 2 && segmentIntersectsBounds(ring[ring.length - 1], ring[0], bounds)) {
      return true;
    }
  }
  return boundsCorners(bounds).some((corner) => pointInPolygon(corner, rings));
}

function featureIntersectsBounds(feature: DroMapFeature, bounds: L.LatLngBounds) {
  if (feature.geometry.type === "Point") {
    return pointInBounds(feature.geometry.coordinates, bounds);
  }
  if (feature.geometry.type === "LineString") {
    return lineIntersectsBounds(feature.geometry.coordinates, bounds);
  }
  return polygonIntersectsBounds(feature.geometry.coordinates, bounds);
}

export function SelectedFeatureMapInteractions() {
  const map = useMap();
  const currentMode = useEditorModeStore((state) => state.currentMode);
  const activeTool = useEditorToolStore((state) => state.activeTool);
  const layersSignature = useEditorLayersStore((state) =>
    state.layers
      .map(
        (layer) =>
          `${layer.id}:${layer.visible ? "visible" : "hidden"}:${layer.order}`,
      )
      .join("|"),
  );
  const multiSelectionEnabled = useEditorSelectionStore(
    (state) => state.multiSelectionEnabled,
  );
  const areaSelectionEnabled = useEditorSelectionStore(
    (state) => state.areaSelectionEnabled,
  );
  const setSelectedFeatureId = useEditorSelectionStore(
    (state) => state.setSelectedFeatureId,
  );
  const toggleFeatureSelection = useEditorSelectionStore(
    (state) => state.toggleFeatureSelection,
  );
  const setMultiSelectionEnabled = useEditorSelectionStore(
    (state) => state.setMultiSelectionEnabled,
  );
  const setAreaSelectionEnabled = useEditorSelectionStore(
    (state) => state.setAreaSelectionEnabled,
  );
  const setSelectedFeatureIds = useEditorSelectionStore(
    (state) => state.setSelectedFeatureIds,
  );
  const clearSelectedFeatureId = useEditorSelectionStore(
    (state) => state.clearSelectedFeatureId,
  );

  useEffect(() => {
    const canSelectFromMap =
      currentMode === "edit" &&
      (activeTool === "select" || activeTool === "edit");

    if (!canSelectFromMap) {
      return;
    }

    let mapIsDragging = false;
    const pointerDownByFeatureId = new Map<string, PointerDownState>();
    const boundLayers = new Map<L.Layer, LayerHandlers>();
    const pendingFrames = new Set<number>();
    const pendingTimers = new Set<number>();

    const resetPointerState = () => {
      pointerDownByFeatureId.clear();
      // Une navigation ne doit jamais laisser un drapeau global de clic bloqué.
      (window as Window & { dromapSuppressNextClick?: boolean }).dromapSuppressNextClick = false;
      boundLayers.forEach((_handlers, layer) => {
        (layer as DroMapLeafletLayer).dromapSuppressNextClick = false;
      });
    };

    const handleMapDragStart = () => {
      mapIsDragging = true;
      resetPointerState();
    };

    const handleMapDragEnd = () => {
      mapIsDragging = false;
      resetPointerState();
    };

    const handleMapClick = () => {
      if (shouldSuppressGlobalMapClick()) {
        return;
      }

      if (!useEditorSelectionStore.getState().multiSelectionEnabled) {
        clearSelectedFeatureId();
      }
    };

    const bindLayer = (layer: L.Layer) => {
      if (boundLayers.has(layer)) {
        return;
      }

      const featureId = getLayerFeatureId(layer);
      if (!featureId) {
        return;
      }

      if (layer instanceof L.Path) {
        layer.options.interactive = true;
        layer.options.bubblingMouseEvents = false;
      }

      const handleLayerMouseDown: L.LeafletEventHandlerFn = (event) => {
        const mouseEvent = event as L.LeafletMouseEvent;
        if (!mouseEvent.originalEvent) {
          return;
        }

        pointerDownByFeatureId.set(featureId, {
          x: mouseEvent.originalEvent.clientX,
          y: mouseEvent.originalEvent.clientY,
        });
      };

      const handleLayerMouseUp: L.LeafletEventHandlerFn = (event) => {
        const mouseEvent = event as L.LeafletMouseEvent;
        const down = pointerDownByFeatureId.get(featureId);
        if (down && pointerMoved(down, mouseEvent)) {
          pointerDownByFeatureId.delete(featureId);
        }
      };

      const handleLayerClick: L.LeafletEventHandlerFn = (event) => {
        const mouseEvent = event as L.LeafletMouseEvent;
        const dromapLayer = layer as DroMapLeafletLayer;
        const down = pointerDownByFeatureId.get(featureId);
        pointerDownByFeatureId.delete(featureId);

        if (mouseEvent.originalEvent) {
          L.DomEvent.stop(mouseEvent.originalEvent);
        }

        // Un clic généré à la fin d'un vrai déplacement ne sélectionne pas,
        // mais l'état est immédiatement nettoyé : le clic suivant fonctionne.
        if (
          mapIsDragging ||
          pointerMoved(down, mouseEvent) ||
          dromapLayer.dromapSuppressNextClick
        ) {
          dromapLayer.dromapSuppressNextClick = false;
          return;
        }

        if (
          mouseEvent.originalEvent?.detail &&
          mouseEvent.originalEvent.detail >= 2
        ) {
          return;
        }

        const selectionState = useEditorSelectionStore.getState();
        if (selectionState.multiSelectionEnabled) {
          selectionState.toggleFeatureSelection(featureId);
          return;
        }

        // Réémettre explicitement la sélection même si l'objet était déjà
        // sélectionné : l'inspecteur peut ainsi revenir sur « Sélection ».
        selectionState.setSelectedFeatureId(featureId);
      };

      const handleLayerDoubleClick: L.LeafletEventHandlerFn = (event) => {
        const mouseEvent = event as L.LeafletMouseEvent;
        const feature = useEditorFeaturesStore
          .getState()
          .features.find((candidate) => candidate.id === featureId);

        if (mouseEvent.originalEvent) {
          L.DomEvent.stop(mouseEvent.originalEvent);
        }

        if (
          !feature ||
          feature.properties.type !== "text" ||
          feature.geometry.type !== "Point" ||
          isFeatureEffectivelyLocked(
            feature,
            useEditorLayersStore.getState().layers,
          )
        ) {
          return;
        }

        setMultiSelectionEnabled(false);
        setSelectedFeatureId(featureId);
        useEditorTextEditStore
          .getState()
          .startEditingTextFeature(featureId);
      };

      layer.on("mousedown", handleLayerMouseDown);
      layer.on("mouseup", handleLayerMouseUp);
      layer.on("click", handleLayerClick);
      layer.on("dblclick", handleLayerDoubleClick);
      boundLayers.set(layer, {
        clickHandler: handleLayerClick,
        doubleClickHandler: handleLayerDoubleClick,
        mouseDownHandler: handleLayerMouseDown,
        mouseUpHandler: handleLayerMouseUp,
      });
    };

    const bindAllLayers = () => {
      map.eachLayer(bindLayer);
    };

    const scheduleLayerBinding = (layer: L.Layer, remainingFrames = 8) => {
      bindLayer(layer);
      if (boundLayers.has(layer) || remainingFrames <= 0) return;
      const frame = window.requestAnimationFrame(() => {
        pendingFrames.delete(frame);
        scheduleLayerBinding(layer, remainingFrames - 1);
      });
      pendingFrames.add(frame);
    };

    const handleLayerAdd = (event: L.LayerEvent) => {
      // Après restauration, certaines hitboxes ne reçoivent leur identifiant
      // DroMap qu'après leur ajout à Leaflet. Plusieurs frames sont donc
      // volontairement retentées au lieu de dépendre d'un unique timing.
      scheduleLayerBinding(event.layer);
    };

    map.on("click", handleMapClick);
    map.on("dragstart", handleMapDragStart);
    map.on("dragend", handleMapDragEnd);
    map.on("moveend", resetPointerState);
    map.on("layeradd", handleLayerAdd);

    bindAllLayers();
    const initialFrame = window.requestAnimationFrame(bindAllLayers);
    pendingFrames.add(initialFrame);
    // Filet de sécurité pour les couches restaurées/recréées de manière
    // asynchrone (notamment les hitboxes transparentes des traits).
    for (const delay of [40, 120, 350, 800]) {
      const timer = window.setTimeout(() => {
        pendingTimers.delete(timer);
        bindAllLayers();
      }, delay);
      pendingTimers.add(timer);
    }

    return () => {
      pendingFrames.forEach((frame) => window.cancelAnimationFrame(frame));
      pendingTimers.forEach((timer) => window.clearTimeout(timer));
      map.off("click", handleMapClick);
      map.off("dragstart", handleMapDragStart);
      map.off("dragend", handleMapDragEnd);
      map.off("moveend", resetPointerState);
      map.off("layeradd", handleLayerAdd);
      resetPointerState();

      boundLayers.forEach(
        (
          {
            clickHandler,
            doubleClickHandler,
            mouseDownHandler,
            mouseUpHandler,
          },
          layer,
        ) => {
          layer.off("click", clickHandler);
          layer.off("dblclick", doubleClickHandler);
          layer.off("mousedown", mouseDownHandler);
          layer.off("mouseup", mouseUpHandler);
        },
      );
      boundLayers.clear();
    };
  }, [
    map,
    currentMode,
    activeTool,
    layersSignature,
    multiSelectionEnabled,
    setSelectedFeatureId,
    setMultiSelectionEnabled,
    clearSelectedFeatureId,
    toggleFeatureSelection,
  ]);


  useEffect(() => {
    if (!areaSelectionEnabled || currentMode !== "edit") {
      return;
    }

    const container = map.getContainer();
    const previousCursor = container.style.cursor;
    let dragStart: L.Point | null = null;
    let selectionRectangle: L.Rectangle | null = null;
    let mapDraggingWasEnabled = false;

    container.style.cursor = "crosshair";

    const cleanupRectangle = () => {
      if (selectionRectangle) {
        selectionRectangle.removeFrom(map);
        selectionRectangle = null;
      }
    };

    const restoreMapInteraction = () => {
      if (mapDraggingWasEnabled) {
        map.dragging.enable();
      }
      mapDraggingWasEnabled = false;
      container.style.cursor = previousCursor;
    };

    const cancelAreaSelection = () => {
      dragStart = null;
      cleanupRectangle();
      restoreMapInteraction();
      setAreaSelectionEnabled(false);
    };

    const toContainerPoint = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      return L.point(event.clientX - rect.left, event.clientY - rect.top);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || dragStart) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      dragStart = toContainerPoint(event);
      mapDraggingWasEnabled = map.dragging.enabled();
      map.dragging.disable();

      const startLatLng = map.containerPointToLatLng(dragStart);
      selectionRectangle = L.rectangle(
        L.latLngBounds(startLatLng, startLatLng),
        {
          color: "#7c3aed",
          weight: 2,
          opacity: 0.95,
          dashArray: "7 5",
          fillColor: "#8b5cf6",
          fillOpacity: 0.12,
          interactive: false,
        },
      ).addTo(map);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!dragStart || !selectionRectangle) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const currentPoint = toContainerPoint(event);
      const startLatLng = map.containerPointToLatLng(dragStart);
      const currentLatLng = map.containerPointToLatLng(currentPoint);
      selectionRectangle.setBounds(L.latLngBounds(startLatLng, currentLatLng));
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!dragStart) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const endPoint = toContainerPoint(event);
      const distance = dragStart.distanceTo(endPoint);

      if (distance >= CLICK_DRAG_DISTANCE_THRESHOLD) {
        const selectionBounds = L.latLngBounds(
          map.containerPointToLatLng(dragStart),
          map.containerPointToLatLng(endPoint),
        );
        const features = useEditorFeaturesStore.getState().features;
        const layers = useEditorLayersStore.getState().layers;
        const matchingFeatureIds = features
          .filter((feature) =>
            isFeatureLayerVisible(feature, layers) &&
            featureIntersectsBounds(feature, selectionBounds),
          )
          .map((feature) => feature.id);

        setSelectedFeatureIds(matchingFeatureIds);
      }

      // Le navigateur peut produire un click après pointerup : il ne doit pas
      // effacer la sélection que l'on vient de créer.
      (window as Window & { dromapSuppressNextClick?: boolean }).dromapSuppressNextClick = true;
      dragStart = null;
      cleanupRectangle();
      restoreMapInteraction();
      setAreaSelectionEnabled(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelAreaSelection();
      }
    };

    container.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerUp, true);
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      container.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      cleanupRectangle();
      restoreMapInteraction();
    };
  }, [
    areaSelectionEnabled,
    currentMode,
    map,
    setAreaSelectionEnabled,
    setSelectedFeatureIds,
  ]);

  return null;
}
