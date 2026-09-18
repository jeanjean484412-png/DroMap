"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import type { DroMapFeature } from "@/lib/dromap/feature";
import { createCurvedLineCoordinates, getCurvedLineHandles, isCurvedLineFeature } from "@/lib/dromap/curved-line";
import { useEditorFeaturesStore } from "@/stores/editor-features";
import { useEditorModeStore } from "@/stores/editor-mode";
import { useEditorToolStore } from "@/stores/editor-tool";
import { useEditorSelectionStore } from "@/stores/editor-selection";
import { useEditorExportStore } from "@/stores/editor-export";
import { isFeatureEffectivelyLocked, isFeatureLayerVisible, useEditorLayersStore } from "@/stores/editor-layers";
import { applyDrawingPresetToFeature } from "@/stores/editor-drawing-options";

const coordinate = (point: L.LatLng): [number, number] => [point.lng, point.lat];
const latLng = ([lng, lat]: [number, number]) => L.latLng(lat, lng);

export function CurvedLineToolLayer() {
  const map = useMap();
  const tool = useEditorToolStore((state) => state.activeTool);
  const mode = useEditorModeStore((state) => state.currentMode);
  useEffect(() => {
    if (tool !== "curved-line" || mode !== "edit") return;
    let start: L.LatLng | null = null;
    const preview = L.polyline([], { color: "#0d9488", weight: 3, dashArray: "6 6", interactive: false, pmIgnore: true } as L.PolylineOptions).addTo(map);
    const container = map.getContainer();
    const oldCursor = container.style.cursor;
    container.style.cursor = "crosshair";
    const move = (event: L.LeafletMouseEvent) => {
      if (start) preview.setLatLngs([start, event.latlng]);
    };
    const click = (event: L.LeafletMouseEvent) => {
      if (!start) { start = event.latlng; return; }
      if (map.latLngToContainerPoint(start).distanceTo(map.latLngToContainerPoint(event.latlng)) < 8) return;
      const feature: DroMapFeature = applyDrawingPresetToFeature({
        type: "Feature", id: crypto.randomUUID(),
        geometry: { type: "LineString", coordinates: createCurvedLineCoordinates(coordinate(start), coordinate(event.latlng)) },
        properties: { type: "line", lineVariant: "curved", label: "Trait courbe", legendLabel: "Trait courbe", style: { visualReferenceZoom: map.getZoom() }, meta: { version: 1 } },
      });
      useEditorFeaturesStore.getState().addFeatureWithHistory(feature);
      useEditorToolStore.getState().setActiveTool("select");
      useEditorSelectionStore.getState().setSelectedFeatureId(feature.id);
    };
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        start = null;
        preview.setLatLngs([]);
        useEditorToolStore.getState().setActiveTool("select");
      }
    };
    map.on("click", click);
    map.on("mousemove", move);
    document.addEventListener("keydown", cancel);
    return () => {
      map.off("click", click);
      map.off("mousemove", move);
      document.removeEventListener("keydown", cancel);
      preview.remove();
      container.style.cursor = oldCursor;
    };
  }, [map, tool, mode]);
  return null;
}

export function SelectedCurvedLineHandles({ featureId }: { featureId: string }) {
  const map = useMap();
  const feature = useEditorFeaturesStore((state) => state.features.find((item) => item.id === featureId));
  const mode = useEditorModeStore((state) => state.currentMode);
  const tool = useEditorToolStore((state) => state.activeTool);
  const exporting = useEditorExportStore((state) => state.isExportPanelOpen);
  const layers = useEditorLayersStore((state) => state.layers);
  const markersRef = useRef<L.Marker[]>([]);
  const draggingRef = useRef(false);
  const visible = isCurvedLineFeature(feature) && !exporting && mode === "edit"
    && (tool === "select" || tool === "edit") && !!feature
    && !feature.properties.geometryLocked && !isFeatureEffectivelyLocked(feature, layers) && isFeatureLayerVisible(feature, layers);

  useEffect(() => {
    if (!visible) return;
    const current = useEditorFeaturesStore.getState().features.find((item) => item.id === featureId);
    if (current?.geometry.type !== "LineString") return;
    const handles = getCurvedLineHandles(current.geometry.coordinates);
    if (!handles) return;
    let original: DroMapFeature | null = null;
    const markers = handles.map((point, index) => {
      const title = index === 1 ? "Courber le trait" : "Déplacer l’extrémité";
      const marker = L.marker(latLng(point), {
        draggable: true, keyboard: false, title, zIndexOffset: 2000,
        bubblingMouseEvents: false, pmIgnore: true,
        icon: L.divIcon({ className: "dromap-curve-handle", iconSize: [20, 20], iconAnchor: [10, 10],
          html: `<span style="display:block;width:20px;height:20px;border:3px solid white;border-radius:50%;background:${index === 1 ? "#0d9488" : "#2563eb"};box-shadow:0 1px 5px #334155;cursor:grab"></span>` }),
      } as L.MarkerOptions).addTo(map);
      marker.on("dragstart", () => {
        original = useEditorFeaturesStore.getState().features.find((item) => item.id === featureId) ?? null;
        draggingRef.current = true;
      });
      marker.on("drag", () => {
        const latest = useEditorFeaturesStore.getState().features.find((item) => item.id === featureId);
        if (!latest || latest.geometry.type !== "LineString" || latest.properties.geometryLocked
          || isFeatureEffectivelyLocked(latest, useEditorLayersStore.getState().layers)) return;
        const points = markers.map((handle) => coordinate(handle.getLatLng()));
        useEditorFeaturesStore.getState().updateFeature(featureId, { ...latest,
          geometry: { type: "LineString", coordinates: createCurvedLineCoordinates(points[0], points[2], points[1]) } });
      });
      marker.on("dragend", () => {
        const store = useEditorFeaturesStore.getState();
        const final = store.features.find((item) => item.id === featureId);
        if (original && final && original !== final) {
          // Record precisely one undo step, using the geometry before the gesture.
          store.updateFeature(featureId, original);
          store.updateFeatureWithHistory(featureId, () => final);
        }
        original = null;
        draggingRef.current = false;
      });
      return marker;
    });
    markersRef.current = markers;
    return () => {
      if (draggingRef.current && original) useEditorFeaturesStore.getState().updateFeature(featureId, original);
      draggingRef.current = false;
      markers.forEach((marker) => { marker.off(); marker.remove(); });
      markersRef.current = [];
    };
  }, [map, featureId, visible]);

  useEffect(() => {
    if (draggingRef.current || feature?.geometry.type !== "LineString") return;
    const points = getCurvedLineHandles(feature.geometry.coordinates);
    if (points) markersRef.current.forEach((marker, index) => marker.setLatLng(latLng(points[index])));
  }, [feature]);
  return null;
}
