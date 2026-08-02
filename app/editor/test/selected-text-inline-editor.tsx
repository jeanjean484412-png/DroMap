"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMap } from "react-leaflet";

import type { DroMapFeature } from "@/lib/dromap/feature";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import {
  isFeatureEffectivelyLocked,
  isFeatureLayerVisible,
  useEditorTestLayersStore,
} from "@/stores/editor-test-layers";
import { useEditorTestTextEditStore } from "@/stores/editor-test-text-edit";
import {
  getTextBackgroundColor,
  getTextBackgroundEnabled,
  getTextBackgroundOpacity,
  getTextBorderColor,
  getTextBorderEnabled,
  getTextBorderWidth,
  getTextFeatureBold,
  getTextFeatureFontSize,
  getTextFeatureItalic,
  getTextFeatureReferenceZoom,
  getTextFeatureRotation,
  getTextMapZoomScale,
  hexToRgba,
  measureTextBlock,
} from "./text-rendering";

type TextPointFeature = DroMapFeature & {
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
};

function isTextPointFeature(
  feature: DroMapFeature | undefined,
): feature is TextPointFeature {
  return feature?.properties.type === "text" && feature.geometry.type === "Point";
}

export function SelectedTextInlineEditor() {
  const map = useMap();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const finishingRef = useRef(false);
  const [draftValue, setDraftValue] = useState("");
  const [viewportRevision, setViewportRevision] = useState(0);

  const editingTextFeatureId = useEditorTestTextEditStore(
    (state) => state.editingTextFeatureId,
  );
  const stopEditingTextFeature = useEditorTestTextEditStore(
    (state) => state.stopEditingTextFeature,
  );
  const feature = useEditorTestFeaturesStore((state) =>
    state.features.find((candidate) => candidate.id === editingTextFeatureId),
  );
  const layers = useEditorTestLayersStore((state) => state.layers);
  const updateFeatureWithHistory = useEditorTestFeaturesStore(
    (state) => state.updateFeatureWithHistory,
  );

  useEffect(() => {
    const refresh = () => setViewportRevision((revision) => revision + 1);

    map.on("zoom move resize", refresh);

    return () => {
      map.off("zoom move resize", refresh);
    };
  }, [map]);

  useEffect(() => {
    if (!editingTextFeatureId || !isTextPointFeature(feature)) {
      return;
    }

    finishingRef.current = false;
    setDraftValue(feature.properties.label ?? "");

    const animationFrameId = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    });

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [editingTextFeatureId, feature?.id]);

  useEffect(() => {
    if (!editingTextFeatureId) {
      return;
    }

    if (
      !isTextPointFeature(feature) ||
      !isFeatureLayerVisible(feature, layers) ||
      isFeatureEffectivelyLocked(feature, layers)
    ) {
      stopEditingTextFeature();
    }
  }, [editingTextFeatureId, feature, layers, stopEditingTextFeature]);

  const editorGeometry = useMemo(() => {
    if (!isTextPointFeature(feature)) {
      return null;
    }

    const [lng, lat] = feature.geometry.coordinates;
    const centerPoint = map.latLngToContainerPoint([lat, lng]);
    const referenceZoom = getTextFeatureReferenceZoom(feature, map.getZoom());
    const mapScale = getTextMapZoomScale(map.getZoom(), referenceZoom);
    const baseFontSize = getTextFeatureFontSize(feature);
    const metrics = measureTextBlock(
      draftValue || "Texte",
      baseFontSize * mapScale,
      {
        minWidth: 72,
        maxWidth: 4096,
      },
    );

    return {
      centerPoint,
      mapScale,
      metrics,
      rotation: getTextFeatureRotation(feature),
    };
  }, [draftValue, feature, map, viewportRevision]);

  if (!isTextPointFeature(feature) || !editorGeometry) {
    return null;
  }

  const finishEditing = (save: boolean) => {
    if (finishingRef.current) {
      return;
    }

    finishingRef.current = true;

    if (save && draftValue !== (feature.properties.label ?? "")) {
      updateFeatureWithHistory(feature.id, (currentFeature) => ({
        ...currentFeature,
        properties: {
          ...currentFeature.properties,
          label: draftValue,
        },
      }));
    }

    stopEditingTextFeature();
  };

  const style = feature.properties.style ?? {};
  const hasBackground = getTextBackgroundEnabled(feature);
  const hasBorder = getTextBorderEnabled(feature);
  const background = hasBackground
    ? hexToRgba(
        getTextBackgroundColor(feature),
        getTextBackgroundOpacity(feature),
      )
    : "rgba(255,255,255,0.94)";
  const border = hasBorder
    ? `${Math.max(1, getTextBorderWidth(feature) * editorGeometry.mapScale)}px solid ${getTextBorderColor(feature)}`
    : "1px solid rgba(37,99,235,0.85)";

  return createPortal(
    <textarea
      ref={textareaRef}
      aria-label="Modifier le texte directement sur la carte"
      value={draftValue}
      onChange={(event) => setDraftValue(event.target.value)}
      onBlur={() => finishEditing(true)}
      onKeyDown={(event) => {
        event.stopPropagation();

        if (event.key === "Escape") {
          event.preventDefault();
          finishEditing(false);
          return;
        }

        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          finishEditing(true);
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      spellCheck
      style={{
        position: "absolute",
        left: `${editorGeometry.centerPoint.x}px`,
        top: `${editorGeometry.centerPoint.y}px`,
        zIndex: 11000,
        boxSizing: "border-box",
        width: `${Math.max(72, editorGeometry.metrics.width)}px`,
        height: `${Math.max(38, editorGeometry.metrics.height)}px`,
        resize: "none",
        overflow: "hidden",
        padding: `${7 * editorGeometry.mapScale}px ${12 * editorGeometry.mapScale}px`,
        border,
        borderRadius: "4px",
        outline: "3px solid rgba(37,99,235,0.28)",
        outlineOffset: "2px",
        background,
        color: style.color ?? "#111827",
        opacity: style.opacity ?? 1,
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: `${editorGeometry.metrics.fontSize}px`,
        fontWeight: getTextFeatureBold(feature) ? 700 : 400,
        fontStyle: getTextFeatureItalic(feature) ? "italic" : "normal",
        lineHeight: `${editorGeometry.metrics.lineHeight}px`,
        textAlign: "center",
        whiteSpace: "pre",
        transform: `translate(-50%, -50%) rotate(${editorGeometry.rotation}deg)`,
        transformOrigin: "center center",
        userSelect: "text",
      }}
    />,
    map.getContainer(),
  );
}
