"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

import { getDromapBasemapConfig } from "@/lib/dromap/basemap";
import { applyGeomanForEditorMode } from "@/lib/dromap/geoman-toolbar";
import {
  bindLayerGeomanEvents,
  syncCreateToStore,
  syncEditToStore,
  syncRemoveFromStore,
} from "@/lib/dromap/geoman-sync";
import {
  isWorkspaceRectangleLayer,
  replaceWorkspaceRectangle,
} from "@/lib/dromap/workspace-rectangle";
import { configureLeafletIcons, defaultMarkerIcon } from "@/lib/leaflet-icon";
import { getWorkspaceClampBoundsFromLatLngBounds } from "@/lib/dromap/workspace-bounds";
import { useEditorTestBasemapStore } from "@/stores/editor-test-basemap";
import {
  DROMAP_WORLD_BOUNDS,
  dromapBasemapBoundsToLeafletBounds,
  getBasemapWorkspaceBounds,
} from "./basemap-viewport-bounds";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

type GeomanLayerEvent = {
  layer: L.Layer;
  shape: string;
};

type LastPointerPosition = {
  clientX: number;
  clientY: number;
  screenX: number;
  screenY: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
};

function replayPointerPosition(
  map: L.Map,
  pointerPosition: LastPointerPosition | null,
) {
  if (!pointerPosition || typeof document === "undefined") {
    return;
  }

  const container = map.getContainer();
  const rect = container.getBoundingClientRect();
  const isInsideMap =
    pointerPosition.clientX >= rect.left &&
    pointerPosition.clientX <= rect.right &&
    pointerPosition.clientY >= rect.top &&
    pointerPosition.clientY <= rect.bottom;

  if (!isInsideMap) {
    return;
  }

  const elementUnderPointer = document.elementFromPoint(
    pointerPosition.clientX,
    pointerPosition.clientY,
  );

  if (
    elementUnderPointer &&
    (!container.contains(elementUnderPointer) ||
      elementUnderPointer.closest(
        ".leaflet-control, .leaflet-top, .leaflet-bottom",
      ))
  ) {
    return;
  }

  const syntheticEvent = new MouseEvent("mousemove", {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: pointerPosition.clientX,
    clientY: pointerPosition.clientY,
    screenX: pointerPosition.screenX,
    screenY: pointerPosition.screenY,
    ctrlKey: pointerPosition.ctrlKey,
    shiftKey: pointerPosition.shiftKey,
    altKey: pointerPosition.altKey,
    metaKey: pointerPosition.metaKey,
  });

  const eventTarget =
    elementUnderPointer && container.contains(elementUnderPointer)
      ? elementUnderPointer
      : container;

  eventTarget.dispatchEvent(syntheticEvent);

  const containerPoint = L.point(
    pointerPosition.clientX - rect.left,
    pointerPosition.clientY - rect.top,
  );
  const layerPoint = map.containerPointToLayerPoint(containerPoint);

  map.fire("mousemove", {
    latlng: map.layerPointToLatLng(layerPoint),
    layerPoint,
    containerPoint,
    originalEvent: syntheticEvent,
  });
}

export default function GeomanControls() {
  const map = useMap();
  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const lastPointerPositionRef = useRef<LastPointerPosition | null>(null);

  useEffect(() => {
    configureLeafletIcons();

    map.pm.setGlobalOptions({
      markerStyle: { icon: defaultMarkerIcon },
    });

    const onCreate = (event: GeomanLayerEvent) => {
      const mode = useEditorTestModeStore.getState().currentMode;

      if (mode === "workspace-select") {
        if (
          event.shape === "Rectangle" &&
          event.layer instanceof L.Rectangle
        ) {
          const basemapState = useEditorTestBasemapStore.getState();
          const activeBasemapBounds = basemapState.activeBasemapBounds;
          const basemap = getDromapBasemapConfig(basemapState.basemapId);
          const viewportClampBounds = activeBasemapBounds
            ? dromapBasemapBoundsToLeafletBounds(activeBasemapBounds)
            : DROMAP_WORLD_BOUNDS;
          const workspaceClampBounds = getBasemapWorkspaceBounds(
            basemap,
            viewportClampBounds,
          );
          const bounds = replaceWorkspaceRectangle(
            map,
            event.layer,
            getWorkspaceClampBoundsFromLatLngBounds(workspaceClampBounds),
          );
          useEditorTestWorkspaceStore.getState().setWorkspaceBounds(bounds);

          window.setTimeout(() => {
            const latestMode = useEditorTestModeStore.getState().currentMode;

            if (latestMode === "workspace-select") {
              applyGeomanForEditorMode(map, latestMode);
            }
          }, 0);
        } else {
          map.removeLayer(event.layer);
        }

        return;
      }

      if (mode === "edit") {
        if (
          event.shape === "Rectangle" ||
          isWorkspaceRectangleLayer(event.layer)
        ) {
          map.removeLayer(event.layer);
          return;
        }

        if (event.layer instanceof L.Marker) {
          event.layer.setIcon(defaultMarkerIcon);
        }

        syncCreateToStore(event);
        bindLayerGeomanEvents(event.layer);
        return;
      }

      map.removeLayer(event.layer);
    };

    const onEdit = (event: GeomanLayerEvent) => {
      if (isWorkspaceRectangleLayer(event.layer)) return;
      syncEditToStore(event);
    };

    const onRemove = (event: GeomanLayerEvent) => {
      if (isWorkspaceRectangleLayer(event.layer)) return;
      syncRemoveFromStore(event);
    };

    const container = map.getContainer();
    let replayAnimationFrameId: number | null = null;
    const replayTimeoutIds = new Set<number>();

    const rememberPointerPosition = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      if (
        !container.contains(event.target) ||
        event.target.closest(
          ".leaflet-control, .leaflet-top, .leaflet-bottom",
        )
      ) {
        return;
      }

      lastPointerPositionRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        screenX: event.screenX,
        screenY: event.screenY,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      };
    };

    const clearPointerPosition = () => {
      lastPointerPositionRef.current = null;
    };

    const replayPointerNow = () => {
      if (useEditorTestModeStore.getState().currentMode !== "workspace-select") {
        return;
      }

      replayPointerPosition(map, lastPointerPositionRef.current);
    };

    const schedulePointerReplay = () => {
      if (replayAnimationFrameId !== null) {
        window.cancelAnimationFrame(replayAnimationFrameId);
      }

      replayAnimationFrameId = window.requestAnimationFrame(() => {
        replayAnimationFrameId = null;
        replayPointerNow();
      });
    };

    const replayPointerAfterZoom = () => {
      for (const delay of [0, 50, 120]) {
        const timeoutId = window.setTimeout(() => {
          replayTimeoutIds.delete(timeoutId);
          replayPointerNow();
        }, delay);

        replayTimeoutIds.add(timeoutId);
      }
    };

    container.addEventListener("mousemove", rememberPointerPosition, true);
    container.addEventListener("mouseleave", clearPointerPosition, true);
    map.on("pm:create", onCreate);
    map.on("pm:edit", onEdit);
    map.on("pm:remove", onRemove);
    map.on("zoom move resize", schedulePointerReplay);
    map.on("zoomend moveend", replayPointerAfterZoom);

    applyGeomanForEditorMode(map, currentMode);
    replayPointerAfterZoom();

    return () => {
      if (replayAnimationFrameId !== null) {
        window.cancelAnimationFrame(replayAnimationFrameId);
      }

      for (const timeoutId of replayTimeoutIds) {
        window.clearTimeout(timeoutId);
      }
      replayTimeoutIds.clear();

      container.removeEventListener("mousemove", rememberPointerPosition, true);
      container.removeEventListener("mouseleave", clearPointerPosition, true);
      map.off("pm:create", onCreate);
      map.off("pm:edit", onEdit);
      map.off("pm:remove", onRemove);
      map.off("zoom move resize", schedulePointerReplay);
      map.off("zoomend moveend", replayPointerAfterZoom);

      if (map.pm.controlsVisible()) {
        map.pm.removeControls();
      }

      map.pm.disableDraw();
    };
  }, [map, currentMode]);

  return null;
}