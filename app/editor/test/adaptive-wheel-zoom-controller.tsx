"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import { useEditorTestModeStore } from "@/stores/editor-test-mode";

const CONTINUOUS_WHEEL_ZOOM_DATASET_KEY = "dromapContinuousWheelZoom";
const CONTINUOUS_WHEEL_ZOOM_END_EVENT =
  "dromap:continuous-wheel-zoom-end";
const SMOOTH_WHEEL_ZOOM_MANAGED_DATASET_KEY =
  "dromapSmoothWheelZoomManaged";

/**
 * Ce zoom continu n'est actif que pendant la sélection de la zone de travail.
 * Une fois la zone validée, DroMap rend immédiatement la main au zoom Leaflet
 * natif déjà utilisé par l'éditeur.
 *
 * Le zoom est ancré sous le curseur afin que le pointeur Geoman
 * "Click to place first vertex" reste cohérent avec la position visée.
 */

const MOUSE_REFERENCE_DELTA_PX = 100;
const MOUSE_ZOOM_PER_NOTCH = 0.34;
const TRACKPAD_PIXELS_PER_ZOOM_LEVEL = 90;
const PINCH_PIXELS_PER_ZOOM_LEVEL = 70;

/**
 * Les cinq derniers crans de dézoom provoquent encore un désalignement
 * entre MapLibre et les objets Leaflet. Avant la sélection de la zone, on
 * fixe donc la limite à z 1,68, soit un dernier cran de molette supplémentaire
 * au-dessus de l'ancienne limite z 1,34.
 */
const PRE_WORKSPACE_MIN_ZOOM = 1.68;

const MOUSE_SMOOTH_TIME_SECONDS = 0.155;
const TRACKPAD_SMOOTH_TIME_SECONDS = 0.08;
const PINCH_SMOOTH_TIME_SECONDS = 0.06;

const INPUT_IDLE_DELAY_MS = 92;
const MAX_FRAME_DELTA_SECONDS = 1 / 30;
const MIN_ZOOM_DISTANCE = 0.00035;
const MIN_ZOOM_VELOCITY = 0.002;

const CERTAIN_TRACKPAD_DELTA_PX = 24;
const CERTAIN_MOUSE_DELTA_PX = 60;
const TRACKPAD_SEQUENCE_MAX_INTERVAL_MS = 45;
const TRACKPAD_SEQUENCE_DELTA_VARIATION_PX = 1;

type WheelInputKind = "mouse" | "trackpad" | "pinch";

type SafariGestureEvent = Event & {
  scale?: number;
  clientX?: number;
  clientY?: number;
};

type InternalLeafletMap = L.Map & {
  _stop?: () => void;
  _moveStart?: (zoomChanged?: boolean, noMoveStart?: boolean) => void;
  _move?: (
    center: L.LatLng,
    zoom: number,
    data?: Record<string, unknown>,
  ) => void;
  _moveEnd?: (zoomChanged?: boolean) => void;
};

type SmoothDampResult = {
  value: number;
  velocity: number;
};

function hasFractionalDelta(event: WheelEvent) {
  return !Number.isInteger(event.deltaX) || !Number.isInteger(event.deltaY);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function getPreWorkspaceMinZoom(map: L.Map) {
  return Math.max(PRE_WORKSPACE_MIN_ZOOM, map.getMinZoom());
}

function normalizeGestureScale(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 1;
  }

  return value;
}

function normalizeWheelDeltaToPixels(
  event: WheelEvent,
  container: HTMLElement,
) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return event.deltaY * 40;
  }

  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * Math.max(320, container.clientHeight);
  }

  return event.deltaY;
}

function isWheelOverScrollableControl(
  container: HTMLElement,
  target: EventTarget | null,
) {
  if (!(target instanceof Element) || !container.contains(target)) {
    return false;
  }

  return Boolean(
    target.closest(
      [
        ".leaflet-control",
        ".leaflet-top",
        ".leaflet-bottom",
        "[role='dialog']",
        "[data-dromap-ignore-map-wheel='true']",
      ].join(","),
    ),
  );
}

function smoothDamp(
  current: number,
  target: number,
  currentVelocity: number,
  smoothTimeSeconds: number,
  deltaTimeSeconds: number,
): SmoothDampResult {
  const safeSmoothTime = Math.max(0.0001, smoothTimeSeconds);
  const omega = 2 / safeSmoothTime;
  const x = omega * deltaTimeSeconds;
  const exponential = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temporary = (currentVelocity + omega * change) * deltaTimeSeconds;
  const velocity = (currentVelocity - omega * temporary) * exponential;
  const value = target + (change + temporary) * exponential;

  return { value, velocity };
}

function getSmoothTime(inputKind: WheelInputKind) {
  if (inputKind === "pinch") {
    return PINCH_SMOOTH_TIME_SECONDS;
  }

  if (inputKind === "trackpad") {
    return TRACKPAD_SMOOTH_TIME_SECONDS;
  }

  return MOUSE_SMOOTH_TIME_SECONDS;
}

function getZoomDelta(
  inputKind: WheelInputKind,
  normalizedDeltaY: number,
) {
  if (inputKind === "pinch") {
    return clamp(
      -normalizedDeltaY / PINCH_PIXELS_PER_ZOOM_LEVEL,
      -0.48,
      0.48,
    );
  }

  if (inputKind === "trackpad") {
    return clamp(
      -normalizedDeltaY / TRACKPAD_PIXELS_PER_ZOOM_LEVEL,
      -0.36,
      0.36,
    );
  }

  const direction = -Math.sign(normalizedDeltaY);
  const notchStrength = clamp(
    Math.abs(normalizedDeltaY) / MOUSE_REFERENCE_DELTA_PX,
    0.72,
    2.1,
  );

  return direction * MOUSE_ZOOM_PER_NOTCH * notchStrength;
}

function getCenterForZoomAroundPoint(
  map: L.Map,
  containerPoint: L.Point,
  targetZoom: number,
) {
  const currentZoom = map.getZoom();
  const scale = map.getZoomScale(targetZoom, currentZoom);
  const viewHalf = map.getSize().divideBy(2);
  const centerOffset = containerPoint
    .subtract(viewHalf)
    .multiplyBy(1 - 1 / scale);

  return map.containerPointToLatLng(viewHalf.add(centerOffset));
}

export function AdaptiveWheelZoomController() {
  const map = useMap();
  const currentMode = useEditorTestModeStore((state) => state.currentMode);

  useEffect(() => {
    if (currentMode !== "workspace-select") {
      return;
    }

    const internalMap = map as InternalLeafletMap;
    const container = map.getContainer();
    const previousZoomSnap = map.options.zoomSnap;
    const previousWheelDebounceTime = map.options.wheelDebounceTime;
    const previousWheelPxPerZoomLevel = map.options.wheelPxPerZoomLevel;
    const previousScrollWheelZoom = map.options.scrollWheelZoom;
    const nativeWheelWasEnabled = map.scrollWheelZoom.enabled();

    let animationFrameId: number | null = null;
    let safariGestureActive = false;
    let safariGesturePreviousScale = 1;
    let lastNativeCtrlWheelAt = Number.NEGATIVE_INFINITY;
    let lastWheelEventAt = Number.NEGATIVE_INFINITY;
    let lastAbsoluteDeltaY = Number.NaN;

    let gestureActive = false;
    let targetZoom = map.getZoom();
    let zoomVelocity = 0;
    let lastFrameAt = window.performance.now();
    let lastInputAt = Number.NEGATIVE_INFINITY;
    let lastInputKind: WheelInputKind = "mouse";
    let zoomAnchorPoint = map.getSize().divideBy(2);

    container.dataset[SMOOTH_WHEEL_ZOOM_MANAGED_DATASET_KEY] = "true";
    map.options.zoomSnap = 0;
    map.options.wheelDebounceTime = 0;
    map.options.wheelPxPerZoomLevel = 1;
    map.options.scrollWheelZoom = true;
    map.scrollWheelZoom.disable();

    const enforcePreWorkspaceMinZoom = () => {
      const minimumZoom = getPreWorkspaceMinZoom(map);

      if (map.getZoom() < minimumZoom - 0.000001) {
        map.setZoom(minimumZoom, { animate: false });
      }
    };

    enforcePreWorkspaceMinZoom();
    map.on("zoomend", enforcePreWorkspaceMinZoom);

    const dispatchContinuousZoomEnd = () => {
      delete container.dataset[CONTINUOUS_WHEEL_ZOOM_DATASET_KEY];
      container.dispatchEvent(new CustomEvent(CONTINUOUS_WHEEL_ZOOM_END_EVENT));
    };

    const applyZoomFrame = (nextZoom: number) => {
      const safeZoom = clamp(
        nextZoom,
        getPreWorkspaceMinZoom(map),
        map.getMaxZoom(),
      );
      const currentZoom = map.getZoom();

      if (Math.abs(safeZoom - currentZoom) < 0.000001) {
        return;
      }

      const center = getCenterForZoomAroundPoint(
        map,
        zoomAnchorPoint,
        safeZoom,
      );

      if (typeof internalMap._move === "function") {
        internalMap._move(center, safeZoom, {
          zoom: true,
          dromapSmoothWheelZoom: true,
        });
        return;
      }

      map.setView(center, safeZoom, { animate: false });
    };

    const finishGesture = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }

      if (!gestureActive) {
        dispatchContinuousZoomEnd();
        return;
      }

      targetZoom = clamp(
        targetZoom,
        getPreWorkspaceMinZoom(map),
        map.getMaxZoom(),
      );
      applyZoomFrame(targetZoom);
      zoomVelocity = 0;
      gestureActive = false;

      internalMap._moveEnd?.(true);
      dispatchContinuousZoomEnd();
    };

    const animateZoom = (now: number) => {
      animationFrameId = null;

      if (!gestureActive) {
        return;
      }

      targetZoom = clamp(
        targetZoom,
        getPreWorkspaceMinZoom(map),
        map.getMaxZoom(),
      );

      const deltaTimeSeconds = Math.min(
        MAX_FRAME_DELTA_SECONDS,
        Math.max(1 / 240, (now - lastFrameAt) / 1000),
      );
      lastFrameAt = now;

      const currentZoom = map.getZoom();
      const result = smoothDamp(
        currentZoom,
        targetZoom,
        zoomVelocity,
        getSmoothTime(lastInputKind),
        deltaTimeSeconds,
      );
      zoomVelocity = result.velocity;
      applyZoomFrame(result.value);

      const distanceToTarget = Math.abs(targetZoom - map.getZoom());
      const inputIsIdle = now - lastInputAt >= INPUT_IDLE_DELAY_MS;
      const motionIsSettled =
        distanceToTarget <= MIN_ZOOM_DISTANCE &&
        Math.abs(zoomVelocity) <= MIN_ZOOM_VELOCITY;

      if (inputIsIdle && motionIsSettled) {
        finishGesture();
        return;
      }

      animationFrameId = window.requestAnimationFrame(animateZoom);
    };

    const beginGestureIfNeeded = () => {
      if (gestureActive) {
        return;
      }

      container.dataset[CONTINUOUS_WHEEL_ZOOM_DATASET_KEY] = "true";
      internalMap._stop?.();
      gestureActive = true;
      targetZoom = map.getZoom();
      zoomVelocity = 0;
      lastFrameAt = window.performance.now();

      internalMap._moveStart?.(true, false);

      if (animationFrameId === null) {
        animationFrameId = window.requestAnimationFrame(animateZoom);
      }
    };

    const detectWheelInputKind = (event: WheelEvent): WheelInputKind => {
      if (event.ctrlKey && event.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
        return "pinch";
      }

      if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) {
        return "mouse";
      }

      const now = window.performance.now();
      const absoluteDeltaX = Math.abs(event.deltaX);
      const absoluteDeltaY = Math.abs(event.deltaY);
      const intervalSincePreviousEvent = now - lastWheelEventAt;
      const deltaVariation = Number.isFinite(lastAbsoluteDeltaY)
        ? Math.abs(absoluteDeltaY - lastAbsoluteDeltaY)
        : 0;
      const hasHorizontalMovement = absoluteDeltaX > 0.5;
      const isRapidVaryingSequence =
        intervalSincePreviousEvent <= TRACKPAD_SEQUENCE_MAX_INTERVAL_MS &&
        deltaVariation > TRACKPAD_SEQUENCE_DELTA_VARIATION_PX;

      lastWheelEventAt = now;
      lastAbsoluteDeltaY = absoluteDeltaY;

      if (hasHorizontalMovement || hasFractionalDelta(event)) {
        return "trackpad";
      }

      if (absoluteDeltaY <= CERTAIN_TRACKPAD_DELTA_PX) {
        return "trackpad";
      }

      if (absoluteDeltaY >= CERTAIN_MOUSE_DELTA_PX) {
        return "mouse";
      }

      return isRapidVaryingSequence ? "trackpad" : "mouse";
    };

    const addZoomInput = (
      inputKind: WheelInputKind,
      deltaZoom: number,
      clientX: number,
      clientY: number,
    ) => {
      if (!Number.isFinite(deltaZoom) || deltaZoom === 0) {
        return;
      }

      const rect = container.getBoundingClientRect();
      zoomAnchorPoint = L.point(clientX - rect.left, clientY - rect.top);
      lastInputKind = inputKind;
      lastInputAt = window.performance.now();

      beginGestureIfNeeded();
      targetZoom = clamp(
        targetZoom + deltaZoom,
        getPreWorkspaceMinZoom(map),
        map.getMaxZoom(),
      );

      if (animationFrameId === null) {
        animationFrameId = window.requestAnimationFrame(animateZoom);
      }
    };

    const handleWheelCapture = (event: WheelEvent) => {
      if (isWheelOverScrollableControl(container, event.target)) {
        return;
      }

      const normalizedDeltaY = normalizeWheelDeltaToPixels(event, container);
      const absoluteDeltaX = Math.abs(event.deltaX);
      const absoluteDeltaY = Math.abs(normalizedDeltaY);

      if (absoluteDeltaY === 0 || absoluteDeltaX > absoluteDeltaY * 2.5) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      const inputKind = detectWheelInputKind(event);

      if (inputKind === "pinch" && event.isTrusted) {
        lastNativeCtrlWheelAt = window.performance.now();
      }

      addZoomInput(
        inputKind,
        getZoomDelta(inputKind, normalizedDeltaY),
        event.clientX,
        event.clientY,
      );
    };

    const handleSafariGestureStart = (event: Event) => {
      const gestureEvent = event as SafariGestureEvent;

      event.preventDefault();
      safariGestureActive = true;
      safariGesturePreviousScale = normalizeGestureScale(gestureEvent.scale);
    };

    const handleSafariGestureChange = (event: Event) => {
      if (!safariGestureActive) {
        return;
      }

      const gestureEvent = event as SafariGestureEvent;
      const currentScale = normalizeGestureScale(gestureEvent.scale);
      const scaleRatio = currentScale / safariGesturePreviousScale;

      event.preventDefault();
      safariGesturePreviousScale = currentScale;

      if (window.performance.now() - lastNativeCtrlWheelAt < 100) {
        return;
      }

      if (!Number.isFinite(scaleRatio) || scaleRatio <= 0 || scaleRatio === 1) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const clientX =
        typeof gestureEvent.clientX === "number"
          ? gestureEvent.clientX
          : rect.left + rect.width / 2;
      const clientY =
        typeof gestureEvent.clientY === "number"
          ? gestureEvent.clientY
          : rect.top + rect.height / 2;

      addZoomInput("pinch", Math.log2(scaleRatio), clientX, clientY);
    };

    const handleSafariGestureEnd = (event: Event) => {
      event.preventDefault();
      safariGestureActive = false;
      safariGesturePreviousScale = 1;
      lastInputAt = window.performance.now() - INPUT_IDLE_DELAY_MS;
    };

    container.addEventListener("wheel", handleWheelCapture, {
      capture: true,
      passive: false,
    });
    container.addEventListener(
      "gesturestart",
      handleSafariGestureStart as EventListener,
      { passive: false },
    );
    container.addEventListener(
      "gesturechange",
      handleSafariGestureChange as EventListener,
      { passive: false },
    );
    container.addEventListener(
      "gestureend",
      handleSafariGestureEnd as EventListener,
      { passive: false },
    );

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      if (gestureActive) {
        gestureActive = false;
        internalMap._moveEnd?.(true);
      }

      delete container.dataset[CONTINUOUS_WHEEL_ZOOM_DATASET_KEY];
      delete container.dataset[SMOOTH_WHEEL_ZOOM_MANAGED_DATASET_KEY];

      map.off("zoomend", enforcePreWorkspaceMinZoom);

      container.removeEventListener("wheel", handleWheelCapture, true);
      container.removeEventListener(
        "gesturestart",
        handleSafariGestureStart as EventListener,
      );
      container.removeEventListener(
        "gesturechange",
        handleSafariGestureChange as EventListener,
      );
      container.removeEventListener(
        "gestureend",
        handleSafariGestureEnd as EventListener,
      );

      map.options.zoomSnap = previousZoomSnap;
      map.options.wheelDebounceTime = previousWheelDebounceTime;
      map.options.wheelPxPerZoomLevel = previousWheelPxPerZoomLevel;
      map.options.scrollWheelZoom = previousScrollWheelZoom;

      if (nativeWheelWasEnabled) {
        map.scrollWheelZoom.enable();
      } else {
        map.scrollWheelZoom.disable();
      }
    };
  }, [currentMode, map]);

  return null;
}
