"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMap } from "react-leaflet";

import type { DroMapFeature } from "@/lib/dromap/feature";
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
import { useEditorTestTextEditStore } from "@/stores/editor-test-text-edit";
import {
  getTextFeatureContent,
  getTextFeatureFontSize,
  getTextFeatureRotation,
  measureTextBlock,
} from "./text-rendering";

const HANDLE_SIZE = 34;
const HANDLE_STEM_LENGTH = 38;
const HANDLE_GAP_FROM_TEXT = 5;
const HANDLE_SAFE_PADDING = 56;
const MIN_ROTATION_DRAG_DISTANCE = 10;

type TextPointFeature = DroMapFeature & {
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
};

type PointLike = {
  x: number;
  y: number;
};

function isSelectedTextPointFeature(
  feature: DroMapFeature | undefined,
): feature is TextPointFeature {
  return feature?.properties?.type === "text" && feature.geometry?.type === "Point";
}

function normalizeRotation(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  let nextValue = value;

  while (nextValue > 180) nextValue -= 360;
  while (nextValue < -180) nextValue += 360;

  return Math.round(nextValue);
}

function getTextCenterContainerPoint(map: ReturnType<typeof useMap>, feature: TextPointFeature) {
  const [lng, lat] = feature.geometry.coordinates;

  return map.latLngToContainerPoint([lat, lng]);
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
  }, 350);
}

export function SelectedTextRotationHandle() {
  const map = useMap();
  const [, setViewportVersion] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const cleanupDragRef = useRef<(() => void) | null>(null);
  const wasMapDraggingEnabledRef = useRef(false);

  const isExportPanelOpen = useEditorTestExportStore(
    (state) => state.isExportPanelOpen,
  );
  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const activeTool = useEditorTestToolStore((state) => state.activeTool);
  const selectedFeatureId = useEditorTestSelectionStore(
    (state) => state.selectedFeatureId,
  );
  const editingTextFeatureId = useEditorTestTextEditStore(
    (state) => state.editingTextFeatureId,
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

    map.on("zoomend moveend resize", forceRefresh);

    return () => {
      map.off("zoomend moveend resize", forceRefresh);
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
    isSelectedTextPointFeature(selectedFeature) &&
    editingTextFeatureId !== selectedFeatureId &&
    isFeatureLayerVisible(selectedFeature, layers) &&
    !isFeatureEffectivelyLocked(selectedFeature, layers);

  if (!shouldShowHandle || !isSelectedTextPointFeature(selectedFeature)) {
    return null;
  }

  const rotation = getTextFeatureRotation(selectedFeature);
  const text = getTextFeatureContent(selectedFeature);
  const fontSize = getTextFeatureFontSize(selectedFeature);
  const metrics = measureTextBlock(text, fontSize, {
    minWidth: 56,
    maxWidth: 520,
  });
  const centerPoint = getTextCenterContainerPoint(map, selectedFeature);
  const overlaySize = Math.ceil(
    Math.max(metrics.width, metrics.height) +
      (HANDLE_SAFE_PADDING + HANDLE_STEM_LENGTH + HANDLE_SIZE) * 2,
  );
  const overlayCenter = overlaySize / 2;
  const textTopY = overlayCenter - metrics.height / 2;
  const stemBottomY = textTopY - HANDLE_GAP_FROM_TEXT;
  const stemTopY = stemBottomY - HANDLE_STEM_LENGTH;
  const handleCenterY = stemTopY;

  const updateRotationFromPointer = (
    pointerEvent: PointerEvent | React.PointerEvent<HTMLElement>,
  ) => {
    const latestFeature = useEditorTestFeaturesStore
      .getState()
      .features.find((feature) => feature.id === selectedFeature.id);

    if (
      !isSelectedTextPointFeature(latestFeature) ||
      isFeatureEffectivelyLocked(latestFeature, useEditorTestLayersStore.getState().layers)
    ) {
      return;
    }

    const latestCenterPoint = getTextCenterContainerPoint(map, latestFeature);
    const pointerPoint = getPointerContainerPoint(map, pointerEvent);
    const textRotation = getRotationFromPointerPoint(
      getTextFeatureRotation(latestFeature),
      latestCenterPoint,
      pointerPoint,
    );

    updateFeature(latestFeature.id, {
      ...latestFeature,
      properties: {
        ...latestFeature.properties,
        style: {
          ...(latestFeature.properties?.style ?? {}),
          textRotation,
        },
      },
    });
  };

  const startRotationDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    suppressNextMapClick();

    cleanupDragRef.current?.();
    cleanupDragRef.current = null;

    commitFeaturesHistory();
    setIsDragging(true);
    wasMapDraggingEnabledRef.current = map.dragging.enabled();

    if (wasMapDraggingEnabledRef.current) {
      map.dragging.disable();
    }

    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateRotationFromPointer(event);

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      pointerEvent.preventDefault();
      pointerEvent.stopPropagation();
      updateRotationFromPointer(pointerEvent);
    };

    const stopRotationDrag = (pointerEvent?: PointerEvent) => {
      if (pointerEvent) {
        pointerEvent.preventDefault();
        pointerEvent.stopPropagation();
      }

      suppressNextMapClick();
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", stopRotationDrag);
      document.removeEventListener("pointercancel", stopRotationDrag);

      if (wasMapDraggingEnabledRef.current && !map.dragging.enabled()) {
        map.dragging.enable();
      }

      wasMapDraggingEnabledRef.current = false;
      cleanupDragRef.current = null;
      setIsDragging(false);
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

  return createPortal(
    <div
      aria-hidden="false"
      style={{
        position: "absolute",
        left: `${centerPoint.x}px`,
        top: `${centerPoint.y}px`,
        width: `${overlaySize}px`,
        height: `${overlaySize}px`,
        zIndex: 10000,
        pointerEvents: "none",
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        transformOrigin: "center center",
        userSelect: "none",
      }}
    >
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
        title="Tourner le texte"
        aria-label="Tourner le texte"
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
          left: `${overlayCenter - HANDLE_SIZE / 2}px`,
          top: `${handleCenterY - HANDLE_SIZE / 2}px`,
          display: "flex",
          width: `${HANDLE_SIZE}px`,
          height: `${HANDLE_SIZE}px`,
          alignItems: "center",
          justifyContent: "center",
          border: "3px solid #ffffff",
          borderRadius: "999px",
          background: "#2563eb",
          color: "#ffffff",
          cursor: isDragging ? "grabbing" : "grab",
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
    </div>,
    map.getContainer(),
  );
}
