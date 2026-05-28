"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import { deactivateGeomanModes } from "@/lib/dromap/geoman-toolbar";
import type { DroMapFeature } from "@/lib/dromap/feature";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { useEditorTestToolStore } from "@/stores/editor-test-tool";
import {
  applyDrawingPresetToFeature,
  useEditorTestDrawingOptionsStore,
} from "@/stores/editor-test-drawing-options";

const MIN_POINT_DISTANCE_PX = 4;
const MIN_FEATURE_DISTANCE_PX = 8;
const MAX_FREEHAND_POINTS = 1200;

type FreehandPoint = {
  latLng: L.LatLng;
  containerPoint: L.Point;
};

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

function getPreviewPathOptions(): L.PolylineOptions {
  const style = useEditorTestDrawingOptionsStore.getState().lineStyle;

  return {
    color: style.color,
    opacity: style.opacity,
    weight: style.weight,
    dashArray: getDashArray(style.dashStyle, style.weight),
    lineCap: "round",
    lineJoin: "round",
    interactive: false,
    bubblingMouseEvents: false,
  };
}

function createFreehandFeature(points: FreehandPoint[]): DroMapFeature {
  const coordinates = points.map(
    (point) => [point.latLng.lng, point.latLng.lat] as [number, number],
  );

  const feature: DroMapFeature = {
    type: "Feature",
    id: crypto.randomUUID(),
    geometry: {
      type: "LineString",
      coordinates,
    },
    properties: {
      type: "line",
      label: "Ligne libre",
      lineVariant: "freehand",
      style: {
        color: "#111827",
        opacity: 1,
        weight: 4,
        dashStyle: "solid",
        arrowStart: false,
        arrowEnd: false,
      },
      meta: { version: 1 },
    },
  };

  return applyDrawingPresetToFeature(feature);
}

function getTotalPixelDistance(points: FreehandPoint[]) {
  if (points.length < 2) {
    return 0;
  }

  let distance = 0;

  for (let index = 1; index < points.length; index += 1) {
    distance += points[index - 1].containerPoint.distanceTo(
      points[index].containerPoint,
    );
  }

  return distance;
}

function shouldAddPoint(points: FreehandPoint[], nextPoint: L.Point) {
  if (points.length === 0) {
    return true;
  }

  if (points.length >= MAX_FREEHAND_POINTS) {
    return false;
  }

  const previous = points[points.length - 1];

  return previous.containerPoint.distanceTo(nextPoint) >= MIN_POINT_DISTANCE_PX;
}

export function FreehandLineToolLayer() {
  const map = useMap();

  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const activeTool = useEditorTestToolStore((state) => state.activeTool);
  const addFeatureWithHistory = useEditorTestFeaturesStore(
    (state) => state.addFeatureWithHistory,
  );
  const setSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.setSelectedFeatureId,
  );

  const lineStyle = useEditorTestDrawingOptionsStore((state) => state.lineStyle);

  useEffect(() => {
    if (currentMode !== "edit" || activeTool !== "freehand") {
      return;
    }

    deactivateGeomanModes(map);
    map.pm.disableDraw();

    const container = map.getContainer();
    const previousCursor = container.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    let isDrawing = false;
    let points: FreehandPoint[] = [];
    let previewLayer: L.Polyline | null = null;

    const removePreviewLayer = () => {
      if (previewLayer) {
        map.removeLayer(previewLayer);
        previewLayer = null;
      }
    };

    const addPointFromMouseEvent = (event: MouseEvent) => {
      const containerPoint = map.mouseEventToContainerPoint(event);

      if (!shouldAddPoint(points, containerPoint)) {
        return;
      }

      const latLng = map.mouseEventToLatLng(event);
      const nextPoint: FreehandPoint = { latLng, containerPoint };

      points = [...points, nextPoint];

      if (!previewLayer) {
        previewLayer = L.polyline([latLng], getPreviewPathOptions()).addTo(map);
        return;
      }

      previewLayer.setLatLngs(points.map((point) => point.latLng));
    };

    const finishDrawing = () => {
      if (!isDrawing) {
        return;
      }

      isDrawing = false;
      container.style.cursor = "crosshair";
      document.body.style.userSelect = previousUserSelect;

      document.removeEventListener("mousemove", handleDocumentMouseMove, true);
      document.removeEventListener("mouseup", handleDocumentMouseUp, true);

      const finalPoints = points;
      points = [];
      removePreviewLayer();

      if (
        finalPoints.length < 2 ||
        getTotalPixelDistance(finalPoints) < MIN_FEATURE_DISTANCE_PX
      ) {
        return;
      }

      const feature = createFreehandFeature(finalPoints);
      addFeatureWithHistory(feature);
      setSelectedFeatureId(feature.id);
    };

    function handleDocumentMouseMove(event: MouseEvent) {
      if (!isDrawing) {
        return;
      }

      event.preventDefault();
      addPointFromMouseEvent(event);
    }

    function handleDocumentMouseUp(event: MouseEvent) {
      if (!isDrawing) {
        return;
      }

      event.preventDefault();
      addPointFromMouseEvent(event);
      finishDrawing();
    }

    const handleMapMouseDown = (event: L.LeafletMouseEvent) => {
      const originalEvent = event.originalEvent;

      if (originalEvent.button !== 0) {
        return;
      }

      L.DomEvent.stop(originalEvent);
      originalEvent.preventDefault();

      removePreviewLayer();

      isDrawing = true;
      points = [];
      container.style.cursor = "crosshair";
      document.body.style.userSelect = "none";

      points.push({
        latLng: event.latlng,
        containerPoint: map.latLngToContainerPoint(event.latlng),
      });

      previewLayer = L.polyline([event.latlng], getPreviewPathOptions()).addTo(
        map,
      );

      document.addEventListener("mousemove", handleDocumentMouseMove, true);
      document.addEventListener("mouseup", handleDocumentMouseUp, true);
    };

    container.style.cursor = "crosshair";
    map.on("mousedown", handleMapMouseDown);

    return () => {
      map.off("mousedown", handleMapMouseDown);
      document.removeEventListener("mousemove", handleDocumentMouseMove, true);
      document.removeEventListener("mouseup", handleDocumentMouseUp, true);

      removePreviewLayer();
      points = [];
      isDrawing = false;

      container.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [
    map,
    currentMode,
    activeTool,
    lineStyle,
    addFeatureWithHistory,
    setSelectedFeatureId,
  ]);

  return null;
}
