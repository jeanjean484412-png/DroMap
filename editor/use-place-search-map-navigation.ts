import { useContext, useEffect } from "react";
import L from "leaflet";

import { toLatLngBounds } from "@/lib/dromap/workspace-bounds";
import { useEditorGraphicZoomStore } from "@/stores/editor-graphic-zoom";
import { useEditorWorkspaceStore } from "@/stores/editor-workspace";
import { PlaceSearchNavigationContext, type PlaceSearchNavigation } from "./place-search-navigation";

const PIN_PANE = "dromap-place-search-pin";
const PIN_DISMISS_EVENTS = "movestart zoomstart move resize";
const pinIcon = L.divIcon({
  className: "dromap-place-search-pin",
  iconSize: [30, 42],
  iconAnchor: [15, 41],
  html: '<svg viewBox="0 0 30 42" width="30" height="42" aria-hidden="true"><path d="M15 40C12 35 1 24 1 15a14 14 0 1 1 28 0c0 9-11 20-14 25Z" fill="#dc2626" stroke="white" stroke-width="2"/><circle cx="15" cy="15" r="5" fill="white"/></svg>',
});

function getVisibleMapPixels(map: L.Map) {
  const container = map.getContainer();
  const mapRect = container.getBoundingClientRect();
  const editorMap = container.closest('[data-dromap-product-map="true"]');
  const visibleArea = editorMap?.querySelector('[data-dromap-tour="map-visible-area"]');
  const viewport = visibleArea ?? container.closest("[data-dromap-graphic-viewport]");
  const viewportRect = viewport?.getBoundingClientRect() ?? mapRect;
  const size = map.getSize();

  if (!mapRect.width || !mapRect.height) return L.bounds([0, 0], size);

  const left = Math.max(mapRect.left, viewportRect.left);
  const top = Math.max(mapRect.top, viewportRect.top);
  const right = Math.min(mapRect.right, viewportRect.right);
  let bottom = Math.min(mapRect.bottom, viewportRect.bottom);

  const mobileInspector = editorMap?.parentElement?.querySelector(
    '[data-dromap-inspector-overlay][data-collapsed="false"]',
  );
  const inspectorRect = mobileInspector?.getBoundingClientRect();
  if (inspectorRect && inspectorRect.width >= right - left && inspectorRect.top > top) {
    bottom = Math.min(bottom, inspectorRect.top);
  }

  if (right <= left || bottom <= top) return L.bounds([0, 0], size);

  return L.bounds(
    [(left - mapRect.left) * size.x / mapRect.width, (top - mapRect.top) * size.y / mapRect.height],
    [(right - mapRect.left) * size.x / mapRect.width, (bottom - mapRect.top) * size.y / mapRect.height],
  );
}

function nearestLongitude(lng: number, reference: number) {
  return lng + 360 * Math.round((reference - lng) / 360);
}

export function usePlaceSearchMapNavigation(
  map: L.Map,
  worldBounds: L.LatLngBounds,
  suspendWorkspaceConstraint: (milliseconds: number) => void,
) {
  const navigation = useContext(PlaceSearchNavigationContext);

  useEffect(() => {
    if (!navigation) return;

    let pin: L.Marker | null = null;
    const removePin = () => {
      pin?.remove();
      pin = null;
    };

    const mark = (point: L.LatLng) => {
      const pane = map.getPane(PIN_PANE) ?? map.createPane(PIN_PANE);
      pane.style.zIndex = "21000";
      pane.style.pointerEvents = "none";
      pin = L.marker(point, {
        pane: PIN_PANE,
        icon: pinIcon,
        interactive: false,
        keyboard: false,
        pmIgnore: true,
      }).addTo(map);
    };

    const navigate: PlaceSearchNavigation = ({ lat, lng, bounds }) => {
      removePin();
      const visible = getVisibleMapPixels(map);
      const { workspaceBounds } = useEditorWorkspaceStore.getState();

      if (!workspaceBounds) {
        const target = L.latLngBounds(toLatLngBounds(bounds)).extend([lat, lng]);
        const maxBounds = map.options.maxBounds;
        const currentLimit = Array.isArray(maxBounds) ? L.latLngBounds(maxBounds) : maxBounds;
        if (currentLimit && !currentLimit.contains(target)) {
          map.setMaxBounds(worldBounds);
        }
        const size = map.getSize();
        const padding = L.point(Math.min(48, visible.getSize().x / 8), Math.min(48, visible.getSize().y / 8));
        map.fitBounds(target, {
          paddingTopLeft: visible.getTopLeft().add(padding),
          paddingBottomRight: size.subtract(visible.getBottomRight()).add(padding),
          maxZoom: 17,
          animate: false,
        });
        mark(L.latLng(lat, lng));
        return "centered";
      }

      const workspace = L.latLngBounds(toLatLngBounds(workspaceBounds));
      const visibleCenter = map.containerPointToLatLng(visible.getCenter());
      const visiblePoint = L.latLng(lat, nearestLongitude(lng, visibleCenter.lng));
      const workspacePoint = workspace.contains(visiblePoint)
        ? visiblePoint
        : L.latLng(lat, nearestLongitude(lng, workspace.getCenter().lng));

      if (!workspace.contains(workspacePoint)) {
        if (!visible.contains(map.latLngToContainerPoint(visiblePoint))) return "outside-hidden";
        mark(visiblePoint);
        return "outside-visible";
      }

      const projected = map.latLngToContainerPoint(workspacePoint);
      if (visible.contains(projected)) {
        mark(workspacePoint);
        return "marked";
      }

      // Éviter que la contrainte de déplacement corrige aussitôt le recentrage.
      suspendWorkspaceConstraint(100);
      map.panBy(projected.subtract(visible.getCenter()), { animate: false });
      mark(workspacePoint);
      return "centered";
    };

    navigation.current = navigate;
    map.on(PIN_DISMISS_EVENTS, removePin);
    const unsubscribeGraphicZoom = useEditorGraphicZoomStore.subscribe((state, previous) => {
      if (state.graphicZoomEnabled !== previous.graphicZoomEnabled ||
          state.graphicZoomLevel !== previous.graphicZoomLevel) removePin();
    });

    return () => {
      if (navigation.current === navigate) navigation.current = null;
      map.off(PIN_DISMISS_EVENTS, removePin);
      unsubscribeGraphicZoom();
      removePin();
    };
  }, [map, navigation, suspendWorkspaceConstraint, worldBounds]);
}
