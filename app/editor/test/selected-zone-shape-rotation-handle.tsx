"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMap } from "react-leaflet";

import {
  isQuickShapeZoneFeature,
  type DroMapFeature,
} from "@/lib/dromap/feature";
import { useEditorTestExportStore } from "@/stores/editor-test-export";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import {
  isFeatureEffectivelyLocked,
  isFeatureLayerVisible,
  useEditorTestLayersStore,
} from "@/stores/editor-test-layers";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { useEditorTestToolStore } from "@/stores/editor-test-tool";
import {
  getQuickShapeKind,
  getQuickShapeRotation,
  resizeQuickShapeFeatureFromMapPointer,
  rotateQuickShapeFeature,
  type QuickShapeRectangleResizeHandle,
  type QuickShapeResizeHandle,
} from "./quick-shape";

const ROTATION_HANDLE_SIZE = 34;
const RESIZE_HANDLE_SIZE = 18;
const HANDLE_STEM_LENGTH = 38;
const HANDLE_GAP_FROM_SHAPE = 5;
const HANDLE_SAFE_PADDING = 82;
const MIN_ROTATION_DRAG_DISTANCE = 10;

type PointLike = {
  x: number;
  y: number;
};

type ShapeMetrics = {
  center: PointLike;
  width: number;
  height: number;
};

type DragMode = "rotation" | "resize" | null;

function normalizeRotation(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  let nextValue = value;

  while (nextValue > 180) nextValue -= 360;
  while (nextValue < -180) nextValue += 360;

  return Math.round(nextValue);
}

function rotatePoint(point: PointLike, rotation: number): PointLike {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

function getShapeMetrics(
  map: ReturnType<typeof useMap>,
  feature: DroMapFeature,
): ShapeMetrics | null {
  if (!isQuickShapeZoneFeature(feature) || feature.geometry.type !== "Polygon") {
    return null;
  }

  const ring = feature.geometry.coordinates[0] ?? [];
  const openRing = ring.length > 1 ? ring.slice(0, -1) : ring;

  if (openRing.length === 0) {
    return null;
  }

  const projectedPoints = openRing.map(([lng, lat]) =>
    map.latLngToContainerPoint([lat, lng]),
  );
  const center = projectedPoints.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
    }),
    { x: 0, y: 0 },
  );

  center.x /= projectedPoints.length;
  center.y /= projectedPoints.length;

  const kind = getQuickShapeKind(feature);
  const rotation = kind === "circle" ? 0 : getQuickShapeRotation(feature);
  let maxX = 0;
  let maxY = 0;

  for (const point of projectedPoints) {
    const localPoint = rotatePoint(
      {
        x: point.x - center.x,
        y: point.y - center.y,
      },
      -rotation,
    );

    maxX = Math.max(maxX, Math.abs(localPoint.x));
    maxY = Math.max(maxY, Math.abs(localPoint.y));
  }

  const width = Math.max(24, maxX * 2);

  return {
    center,
    width,
    height: kind === "circle" ? width : Math.max(24, maxY * 2),
  };
}

function getPointerContainerPoint(
  map: ReturnType<typeof useMap>,
  event: PointerEvent | React.PointerEvent<HTMLElement>,
): PointLike {
  const rect = map.getContainer().getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function getRotationFromPointerPoint(
  currentRotation: number,
  centerPoint: PointLike,
  pointerPoint: PointLike,
) {
  const deltaX = pointerPoint.x - centerPoint.x;
  const deltaY = pointerPoint.y - centerPoint.y;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

  if (distance < MIN_ROTATION_DRAG_DISTANCE) {
    return currentRotation;
  }

  return normalizeRotation((Math.atan2(deltaX, -deltaY) * 180) / Math.PI);
}

function suppressNextMapClick() {
  const win = window as Window & { dromapSuppressNextClick?: boolean };

  win.dromapSuppressNextClick = true;

  window.setTimeout(() => {
    win.dromapSuppressNextClick = false;
  }, 650);
}

function getRectangleResizeHandlePositions(width: number, height: number) {
  return [
    { id: "nw" as const, x: -width / 2, y: -height / 2, cursor: "nwse-resize" },
    { id: "ne" as const, x: width / 2, y: -height / 2, cursor: "nesw-resize" },
    { id: "se" as const, x: width / 2, y: height / 2, cursor: "nwse-resize" },
    { id: "sw" as const, x: -width / 2, y: height / 2, cursor: "nesw-resize" },
  ];
}

function getEllipseResizeHandlePosition(width: number, height: number) {
  return {
    id: "ellipse" as const,
    x: width / (2 * Math.SQRT2),
    y: height / (2 * Math.SQRT2),
    cursor: "nwse-resize",
  };
}

function getCircleResizeHandlePosition(width: number) {
  return {
    id: "circle" as const,
    x: width / 2,
    y: 0,
    cursor: "ew-resize",
  };
}

function ResizeHandleButton({
  id,
  x,
  y,
  cursor,
  overlayCenter,
  onPointerDown,
}: {
  id: QuickShapeResizeHandle;
  x: number;
  y: number;
  cursor: string;
  overlayCenter: number;
  onPointerDown: (
    handle: QuickShapeResizeHandle,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void;
}) {
  return (
    <button
      type="button"
      title="Redimensionner la forme"
      aria-label="Redimensionner la forme"
      draggable={false}
      data-dromap-resize-handle={id}
      onDragStart={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        suppressNextMapClick();
      }}
      onPointerDown={(event) => onPointerDown(id, event)}
      style={{
        position: "absolute",
        left: `${overlayCenter + x - RESIZE_HANDLE_SIZE / 2}px`,
        top: `${overlayCenter + y - RESIZE_HANDLE_SIZE / 2}px`,
        width: `${RESIZE_HANDLE_SIZE}px`,
        height: `${RESIZE_HANDLE_SIZE}px`,
        border: "3px solid #ffffff",
        borderRadius: "999px",
        background: "#2563eb",
        boxShadow: "0 3px 9px rgba(15,23,42,0.34)",
        cursor,
        pointerEvents: "auto",
        touchAction: "none",
        userSelect: "none",
      }}
    />
  );
}

export function SelectedZoneShapeRotationHandle() {
  const map = useMap();
  const [, setViewportVersion] = useState(0);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const cleanupDragRef = useRef<(() => void) | null>(null);
  const wasMapDraggingEnabledRef = useRef(false);
  const rotationDragSpecRef = useRef<{
    centerPoint: PointLike;
    width: number;
    height: number;
  } | null>(null);

  const isExportPanelOpen = useEditorTestExportStore(
    (state) => state.isExportPanelOpen,
  );
  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const activeTool = useEditorTestToolStore((state) => state.activeTool);
  const setActiveTool = useEditorTestToolStore((state) => state.setActiveTool);
  const selectedFeatureId = useEditorTestSelectionStore(
    (state) => state.selectedFeatureId,
  );
  const setSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.setSelectedFeatureId,
  );
  const selectedFeature = useEditorTestFeaturesStore((state) =>
    state.features.find((feature) => feature.id === selectedFeatureId),
  );
  const layers = useEditorTestLayersStore((state) => state.layers);
  const updateFeature = useEditorTestFeaturesStore((state) => state.updateFeature);
  const commitFeaturesHistory = useEditorTestFeaturesStore(
    (state) => state.commitFeaturesHistory,
  );

  useEffect(() => {
    const forceRefresh = () => {
      setViewportVersion((value) => value + 1);
    };

    map.on("zoom move resize", forceRefresh);

    return () => {
      map.off("zoom move resize", forceRefresh);
    };
  }, [map]);

  useEffect(() => {
    return () => {
      cleanupDragRef.current?.();
      cleanupDragRef.current = null;

      if (wasMapDraggingEnabledRef.current && !map.dragging.enabled()) {
        map.dragging.enable();
      }
    };
  }, [map]);

  const shouldShowHandle =
    !isExportPanelOpen &&
    currentMode === "edit" &&
    (activeTool === "select" || activeTool === "edit") &&
    selectedFeature !== undefined &&
    isFeatureLayerVisible(selectedFeature, layers) &&
    !isFeatureEffectivelyLocked(selectedFeature, layers) &&
    isQuickShapeZoneFeature(selectedFeature);

  if (!shouldShowHandle || !selectedFeature || !isQuickShapeZoneFeature(selectedFeature)) {
    return null;
  }

  const kind = getQuickShapeKind(selectedFeature);
  const rotation = kind === "circle" ? 0 : getQuickShapeRotation(selectedFeature);
  const metrics = getShapeMetrics(map, selectedFeature);

  if (!metrics) {
    return null;
  }

  const overlaySize = Math.ceil(
    Math.max(metrics.width, metrics.height) +
      (HANDLE_SAFE_PADDING + HANDLE_STEM_LENGTH + ROTATION_HANDLE_SIZE) * 2,
  );
  const overlayCenter = overlaySize / 2;
  const shapeTopY = overlayCenter - metrics.height / 2;
  const stemBottomY = shapeTopY - HANDLE_GAP_FROM_SHAPE;
  const stemTopY = stemBottomY - HANDLE_STEM_LENGTH;
  const handleCenterY = stemTopY;

  const updateRotationFromPointer = (
    pointerEvent: PointerEvent | React.PointerEvent<HTMLElement>,
  ) => {
    const latestFeature = useEditorTestFeaturesStore
      .getState()
      .features.find((feature) => feature.id === selectedFeature.id);

    if (
      !latestFeature ||
      isFeatureEffectivelyLocked(latestFeature, useEditorTestLayersStore.getState().layers) ||
      !isQuickShapeZoneFeature(latestFeature)
    ) {
      return;
    }

    if (getQuickShapeKind(latestFeature) === "circle") {
      return;
    }

    const latestMetrics = getShapeMetrics(map, latestFeature);

    if (!latestMetrics) {
      return;
    }

    const pointerPoint = getPointerContainerPoint(map, pointerEvent);
    const zoneShapeRotation = getRotationFromPointerPoint(
      getQuickShapeRotation(latestFeature),
      latestMetrics.center,
      pointerPoint,
    );

    updateFeature(
      latestFeature.id,
      rotateQuickShapeFeature({
        map,
        feature: latestFeature,
        rotation: zoneShapeRotation,
        metrics: rotationDragSpecRef.current ?? undefined,
      }),
    );
  };

  const updateResizeFromPointer = (
    handle: QuickShapeResizeHandle,
    pointerEvent: PointerEvent | React.PointerEvent<HTMLElement>,
  ) => {
    const latestFeature = useEditorTestFeaturesStore
      .getState()
      .features.find((feature) => feature.id === selectedFeature.id);

    if (
      !latestFeature ||
      isFeatureEffectivelyLocked(latestFeature, useEditorTestLayersStore.getState().layers) ||
      !isQuickShapeZoneFeature(latestFeature)
    ) {
      return;
    }

    const pointerPoint = getPointerContainerPoint(map, pointerEvent);

    updateFeature(
      latestFeature.id,
      resizeQuickShapeFeatureFromMapPointer({
        map,
        feature: latestFeature,
        handle,
        pointerPoint,
      }),
    );
  };

  const prepareDrag = () => {
    cleanupDragRef.current?.();
    cleanupDragRef.current = null;

    commitFeaturesHistory();
    wasMapDraggingEnabledRef.current = map.dragging.enabled();

    if (wasMapDraggingEnabledRef.current) {
      map.dragging.disable();
    }
  };

  const keepSelectedAfterDrag = (featureId: string) => {
    setSelectedFeatureId(featureId);

    window.setTimeout(() => {
      useEditorTestSelectionStore.getState().setSelectedFeatureId(featureId);
    }, 0);

    window.setTimeout(() => {
      useEditorTestSelectionStore.getState().setSelectedFeatureId(featureId);
    }, 120);
  };

  const finishDrag = (pointerEvent?: PointerEvent) => {
    if (pointerEvent) {
      pointerEvent.preventDefault();
      pointerEvent.stopPropagation();
    }

    suppressNextMapClick();

    if (wasMapDraggingEnabledRef.current && !map.dragging.enabled()) {
      map.dragging.enable();
    }

    wasMapDraggingEnabledRef.current = false;
    rotationDragSpecRef.current = null;
    cleanupDragRef.current?.();
    cleanupDragRef.current = null;
    setDragMode(null);
    setActiveTool("select");
    keepSelectedAfterDrag(selectedFeature.id);
  };

  const startRotationDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    suppressNextMapClick();

    prepareDrag();

    const startMetrics = getShapeMetrics(map, selectedFeature);
    rotationDragSpecRef.current = startMetrics
      ? {
          centerPoint: { ...startMetrics.center },
          width: startMetrics.width,
          height: startMetrics.height,
        }
      : null;

    setDragMode("rotation");
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateRotationFromPointer(event);

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      pointerEvent.preventDefault();
      pointerEvent.stopPropagation();
      updateRotationFromPointer(pointerEvent);
    };

    const stopRotationDrag = (pointerEvent?: PointerEvent) => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", stopRotationDrag);
      document.removeEventListener("pointercancel", stopRotationDrag);
      finishDrag(pointerEvent);
    };

    cleanupDragRef.current = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", stopRotationDrag);
      document.removeEventListener("pointercancel", stopRotationDrag);
    };

    document.addEventListener("pointermove", handlePointerMove, { passive: false });
    document.addEventListener("pointerup", stopRotationDrag, { passive: false });
    document.addEventListener("pointercancel", stopRotationDrag, { passive: false });
  };

  const startResizeDrag = (
    handle: QuickShapeResizeHandle,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    suppressNextMapClick();

    prepareDrag();
    setDragMode("resize");
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateResizeFromPointer(handle, event);

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      pointerEvent.preventDefault();
      pointerEvent.stopPropagation();
      updateResizeFromPointer(handle, pointerEvent);
    };

    const stopResizeDrag = (pointerEvent?: PointerEvent) => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", stopResizeDrag);
      document.removeEventListener("pointercancel", stopResizeDrag);
      finishDrag(pointerEvent);
    };

    cleanupDragRef.current = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", stopResizeDrag);
      document.removeEventListener("pointercancel", stopResizeDrag);
    };

    document.addEventListener("pointermove", handlePointerMove, { passive: false });
    document.addEventListener("pointerup", stopResizeDrag, { passive: false });
    document.addEventListener("pointercancel", stopResizeDrag, { passive: false });
  };

  const resizeHandles = kind === "rectangle"
    ? getRectangleResizeHandlePositions(metrics.width, metrics.height)
    : kind === "ellipse"
      ? [getEllipseResizeHandlePosition(metrics.width, metrics.height)]
      : [getCircleResizeHandlePosition(metrics.width)];

  return createPortal(
    <div
      aria-hidden="false"
      style={{
        position: "absolute",
        left: `${metrics.center.x}px`,
        top: `${metrics.center.y}px`,
        width: `${overlaySize}px`,
        height: `${overlaySize}px`,
        zIndex: 10000,
        pointerEvents: "none",
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        transformOrigin: "center center",
        userSelect: "none",
      }}
    >
      {resizeHandles.map((handle) => (
        <ResizeHandleButton
          key={handle.id}
          id={handle.id}
          x={handle.x}
          y={handle.y}
          cursor={dragMode === "resize" ? "grabbing" : handle.cursor}
          overlayCenter={overlayCenter}
          onPointerDown={startResizeDrag}
        />
      ))}

      {kind !== "circle" ? (
        <>
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              left: `${overlayCenter - 1.5}px`,
              top: `${stemTopY}px`,
              width: "3px",
              height: `${HANDLE_STEM_LENGTH}px`,
              borderRadius: "999px",
              background: "#2563eb",
              boxShadow: "0 1px 3px rgba(15,23,42,0.30)",
              pointerEvents: "none",
            }}
          />

          <button
            type="button"
            title="Tourner la forme"
            aria-label="Tourner la forme"
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              suppressNextMapClick();
            }}
            onPointerDown={startRotationDrag}
            style={{
              position: "absolute",
              left: `${overlayCenter - ROTATION_HANDLE_SIZE / 2}px`,
              top: `${handleCenterY - ROTATION_HANDLE_SIZE / 2}px`,
              display: "flex",
              width: `${ROTATION_HANDLE_SIZE}px`,
              height: `${ROTATION_HANDLE_SIZE}px`,
              alignItems: "center",
              justifyContent: "center",
              border: "3px solid #ffffff",
              borderRadius: "999px",
              background: "#2563eb",
              color: "#ffffff",
              cursor: dragMode === "rotation" ? "grabbing" : "grab",
              fontSize: "19px",
              fontWeight: 900,
              lineHeight: 1,
              boxShadow: "0 5px 14px rgba(15,23,42,0.35)",
              pointerEvents: "auto",
              touchAction: "none",
              userSelect: "none",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "flex",
                width: "18px",
                height: "18px",
                alignItems: "center",
                justifyContent: "center",
                transform: `rotate(${-rotation}deg)`,
                transformOrigin: "center center",
                pointerEvents: "none",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ display: "block", overflow: "visible" }}
              >
                <path
                  d="M20 12A8 8 0 1 1 17.66 6.34"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M20 4V10H14"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
        </>
      ) : null}
    </div>,
    map.getContainer(),
  );
}
