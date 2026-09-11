"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMap } from "react-leaflet";

import type { DroMapFeature } from "@/lib/dromap/feature";
import { useEditorExportStore } from "@/stores/editor-export";
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
import {
  DROMAP_FEATURE_BODY_DRAG_PREVIEW_EVENT,
  type FeatureBodyDragPreviewDetail,
} from "@/lib/dromap/drag-preview";
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

function getTextCenterContainerPoint(
  map: ReturnType<typeof useMap>,
  feature: TextPointFeature,
  previewOffset: { lat: number; lng: number } = { lat: 0, lng: 0 },
) {
  const [lng, lat] = feature.geometry.coordinates;

  return map.latLngToContainerPoint([
    lat + previewOffset.lat,
    lng + previewOffset.lng,
  ]);
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

export function SelectedTextRotationHandle({
  featureId,
}: {
  featureId?: string;
} = {}) {
  const map = useMap();
  const [, setViewportVersion] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [bodyDragPreviewOffset, setBodyDragPreviewOffset] = useState({
    lat: 0,
    lng: 0,
  });
  const cleanupDragRef = useRef<(() => void) | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const bodyDragPreviewOffsetRef = useRef({ lat: 0, lng: 0 });
  const wasMapDraggingEnabledRef = useRef(false);

  const isExportPanelOpen = useEditorExportStore(
    (state) => state.isExportPanelOpen,
  );
  const currentMode = useEditorModeStore((state) => state.currentMode);
  const activeTool = useEditorToolStore((state) => state.activeTool);
  const storeSelectedFeatureId = useEditorSelectionStore(
    (state) => state.selectedFeatureId,
  );
  const effectiveFeatureId = featureId ?? storeSelectedFeatureId;
  const editingTextFeatureId = useEditorTextEditStore(
    (state) => state.editingTextFeatureId,
  );
  const selectedFeature = useEditorFeaturesStore((state) =>
    state.features.find((feature) => feature.id === effectiveFeatureId),
  );
  const layers = useEditorLayersStore((state) => state.layers);
  const updateFeature = useEditorFeaturesStore((state) => state.updateFeature);
  const commitFeaturesHistory = useEditorFeaturesStore(
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
    bodyDragPreviewOffsetRef.current = { lat: 0, lng: 0 };
    setBodyDragPreviewOffset({ lat: 0, lng: 0 });

    const handleBodyDragPreview = (event: Event) => {
      const detail = (event as CustomEvent<FeatureBodyDragPreviewDetail>).detail;

      if (
        !effectiveFeatureId ||
        detail?.featureId !== effectiveFeatureId ||
        !Number.isFinite(detail.latDelta) ||
        !Number.isFinite(detail.lngDelta)
      ) {
        return;
      }

      const nextOffset = {
        lat: bodyDragPreviewOffsetRef.current.lat + detail.latDelta,
        lng: bodyDragPreviewOffsetRef.current.lng + detail.lngDelta,
      };
      bodyDragPreviewOffsetRef.current = nextOffset;

      // Mettre la poignée à jour directement dans le DOM sur CHAQUE événement
      // de drag. Un setState React seul peut être regroupé pendant un drag
      // Leaflet rapide et donnait l'impression que la poignée ne suivait
      // qu'au relâchement.
      const overlay = overlayRef.current;
      if (overlay) {
        const containerDeltaX = detail.containerDeltaX;
        const containerDeltaY = detail.containerDeltaY;
        if (
          typeof containerDeltaX === "number" &&
          Number.isFinite(containerDeltaX) &&
          typeof containerDeltaY === "number" &&
          Number.isFinite(containerDeltaY)
        ) {
          const currentLeft = Number.parseFloat(overlay.style.left);
          const currentTop = Number.parseFloat(overlay.style.top);
          if (Number.isFinite(currentLeft) && Number.isFinite(currentTop)) {
            overlay.style.left = `${currentLeft + containerDeltaX}px`;
            overlay.style.top = `${currentTop + containerDeltaY}px`;
          }
        }

        let point: { x: number; y: number } | null = null;
        const hasScreenDelta =
          typeof containerDeltaX === "number" &&
          Number.isFinite(containerDeltaX) &&
          typeof containerDeltaY === "number" &&
          Number.isFinite(containerDeltaY);
        const sourceLayer = detail.sourceLayer as {
          getLatLng?: () => { lat?: number; lng?: number };
        };
        const sourceLatLng = sourceLayer?.getLatLng?.();
        if (
          !hasScreenDelta &&
          typeof sourceLatLng?.lat === "number" &&
          Number.isFinite(sourceLatLng.lat) &&
          typeof sourceLatLng?.lng === "number" &&
          Number.isFinite(sourceLatLng.lng)
        ) {
          point = map.latLngToContainerPoint([sourceLatLng.lat, sourceLatLng.lng]);
        } else if (!hasScreenDelta) {
          const latestFeature = useEditorFeaturesStore
            .getState()
            .features.find((feature) => feature.id === effectiveFeatureId);
          if (isSelectedTextPointFeature(latestFeature)) {
            point = getTextCenterContainerPoint(map, latestFeature, nextOffset);
          }
        }

        if (point) {
          overlay.style.left = `${point.x}px`;
          overlay.style.top = `${point.y}px`;
        }
      }

      setBodyDragPreviewOffset(nextOffset);
    };

    const resetBodyDragPreview = (event: Event) => {
      const detail = (event as CustomEvent<{ featureId?: string | null }>).detail;
      if (detail?.featureId !== effectiveFeatureId) return;
      bodyDragPreviewOffsetRef.current = { lat: 0, lng: 0 };
      setBodyDragPreviewOffset({ lat: 0, lng: 0 });
      setViewportVersion((value) => value + 1);
    };

    window.addEventListener(
      DROMAP_FEATURE_BODY_DRAG_PREVIEW_EVENT,
      handleBodyDragPreview,
    );
    window.addEventListener("dromap:feature-drag-start", resetBodyDragPreview);
    window.addEventListener("dromap:feature-drag-end", resetBodyDragPreview);

    return () => {
      window.removeEventListener(
        DROMAP_FEATURE_BODY_DRAG_PREVIEW_EVENT,
        handleBodyDragPreview,
      );
      window.removeEventListener(
        "dromap:feature-drag-start",
        resetBodyDragPreview,
      );
      window.removeEventListener(
        "dromap:feature-drag-end",
        resetBodyDragPreview,
      );
    };
  }, [effectiveFeatureId, map]);

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
    editingTextFeatureId !== effectiveFeatureId &&
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
  const centerPoint = getTextCenterContainerPoint(
    map,
    selectedFeature,
    bodyDragPreviewOffset,
  );
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
    const latestFeature = useEditorFeaturesStore
      .getState()
      .features.find((feature) => feature.id === selectedFeature.id);

    if (
      !isSelectedTextPointFeature(latestFeature) ||
      isFeatureEffectivelyLocked(latestFeature, useEditorLayersStore.getState().layers)
    ) {
      return;
    }

    const latestCenterPoint = getTextCenterContainerPoint(
      map,
      latestFeature,
      bodyDragPreviewOffset,
    );
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
      ref={overlayRef}
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
