"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import { deactivateGeomanModes } from "@/lib/dromap/geoman-toolbar";
import type { DroMapFeature } from "@/lib/dromap/feature";
import {
  applyDrawingPresetToFeature,
  useEditorTestDrawingOptionsStore,
} from "@/stores/editor-test-drawing-options";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestToolStore } from "@/stores/editor-test-tool";

import { getLeafletDashArray } from "./feature-style";
import { createZoneHatchingLeafletLayer } from "./zone-hatching";
import {
  createAlignedZoneOutlineLeafletLayer,
  shouldUseAlignedZoneOutline,
} from "./zone-outline";
import {
  getZoneStrokeEnabled,
  getZoneVisibleFillOpacity,
  getZoneVisibleStrokeOpacity,
} from "./zone-style";

const MIN_POINT_DISTANCE_PX = 4;
const MIN_FEATURE_DISTANCE_PX = 12;
const MAX_FREEHAND_ZONE_POINTS = 1400;
const FREEHAND_ZONE_PREVIEW_OPACITY_FACTOR = 0.58;
const DEFAULT_FREEHAND_ZONE_SMOOTHING = 45;
const MAX_SMOOTHED_FREEHAND_ZONE_POINTS = 2200;

type FreehandZonePoint = {
  latLng: L.LatLng;
  containerPoint: L.Point;
};

function clampSmoothing(value: unknown) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return DEFAULT_FREEHAND_ZONE_SMOOTHING;
  }

  return Math.max(0, Math.min(100, Math.round(numberValue)));
}

function getSquaredDistanceToSegment(
  point: L.Point,
  segmentStart: L.Point,
  segmentEnd: L.Point,
) {
  const dx = segmentEnd.x - segmentStart.x;
  const dy = segmentEnd.y - segmentStart.y;

  if (dx === 0 && dy === 0) {
    return point.distanceTo(segmentStart) ** 2;
  }

  const ratio = Math.max(
    0,
    Math.min(
      1,
      ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) /
        (dx * dx + dy * dy),
    ),
  );

  const projection = L.point(
    segmentStart.x + ratio * dx,
    segmentStart.y + ratio * dy,
  );

  return point.distanceTo(projection) ** 2;
}

function simplifyContainerPoints(
  points: L.Point[],
  tolerancePx: number,
): L.Point[] {
  if (points.length <= 2 || tolerancePx <= 0) {
    return points;
  }

  const keep = new Array<boolean>(points.length).fill(false);
  const squaredTolerance = tolerancePx * tolerancePx;

  keep[0] = true;
  keep[points.length - 1] = true;

  const simplifyRange = (startIndex: number, endIndex: number) => {
    if (endIndex <= startIndex + 1) {
      return;
    }

    let maxDistance = 0;
    let maxIndex = -1;

    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = getSquaredDistanceToSegment(
        points[index],
        points[startIndex],
        points[endIndex],
      );

      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = index;
      }
    }

    if (maxIndex === -1 || maxDistance <= squaredTolerance) {
      return;
    }

    keep[maxIndex] = true;
    simplifyRange(startIndex, maxIndex);
    simplifyRange(maxIndex, endIndex);
  };

  simplifyRange(0, points.length - 1);

  const simplified = points.filter((_, index) => keep[index]);
  return simplified.length >= 2 ? simplified : points;
}

function smoothContainerPoints(
  points: L.Point[],
  iterations: number,
): L.Point[] {
  if (points.length <= 2 || iterations <= 0) {
    return points;
  }

  let currentPoints = points;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    if (currentPoints.length <= 2) {
      return currentPoints;
    }

    const nextPoints: L.Point[] = [currentPoints[0]];

    for (let index = 0; index < currentPoints.length - 1; index += 1) {
      const current = currentPoints[index];
      const next = currentPoints[index + 1];

      nextPoints.push(
        L.point(
          current.x * 0.75 + next.x * 0.25,
          current.y * 0.75 + next.y * 0.25,
        ),
      );
      nextPoints.push(
        L.point(
          current.x * 0.25 + next.x * 0.75,
          current.y * 0.25 + next.y * 0.75,
        ),
      );
    }

    nextPoints.push(currentPoints[currentPoints.length - 1]);
    currentPoints = nextPoints;
  }

  return currentPoints;
}

function limitContainerPoints(points: L.Point[], maxPointCount: number) {
  if (points.length <= maxPointCount || maxPointCount < 2) {
    return points;
  }

  const limitedPoints: L.Point[] = [];

  for (let index = 0; index < maxPointCount; index += 1) {
    const sourceIndex = Math.round(
      (index * (points.length - 1)) / (maxPointCount - 1),
    );
    limitedPoints.push(points[sourceIndex]);
  }

  return limitedPoints;
}

function smoothFreehandZonePoints(
  points: FreehandZonePoint[],
  smoothing: number,
  map: L.Map,
): FreehandZonePoint[] {
  const smoothingValue = clampSmoothing(smoothing);

  if (points.length <= 2 || smoothingValue <= 0) {
    return points;
  }

  const smoothingRatio = smoothingValue / 100;
  const simplificationTolerancePx = 0.6 + smoothingRatio * 12.5;
  const smoothIterations =
    smoothingValue < 12
      ? 0
      : smoothingValue < 35
        ? 1
        : smoothingValue < 65
          ? 2
          : smoothingValue < 88
            ? 3
            : 4;

  const containerPoints = points.map((point) => point.containerPoint);
  const simplifiedPoints = simplifyContainerPoints(
    containerPoints,
    simplificationTolerancePx,
  );
  const smoothedPoints = smoothContainerPoints(
    simplifiedPoints,
    smoothIterations,
  );
  const limitedPoints = limitContainerPoints(
    smoothedPoints,
    MAX_SMOOTHED_FREEHAND_ZONE_POINTS,
  );

  if (limitedPoints.length < 3) {
    return points;
  }

  return limitedPoints.map((containerPoint) => ({
    containerPoint,
    latLng: map.containerPointToLatLng(containerPoint),
  }));
}

function getTotalPixelDistance(points: FreehandZonePoint[]) {
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

function shouldAddPoint(points: FreehandZonePoint[], nextPoint: L.Point) {
  if (points.length === 0) {
    return true;
  }

  if (points.length >= MAX_FREEHAND_ZONE_POINTS) {
    return false;
  }

  const previous = points[points.length - 1];

  return previous.containerPoint.distanceTo(nextPoint) >= MIN_POINT_DISTANCE_PX;
}

function getClosedCoordinates(points: FreehandZonePoint[]) {
  const coordinates = points.map(
    (point) => [point.latLng.lng, point.latLng.lat] as [number, number],
  );

  if (coordinates.length > 0) {
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];

    if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
      coordinates.push([first[0], first[1]]);
    }
  }

  return coordinates;
}

function createFreehandZoneFeature(
  points: FreehandZonePoint[],
  smoothing: number,
  map: L.Map,
): DroMapFeature {
  const visiblePoints = smoothFreehandZonePoints(points, smoothing, map);
  const feature: DroMapFeature = {
    type: "Feature",
    id: crypto.randomUUID(),
    geometry: {
      type: "Polygon",
      coordinates: [getClosedCoordinates(visiblePoints)],
    },
    properties: {
      type: "zone",
      label: "Zone libre",
      zoneVariant: "freehand",
      style: {
        color: "#111827",
        opacity: 1,
        weight: 3,
        fillColor: "#22c55e",
        fillOpacity: 0.25,
        dashStyle: "solid",
        zoneStrokeEnabled: true,
        zoneFillEnabled: true,
        zoneHatchingStyle: "none",
        zoneHatchingColor: "#111827",
        zoneHatchingWeight: 2,
        zoneHatchingSpacing: 14,
        freehandSmoothing: clampSmoothing(smoothing),
      },
      meta: { version: 1 },
    },
  };

  return applyDrawingPresetToFeature(feature);
}

function createPreviewFeature(
  points: FreehandZonePoint[],
  smoothing: number,
  map: L.Map,
): DroMapFeature {
  return {
    ...createFreehandZoneFeature(points, smoothing, map),
    id: "dromap-freehand-zone-preview",
  };
}

function createPreviewPolygon(feature: DroMapFeature) {
  if (feature.geometry.type !== "Polygon") {
    return null;
  }

  const rings = feature.geometry.coordinates
    .map((ring) =>
      ring.map((coordinate) => L.latLng(coordinate[1], coordinate[0])),
    )
    .filter((ring) => ring.length >= 3);

  if (rings.length === 0) {
    return null;
  }

  const style = feature.properties.style;
  const strokeOpacity = Math.max(
    0,
    Math.min(1, getZoneVisibleStrokeOpacity(feature)) *
      FREEHAND_ZONE_PREVIEW_OPACITY_FACTOR,
  );
  const fillOpacity = Math.max(
    0,
    Math.min(1, getZoneVisibleFillOpacity(feature)) *
      FREEHAND_ZONE_PREVIEW_OPACITY_FACTOR,
  );

  const useAlignedZoneOutline = shouldUseAlignedZoneOutline(feature);

  return L.polygon(rings, {
    color: style.color ?? "#111827",
    opacity: useAlignedZoneOutline ? 0 : strokeOpacity,
    weight: getZoneStrokeEnabled(feature) && !useAlignedZoneOutline ? (style.weight ?? 3) : 0,
    stroke: getZoneStrokeEnabled(feature) && !useAlignedZoneOutline,
    fill: true,
    fillColor: style.fillColor ?? style.color ?? "#22c55e",
    fillOpacity,
    dashArray: useAlignedZoneOutline ? undefined : getLeafletDashArray(feature),
    lineCap: "round",
    lineJoin: "round",
    interactive: false,
    bubblingMouseEvents: false,
  });
}

function addPreviewFeatureToLayerGroup(
  feature: DroMapFeature,
  layerGroup: L.LayerGroup,
  map: L.Map,
) {
  layerGroup.clearLayers();

  const polygon = createPreviewPolygon(feature);

  if (polygon) {
    polygon.addTo(layerGroup);
  }

  const hatchingLayer = createZoneHatchingLeafletLayer(feature, map, L);

  if (hatchingLayer) {
    hatchingLayer.addTo(layerGroup);
  }

  const outlineLayer = createAlignedZoneOutlineLeafletLayer(feature, map, L, undefined, {
    opacityFactor: FREEHAND_ZONE_PREVIEW_OPACITY_FACTOR,
  });

  if (outlineLayer) {
    outlineLayer.addTo(layerGroup);
  }
}

export function FreehandZoneToolLayer() {
  const map = useMap();

  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const activeTool = useEditorTestToolStore((state) => state.activeTool);
  const addFeatureWithHistory = useEditorTestFeaturesStore(
    (state) => state.addFeatureWithHistory,
  );
  const zoneStyle = useEditorTestDrawingOptionsStore(
    (state) => state.zoneStyle,
  );
  const freehandSmoothing = clampSmoothing(zoneStyle.freehandSmoothing);

  useEffect(() => {
    if (currentMode !== "edit" || activeTool !== "freehand-zone") {
      return;
    }

    deactivateGeomanModes(map);
    map.pm.disableDraw();

    const container = map.getContainer();
    const previousCursor = container.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    let isDrawing = false;
    let points: FreehandZonePoint[] = [];
    let previewLayer: L.LayerGroup | null = null;

    const ensurePreviewLayer = () => {
      if (!previewLayer) {
        previewLayer = L.layerGroup().addTo(map);
      }

      return previewLayer;
    };

    const removePreviewLayer = () => {
      if (previewLayer) {
        map.removeLayer(previewLayer);
        previewLayer = null;
      }
    };

    const refreshPreviewLayer = () => {
      if (!isDrawing || points.length < 2) {
        removePreviewLayer();
        return;
      }

      const layerGroup = ensurePreviewLayer();
      const feature = createPreviewFeature(points, freehandSmoothing, map);
      addPreviewFeatureToLayerGroup(feature, layerGroup, map);
    };

    const addPointFromMouseEvent = (event: MouseEvent) => {
      const containerPoint = map.mouseEventToContainerPoint(event);

      if (!shouldAddPoint(points, containerPoint)) {
        return;
      }

      const latLng = map.mouseEventToLatLng(event);
      const nextPoint: FreehandZonePoint = { latLng, containerPoint };

      points = [...points, nextPoint];
      refreshPreviewLayer();
    };

    const finishDrawing = () => {
      if (!isDrawing) {
        return;
      }

      isDrawing = false;
      container.style.cursor = "none";
      document.body.style.userSelect = previousUserSelect;

      document.removeEventListener("mousemove", handleDocumentMouseMove, true);
      document.removeEventListener("mouseup", handleDocumentMouseUp, true);

      const finalPoints = points;
      points = [];
      removePreviewLayer();

      if (
        finalPoints.length < 3 ||
        getTotalPixelDistance(finalPoints) < MIN_FEATURE_DISTANCE_PX
      ) {
        return;
      }

      const feature = createFreehandZoneFeature(
        finalPoints,
        freehandSmoothing,
        map,
      );
      addFeatureWithHistory(feature);
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
      container.style.cursor = "none";
      document.body.style.userSelect = "none";

      points.push({
        latLng: event.latlng,
        containerPoint: map.latLngToContainerPoint(event.latlng),
      });

      document.addEventListener("mousemove", handleDocumentMouseMove, true);
      document.addEventListener("mouseup", handleDocumentMouseUp, true);
    };

    container.style.cursor = "none";
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
    activeTool,
    addFeatureWithHistory,
    currentMode,
    freehandSmoothing,
    map,
    zoneStyle,
  ]);

  return null;
}
