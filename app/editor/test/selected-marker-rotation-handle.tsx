"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMap } from "react-leaflet";

import type { DroMapFeature } from "@/lib/dromap/feature";
import { getFeatureVisualScale } from "@/lib/dromap/feature-visual-scale";
import { useEditorTestExportStore } from "@/stores/editor-test-export";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import {
  isFeatureEffectivelyLocked,
  isFeatureLayerVisible,
  useEditorTestLayersStore,
} from "@/stores/editor-test-layers";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { useEditorTestToolStore } from "@/stores/editor-test-tool";
import { getFeatureMarkerSize } from "./feature-style";
import {
  getFeatureMarkerRotation,
  isRotatableCustomMarkerFeature,
} from "./marker-symbol";

const HANDLE_SIZE = 20;
const HANDLE_STEM = 24;
const HANDLE_GAP = 5;
const SAFE_PADDING = 32;

type MarkerPointFeature = DroMapFeature & {
  geometry: { type: "Point"; coordinates: [number, number] };
};

function isRotatableMarkerPointFeature(
  feature: DroMapFeature | undefined,
): feature is MarkerPointFeature {
  return Boolean(
    feature?.properties.type === "marker" &&
    feature.geometry.type === "Point" &&
    isRotatableCustomMarkerFeature(feature),
  );
}

function normalizeRotation(value: number) {
  let rotation = Number.isFinite(value) ? value : 0;
  while (rotation > 180) rotation -= 360;
  while (rotation < -180) rotation += 360;
  return Math.round(rotation);
}

function suppressNextMapClick() {
  const win = window as Window & { dromapSuppressNextClick?: boolean };
  win.dromapSuppressNextClick = true;
  window.setTimeout(() => {
    win.dromapSuppressNextClick = false;
  }, 350);
}

export function SelectedMarkerRotationHandle() {
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
  const workspaceBasemapZoom = useEditorTestWorkspaceStore(
    (state) => state.workspaceBasemapZoom,
  );
  const selectedFeatureId = useEditorTestSelectionStore(
    (state) => state.selectedFeatureId,
  );
  const selectedFeature = useEditorTestFeaturesStore((state) =>
    state.features.find((feature) => feature.id === selectedFeatureId),
  );
  const updateFeature = useEditorTestFeaturesStore(
    (state) => state.updateFeature,
  );
  const commitFeaturesHistory = useEditorTestFeaturesStore(
    (state) => state.commitFeaturesHistory,
  );
  const layers = useEditorTestLayersStore((state) => state.layers);

  useEffect(() => {
    const refresh = () => setViewportVersion((value) => value + 1);
    map.on("zoom move zoomend moveend resize", refresh);
    return () => {
      map.off("zoom move zoomend moveend resize", refresh);
    };
  }, [map]);

  useEffect(() => {
    return () => {
      cleanupDragRef.current?.();
      if (wasMapDraggingEnabledRef.current && !map.dragging.enabled()) {
        map.dragging.enable();
      }
    };
  }, [map]);

  const shouldShow =
    !isExportPanelOpen &&
    currentMode === "edit" &&
    (activeTool === "select" || activeTool === "edit") &&
    isRotatableMarkerPointFeature(selectedFeature) &&
    isFeatureLayerVisible(selectedFeature, layers) &&
    !isFeatureEffectivelyLocked(selectedFeature, layers);

  if (!shouldShow || !isRotatableMarkerPointFeature(selectedFeature)) {
    return null;
  }

  const [lng, lat] = selectedFeature.geometry.coordinates;
  const center = map.latLngToContainerPoint([lat, lng]);
  const fallbackReferenceZoom =
    typeof workspaceBasemapZoom === "number" &&
    Number.isFinite(workspaceBasemapZoom)
      ? workspaceBasemapZoom
      : map.getZoom();
  const markerSize =
    getFeatureMarkerSize(selectedFeature) *
    getFeatureVisualScale(
      selectedFeature,
      map.getZoom(),
      fallbackReferenceZoom,
    );
  const rotation = getFeatureMarkerRotation(selectedFeature);
  const overlaySize =
    markerSize + (SAFE_PADDING + HANDLE_STEM + HANDLE_SIZE) * 2;
  const overlayCenter = overlaySize / 2;
  const markerTop = overlayCenter - markerSize / 2;
  const stemBottom = markerTop - HANDLE_GAP;
  const handleY = stemBottom - HANDLE_STEM;

  const updateRotation = (
    event: PointerEvent | React.PointerEvent<HTMLButtonElement>,
  ) => {
    const latest = useEditorTestFeaturesStore
      .getState()
      .features.find((feature) => feature.id === selectedFeature.id);
    if (
      !isRotatableMarkerPointFeature(latest) ||
      isFeatureEffectivelyLocked(
        latest,
        useEditorTestLayersStore.getState().layers,
      )
    ) {
      return;
    }

    const [latestLng, latestLat] = latest.geometry.coordinates;
    const latestCenter = map.latLngToContainerPoint([latestLat, latestLng]);
    const rect = map.getContainer().getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const dx = pointerX - latestCenter.x;
    const dy = pointerY - latestCenter.y;
    if (Math.hypot(dx, dy) < 8) return;

    const markerRotation = normalizeRotation(
      (Math.atan2(dx, -dy) * 180) / Math.PI,
    );
    updateFeature(latest.id, {
      ...latest,
      properties: {
        ...latest.properties,
        style: {
          ...latest.properties.style,
          markerRotation,
        },
      },
    });
  };

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    suppressNextMapClick();
    cleanupDragRef.current?.();
    commitFeaturesHistory();
    setIsDragging(true);
    wasMapDraggingEnabledRef.current = map.dragging.enabled();
    if (wasMapDraggingEnabledRef.current) map.dragging.disable();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateRotation(event);

    const onMove = (pointerEvent: PointerEvent) => {
      pointerEvent.preventDefault();
      pointerEvent.stopPropagation();
      updateRotation(pointerEvent);
    };
    const stop = (pointerEvent?: PointerEvent) => {
      pointerEvent?.preventDefault();
      pointerEvent?.stopPropagation();
      suppressNextMapClick();
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", stop);
      document.removeEventListener("pointercancel", stop);
      if (wasMapDraggingEnabledRef.current && !map.dragging.enabled()) {
        map.dragging.enable();
      }
      wasMapDraggingEnabledRef.current = false;
      cleanupDragRef.current = null;
      setIsDragging(false);
    };
    cleanupDragRef.current = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", stop);
      document.removeEventListener("pointercancel", stop);
    };
    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", stop, { passive: false });
    document.addEventListener("pointercancel", stop, { passive: false });
  };

  return createPortal(
    <div
      style={{
        position: "absolute",
        left: `${center.x}px`,
        top: `${center.y}px`,
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
          left: `${overlayCenter - 1}px`,
          top: `${handleY}px`,
          width: "2px",
          height: `${HANDLE_STEM}px`,
          borderRadius: "999px",
          background: "#2563eb",
          boxShadow: "0 1px 3px rgba(15,23,42,0.30)",
        }}
      />
      <button
        type="button"
        title="Tourner le marqueur"
        aria-label="Tourner le marqueur"
        onPointerDown={startDrag}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          suppressNextMapClick();
        }}
        style={{
          position: "absolute",
          left: `${overlayCenter - HANDLE_SIZE / 2}px`,
          top: `${handleY - HANDLE_SIZE / 2}px`,
          display: "flex",
          width: `${HANDLE_SIZE}px`,
          height: `${HANDLE_SIZE}px`,
          alignItems: "center",
          justifyContent: "center",
          border: "2px solid #ffffff",
          borderRadius: "999px",
          background: "#2563eb",
          color: "#ffffff",
          cursor: isDragging ? "grabbing" : "grab",
          boxShadow: "0 3px 9px rgba(15,23,42,0.32)",
          pointerEvents: "auto",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="none"
          style={{ transform: `rotate(${-rotation}deg)` }}
        >
          <path
            d="M20 12A8 8 0 1 1 17.66 6.34"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M20 4V10H14"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>,
    map.getContainer(),
  );
}
