"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import type { DroMapFeature } from "@/lib/dromap/feature";
import { createCurvedLineCoordinates, createMultiCurvedLine, getCurveHandleIndices, getCurvedLineHandles, isCurvedLineFeature } from "@/lib/dromap/curved-line";
import { useEditorFeaturesStore } from "@/stores/editor-features";
import { useEditorModeStore } from "@/stores/editor-mode";
import { useEditorToolStore } from "@/stores/editor-tool";
import { useEditorSelectionStore } from "@/stores/editor-selection";
import { useEditorExportStore } from "@/stores/editor-export";
import { isFeatureEffectivelyLocked, isFeatureLayerVisible, useEditorLayersStore } from "@/stores/editor-layers";
import { applyDrawingPresetToFeature } from "@/stores/editor-drawing-options";
import {
  DROMAP_FEATURE_BODY_DRAG_PREVIEW_EVENT,
  type FeatureBodyDragPreviewDetail,
} from "@/lib/dromap/drag-preview";

const coordinate = (point: L.LatLng): [number, number] => [point.lng, point.lat];
const latLng = ([lng, lat]: [number, number]) => L.latLng(lat, lng);
const SNAP_PIXELS = 10;
const ANGLE_SNAP_RADIANS = (8 * Math.PI) / 180;

function visibleLineFeatures() {
  const layers = useEditorLayersStore.getState().layers;
  return useEditorFeaturesStore.getState().features.filter(
    (feature) =>
      feature.geometry.type === "LineString" &&
      !feature.properties.geometryLocked &&
      !isFeatureEffectivelyLocked(feature, layers) &&
      isFeatureLayerVisible(feature, layers),
  );
}

function snapMapPoint(map: L.Map, raw: L.LatLng, start?: L.LatLng) {
  const pointer = map.latLngToContainerPoint(raw);
  let bestAnchor: L.Point | null = null;
  let bestDistance = SNAP_PIXELS + 1;
  const features = visibleLineFeatures();
  for (const feature of features) {
    if (feature.geometry.type !== "LineString") continue;
    const coordinates = isCurvedLineFeature(feature)
      ? getCurvedLineHandles(
          feature.geometry.coordinates,
          feature.properties.curveHandleIndices,
        ) ?? []
      : feature.geometry.coordinates;
    for (const value of coordinates) {
      const target = map.latLngToContainerPoint(latLng(value));
      const candidateDistance = pointer.distanceTo(target);
      if (candidateDistance <= SNAP_PIXELS && candidateDistance < bestDistance) {
        bestDistance = candidateDistance;
        bestAnchor = target;
      }
    }
  }
  if (bestAnchor) return map.containerPointToLatLng(bestAnchor);
  if (!start) return raw;

  const origin = map.latLngToContainerPoint(start);
  const vector = pointer.subtract(origin);
  const length = Math.hypot(vector.x, vector.y);
  if (length < 2) return raw;
  const pointerAngle = Math.atan2(vector.y, vector.x);
  const baseAngles = [0, Math.PI / 2];
  for (const feature of features) {
    if (
      feature.geometry.type !== "LineString" ||
      isCurvedLineFeature(feature) ||
      feature.geometry.coordinates.length > 32
    )
      continue;
    const points = feature.geometry.coordinates.map((value) =>
      map.latLngToContainerPoint(latLng(value)),
    );
    for (let index = 0; index < points.length - 1; index += 1) {
      const delta = points[index + 1].subtract(points[index]);
      if (Math.hypot(delta.x, delta.y) > 1)
        baseAngles.push(Math.atan2(delta.y, delta.x));
    }
  }
  let bestPoint = pointer;
  let bestAngularDistance = ANGLE_SNAP_RADIANS;
  for (const baseAngle of baseAngles) {
    for (const offset of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const candidateAngle = baseAngle + offset;
      const angularDistance = Math.abs(
        Math.atan2(
          Math.sin(pointerAngle - candidateAngle),
          Math.cos(pointerAngle - candidateAngle),
        ),
      );
      if (angularDistance < bestAngularDistance) {
        bestAngularDistance = angularDistance;
        bestPoint = L.point(
          origin.x + Math.cos(candidateAngle) * length,
          origin.y + Math.sin(candidateAngle) * length,
        );
      }
    }
  }
  return map.containerPointToLatLng(bestPoint);
}

export function CurvedLineToolLayer() {
  const map = useMap();
  const tool = useEditorToolStore((state) => state.activeTool);
  const mode = useEditorModeStore((state) => state.currentMode);
  const exporting = useEditorExportStore((state) => state.isExportPanelOpen);
  useEffect(() => {
    if (mode !== "edit" || exporting || (tool !== "select" && tool !== "edit")) return;
    const container = map.getContainer();
    const onDoubleClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("button, input, textarea, select, .leaflet-control, .dromap-curve-handle")) return;
      const pointer = map.mouseEventToContainerPoint(event);
      const layers = useEditorLayersStore.getState().layers;
      let hit: { feature: DroMapFeature; segment: number; point: L.Point; distance: number } | null = null;
      for (const feature of useEditorFeaturesStore.getState().features) {
        if (!isCurvedLineFeature(feature) || feature.geometry.type !== "LineString" || feature.properties.geometryLocked
          || isFeatureEffectivelyLocked(feature, layers) || !isFeatureLayerVisible(feature, layers)) continue;
        const points = feature.geometry.coordinates.map((point) => map.latLngToContainerPoint(latLng(point)));
        for (let i = 0; i < points.length - 1; i++) {
          const a = points[i], b = points[i + 1], delta = b.subtract(a);
          const lengthSquared = delta.x * delta.x + delta.y * delta.y;
          if (lengthSquared === 0) continue;
          const offset = pointer.subtract(a);
          const t = Math.max(0, Math.min(1, (offset.x * delta.x + offset.y * delta.y) / lengthSquared));
          const point = a.add(delta.multiplyBy(t));
          const distance = pointer.distanceTo(point);
          if (distance <= 10 && (!hit || distance < hit.distance)) hit = { feature, segment: i, point, distance };
        }
      }
      if (!hit || hit.feature.geometry.type !== "LineString") return;
      event.preventDefault();
      event.stopImmediatePropagation(); // The same gesture must not zoom the map.
      const { feature, point, segment } = hit;
      if (feature.geometry.type !== "LineString") return;
      const indices = getCurveHandleIndices(feature.geometry.coordinates, feature.properties.curveHandleIndices);
      if (indices.length >= 64 || indices.some((index) => map.latLngToContainerPoint(latLng(feature.geometry.type === "LineString" ? feature.geometry.coordinates[index] : [0, 0])).distanceTo(point) < 10)) return;
      const insertion = segment + 1;
      const coordinates = [...feature.geometry.coordinates];
      coordinates.splice(insertion, 0, coordinate(map.containerPointToLatLng(point)));
      const nextIndices = indices.map((index) => index >= insertion ? index + 1 : index);
      nextIndices.push(insertion);
      nextIndices.sort((a, b) => a - b);
      useEditorFeaturesStore.getState().updateFeatureWithHistory(feature.id, (latest) => ({ ...latest,
        geometry: { type: "LineString", coordinates },
        properties: { ...latest.properties, curveHandleIndices: nextIndices },
      }));
      useEditorSelectionStore.getState().setSelectedFeatureId(feature.id);
    };
    container.addEventListener("dblclick", onDoubleClick, true);
    return () => container.removeEventListener("dblclick", onDoubleClick, true);
  }, [map, mode, tool, exporting]);
  useEffect(() => {
    if (tool !== "curved-line" || mode !== "edit") return;
    let start: L.LatLng | null = null;
    const preview = L.polyline([], { color: "#0d9488", weight: 3, dashArray: "6 6", interactive: false, pmIgnore: true } as L.PolylineOptions).addTo(map);
    const container = map.getContainer();
    const oldCursor = container.style.cursor;
    container.style.cursor = "crosshair";
    const move = (event: L.LeafletMouseEvent) => {
      if (start) preview.setLatLngs([start, snapMapPoint(map, event.latlng, start)]);
    };
    const click = (event: L.LeafletMouseEvent) => {
      if (!start) { start = snapMapPoint(map, event.latlng); return; }
      const end = snapMapPoint(map, event.latlng, start);
      if (map.latLngToContainerPoint(start).distanceTo(map.latLngToContainerPoint(end)) < 8) return;
      const feature: DroMapFeature = applyDrawingPresetToFeature({
        type: "Feature", id: crypto.randomUUID(),
        geometry: { type: "LineString", coordinates: createCurvedLineCoordinates(coordinate(start), coordinate(end)) },
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
  const handleCount = feature?.geometry.type === "LineString" ? getCurveHandleIndices(feature.geometry.coordinates, feature.properties.curveHandleIndices).length : 0;
  const visible = isCurvedLineFeature(feature) && !exporting && mode === "edit"
    && (tool === "select" || tool === "edit") && !!feature
    && !feature.properties.geometryLocked && !isFeatureEffectivelyLocked(feature, layers) && isFeatureLayerVisible(feature, layers);

  useEffect(() => {
    if (!visible) return;
    const paneName = "dromap-curve-handles-pane";
    const pane = map.getPane(paneName) ?? map.createPane(paneName);
    pane.style.zIndex = "690";
    pane.style.pointerEvents = "none";
    const current = useEditorFeaturesStore.getState().features.find((item) => item.id === featureId);
    if (current?.geometry.type !== "LineString") return;
    const handles = getCurvedLineHandles(current.geometry.coordinates, current.properties.curveHandleIndices);
    if (!handles) return;
    let original: DroMapFeature | null = null;
    const markers = handles.map((point, index) => {
      const internal = index > 0 && index < handles.length - 1;
      const title = internal ? "Courber le trait" : "Déplacer l’extrémité";
      const marker = L.marker(latLng(point), {
        draggable: true, keyboard: false, title, zIndexOffset: 2000,
        bubblingMouseEvents: false, pmIgnore: true,
        pane: paneName,
        icon: L.divIcon({ className: "dromap-curve-handle", iconSize: [20, 20], iconAnchor: [10, 10],
          html: `<span style="display:block;width:20px;height:20px;border:3px solid white;border-radius:50%;background:${internal ? "#0d9488" : "#2563eb"};box-shadow:0 1px 5px #334155;cursor:grab"></span>` }),
      } as L.MarkerOptions).addTo(map);
      marker.getElement()?.style.setProperty("pointer-events", "auto");
      marker.on("dragstart", () => {
        original = useEditorFeaturesStore.getState().features.find((item) => item.id === featureId) ?? null;
        draggingRef.current = true;
      });
      marker.on("drag", () => {
        const latest = useEditorFeaturesStore.getState().features.find((item) => item.id === featureId);
        if (!latest || latest.geometry.type !== "LineString" || latest.properties.geometryLocked
          || isFeatureEffectivelyLocked(latest, useEditorLayersStore.getState().layers)) return;
        const points = markers.map((handle) => coordinate(handle.getLatLng()));
        const curve = createMultiCurvedLine(points);
        useEditorFeaturesStore.getState().updateFeature(featureId, { ...latest,
          geometry: { type: "LineString", coordinates: curve.coordinates },
          properties: { ...latest.properties, curveHandleIndices: curve.indices } });
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
    const onBodyDragPreview = (event: Event) => {
      const detail = (event as CustomEvent<FeatureBodyDragPreviewDetail>).detail;
      if (detail.featureId !== featureId || draggingRef.current) return;
      markers.forEach((marker) => {
        const currentPoint = marker.getLatLng();
        marker.setLatLng([
          currentPoint.lat + detail.latDelta,
          currentPoint.lng + detail.lngDelta,
        ]);
      });
    };
    window.addEventListener(
      DROMAP_FEATURE_BODY_DRAG_PREVIEW_EVENT,
      onBodyDragPreview,
    );
    return () => {
      if (draggingRef.current && original) useEditorFeaturesStore.getState().updateFeature(featureId, original);
      draggingRef.current = false;
      window.removeEventListener(
        DROMAP_FEATURE_BODY_DRAG_PREVIEW_EVENT,
        onBodyDragPreview,
      );
      markers.forEach((marker) => { marker.off(); marker.remove(); });
      markersRef.current = [];
    };
  }, [map, featureId, visible, handleCount]);

  useEffect(() => {
    if (draggingRef.current || feature?.geometry.type !== "LineString") return;
    const points = getCurvedLineHandles(feature.geometry.coordinates, feature.properties.curveHandleIndices);
    if (points) markersRef.current.forEach((marker, index) => marker.setLatLng(latLng(points[index])));
  }, [feature]);
  return null;
}
