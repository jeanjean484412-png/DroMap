"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMap } from "react-leaflet";

import type { DroMapFeature, DroMapMarkerSymbol } from "@/lib/dromap/feature";
import { useEditorTestDrawingOptionsStore } from "@/stores/editor-test-drawing-options";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import type { EditorTestActiveTool } from "@/stores/editor-test-tool";
import { useEditorTestToolStore } from "@/stores/editor-test-tool";
import { getMarkerSymbolHtml } from "./marker-symbol";
import { createTextDivIconRender } from "./text-rendering";
import {
  createHatchDotsForRing,
  createHatchSegmentsForRing,
} from "./zone-hatching";
import {
  createAlignedDashedZoneOutlineSegments,
  createAlignedDottedZoneOutlinePoints,
  getAlignedZoneOutlineDashGap,
  getAlignedZoneOutlineDashLength,
  getAlignedZoneOutlineDotSpacing,
} from "./zone-outline";
import { buildLocalShapePoints, getQuickShapeKind } from "./quick-shape";

const PREVIEW_LAYER_Z_INDEX = 690;
const PREVIEW_OPACITY = 0.46;
const POINT_PREVIEW_SIZE = 7;
const PENCIL_PREVIEW_SIZE = 26;
const GEOMETRY_POINT_CLICK_MAX_DISTANCE = 5;
const GEOMETRY_POINT_CLICK_MAX_DURATION_MS = 650;
const MIN_ARROW_SIZE = 16;
const MAX_ARROW_SIZE = 42;

const PLACEMENT_TOOLS = new Set<EditorTestActiveTool>([
  "marker",
  "line",
  "freehand",
  "trace-line",
  "zone",
  "freehand-zone",
  "shape",
  "text",
]);

const GEOMETRY_PREVIEW_TOOLS = new Set<EditorTestActiveTool>([
  "line",
  "zone",
  "shape",
]);

type PointerPosition = {
  x: number;
  y: number;
};

type LatLngValue = {
  lat: number;
  lng: number;
};

type GeometryPointCandidate = {
  pointerId: number;
  clientX: number;
  clientY: number;
  timeStamp: number;
};

type MarkerPreviewFeature = {
  properties: {
    style: {
      color?: string;
      opacity?: number;
      markerSize?: number;
    };
    symbol?: DroMapMarkerSymbol;
  };
};

function clamp(value: number | undefined, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value as number));
}

function shouldShowPlacementPreview(
  currentMode: string,
  activeTool: EditorTestActiveTool,
) {
  return currentMode === "edit" && PLACEMENT_TOOLS.has(activeTool);
}

function getSvgDashArray(
  dashStyle: "solid" | "dashed" | "dotted",
  weight: number,
) {
  if (dashStyle === "dashed") {
    return `${Math.max(8, weight * 4)} ${Math.max(6, weight * 2.2)}`;
  }

  if (dashStyle === "dotted") {
    return `0.001 ${Math.max(6, weight * 2.8)}`;
  }

  return undefined;
}

function AlignedZoneSvgOutline({
  points,
  closed,
  color,
  opacity,
  weight,
  dashStyle,
  alignCorners = true,
}: {
  points: PointerPosition[];
  closed: boolean;
  color: string;
  opacity: number;
  weight: number;
  dashStyle: "solid" | "dashed" | "dotted";
  alignCorners?: boolean;
}) {
  if (points.length < 2 || opacity <= 0 || weight <= 0) {
    return null;
  }

  if (!closed || !alignCorners || dashStyle === "solid") {
    return (
      <path
        d={toPath(points, closed)}
        fill="none"
        stroke={color}
        strokeWidth={weight}
        strokeOpacity={opacity}
        strokeDasharray={getSvgDashArray(dashStyle, weight)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  if (dashStyle === "dotted") {
    const dots = createAlignedDottedZoneOutlinePoints(
      points,
      getAlignedZoneOutlineDotSpacing(weight),
    );

    return (
      <g fill={color} opacity={opacity}>
        {dots.map((dot, index) => (
          <circle
            key={`dot-${index}-${dot.x}-${dot.y}`}
            cx={dot.x}
            cy={dot.y}
            r={Math.max(1.2, weight / 2)}
          />
        ))}
      </g>
    );
  }

  const segments = createAlignedDashedZoneOutlineSegments(
    points,
    getAlignedZoneOutlineDashLength(weight),
    getAlignedZoneOutlineDashGap(weight),
  );

  return (
    <g
      stroke={color}
      opacity={opacity}
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {segments.map(([start, end], index) => (
        <line
          key={`dash-${index}-${start.x}-${start.y}`}
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
        />
      ))}
    </g>
  );
}

function createPreviewTextFeature(
  textStyle: DroMapFeature["properties"]["style"],
): DroMapFeature {
  return {
    type: "Feature",
    id: "dromap-text-preview",
    geometry: {
      type: "Point",
      coordinates: [0, 0],
    },
    properties: {
      type: "text",
      label: "Texte",
      style: textStyle,
      meta: { version: 1 },
    },
  };
}

function toPath(points: PointerPosition[], close = false) {
  if (points.length === 0) {
    return "";
  }

  const [firstPoint, ...otherPoints] = points;
  const commands = [`M ${firstPoint.x} ${firstPoint.y}`];

  for (const point of otherPoints) {
    commands.push(`L ${point.x} ${point.y}`);
  }

  if (close && points.length >= 3) {
    commands.push("Z");
  }

  return commands.join(" ");
}

function getDirectionAngle(from: PointerPosition, to: PointerPosition) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function getPointDistance(from: PointerPosition, to: PointerPosition) {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function getClientDistance(
  from: Pick<GeometryPointCandidate, "clientX" | "clientY">,
  to: Pick<GeometryPointCandidate, "clientX" | "clientY">,
) {
  return Math.hypot(to.clientX - from.clientX, to.clientY - from.clientY);
}

function movePointTowards(
  from: PointerPosition,
  to: PointerPosition,
  distance: number,
): PointerPosition {
  const segmentDistance = getPointDistance(from, to);

  if (segmentDistance <= 0) {
    return from;
  }

  const ratio = Math.min(1, Math.max(0, distance / segmentDistance));

  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio,
  };
}

function trimPolylineStart(
  points: PointerPosition[],
  distance: number,
): PointerPosition[] {
  if (points.length < 2 || distance <= 0) {
    return points;
  }

  let remainingDistance = distance;

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const segmentDistance = getPointDistance(current, next);

    if (segmentDistance <= 0) {
      continue;
    }

    if (remainingDistance < segmentDistance) {
      return [
        movePointTowards(current, next, remainingDistance),
        ...points.slice(index + 1),
      ];
    }

    remainingDistance -= segmentDistance;
  }

  return points.slice(-2);
}

function trimPolylineEnd(
  points: PointerPosition[],
  distance: number,
): PointerPosition[] {
  if (points.length < 2 || distance <= 0) {
    return points;
  }

  let remainingDistance = distance;

  for (let index = points.length - 1; index > 0; index -= 1) {
    const current = points[index];
    const previous = points[index - 1];
    const segmentDistance = getPointDistance(current, previous);

    if (segmentDistance <= 0) {
      continue;
    }

    if (remainingDistance < segmentDistance) {
      return [
        ...points.slice(0, index),
        movePointTowards(current, previous, remainingDistance),
      ];
    }

    remainingDistance -= segmentDistance;
  }

  return points.slice(0, 2);
}

function trimLinePreviewBodyForArrows(
  points: PointerPosition[],
  options: {
    arrowStart?: boolean;
    arrowEnd?: boolean;
    arrowSize: number;
    weight: number;
  },
) {
  if (points.length < 2 || (!options.arrowStart && !options.arrowEnd)) {
    return points;
  }

  /**
   * Un fantôme de ligne est volontairement semi-transparent. Si le trait
   * continue jusqu'à la pointe, on voit l'épaisseur du trait dépasser sous
   * la tête de flèche. On coupe donc plus franchement le corps du trait dans
   * la preview uniquement. Les données de la feature réelle ne sont pas
   * modifiées.
   */
  const cutBack = options.arrowSize * 1.12 + Math.max(8, options.weight * 1.8);
  let trimmedPoints = points;

  if (options.arrowStart) {
    trimmedPoints = trimPolylineStart(trimmedPoints, cutBack);
  }

  if (options.arrowEnd) {
    trimmedPoints = trimPolylineEnd(trimmedPoints, cutBack);
  }

  if (trimmedPoints.length < 2) {
    return points;
  }

  return trimmedPoints;
}

function findDirectionSegment(
  points: PointerPosition[],
  direction: "start" | "end",
): [PointerPosition, PointerPosition] | null {
  if (points.length < 2) {
    return null;
  }

  if (direction === "start") {
    const start = points[0];

    for (let index = 1; index < points.length; index += 1) {
      const next = points[index];
      const dx = next.x - start.x;
      const dy = next.y - start.y;

      if (Math.hypot(dx, dy) >= 4) {
        return [next, start];
      }
    }

    return [points[1], start];
  }

  const end = points[points.length - 1];

  for (let index = points.length - 2; index >= 0; index -= 1) {
    const previous = points[index];
    const dx = end.x - previous.x;
    const dy = end.y - previous.y;

    if (Math.hypot(dx, dy) >= 4) {
      return [previous, end];
    }
  }

  return [points[points.length - 2], end];
}

function ArrowHead({
  points,
  direction,
  size,
  color,
  opacity,
}: {
  points: PointerPosition[];
  direction: "start" | "end";
  size: number;
  color: string;
  opacity: number;
}) {
  const segment = findDirectionSegment(points, direction);

  if (!segment) {
    return null;
  }

  const [, tip] = segment;
  const angle = getDirectionAngle(segment[0], segment[1]);
  const halfHeight = size * 0.42;
  const baseX = tip.x - Math.cos(angle) * size;
  const baseY = tip.y - Math.sin(angle) * size;
  const normalX = Math.cos(angle + Math.PI / 2);
  const normalY = Math.sin(angle + Math.PI / 2);
  const p1 = `${tip.x},${tip.y}`;
  const p2 = `${baseX + normalX * halfHeight},${baseY + normalY * halfHeight}`;
  const p3 = `${baseX - normalX * halfHeight},${baseY - normalY * halfHeight}`;

  return (
    <polygon points={`${p1} ${p2} ${p3}`} fill={color} opacity={opacity} />
  );
}

function MarkerPlacementPreview() {
  const markerStyle = useEditorTestDrawingOptionsStore(
    (state) => state.markerStyle,
  );
  const markerSymbol = useEditorTestDrawingOptionsStore(
    (state) => state.markerSymbol,
  );

  const html = useMemo(() => {
    const feature: MarkerPreviewFeature = {
      properties: {
        style: markerStyle,
        symbol: markerSymbol,
      },
    };

    return getMarkerSymbolHtml(feature, { size: markerStyle.markerSize });
  }, [markerStyle, markerSymbol]);

  return (
    <div
      aria-hidden="true"
      className="select-none"
      style={{
        opacity: PREVIEW_OPACITY,
        pointerEvents: "none",
        transform: "translateZ(0)",
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function TextPlacementPreview() {
  const textStyle = useEditorTestDrawingOptionsStore(
    (state) => state.textStyle,
  );

  const html = useMemo(() => {
    return createTextDivIconRender(createPreviewTextFeature(textStyle), {
      minWidth: 56,
      maxWidth: 520,
    }).html;
  }, [textStyle]);

  return (
    <div
      aria-hidden="true"
      className="select-none"
      style={{
        opacity: PREVIEW_OPACITY,
        pointerEvents: "none",
        transform: "translateZ(0)",
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function QuickShapePlacementPreview() {
  return <PointPlacementPreview type="zone" />;
}

function FreehandPencilPreview({ type }: { type: "line" | "zone" }) {
  const lineStyle = useEditorTestDrawingOptionsStore(
    (state) => state.lineStyle,
  );
  const zoneStyle = useEditorTestDrawingOptionsStore(
    (state) => state.zoneStyle,
  );
  const style = type === "line" ? lineStyle : zoneStyle;
  const color = style.color;
  const opacity = clamp(style.opacity, 0, 1);

  return (
    <svg
      aria-hidden="true"
      width={PENCIL_PREVIEW_SIZE}
      height={PENCIL_PREVIEW_SIZE}
      viewBox="0 0 26 26"
      className="select-none overflow-visible drop-shadow-[0_1px_2px_rgba(255,255,255,0.95)]"
      style={{ opacity: 0.86 }}
    >
      <path
        d="M 3.5 23 L 5.4 17.5 L 18.9 4 C 20 2.9 21.8 2.9 22.9 4 L 23.2 4.3 C 24.3 5.4 24.3 7.2 23.2 8.3 L 9.7 21.8 Z"
        fill="white"
        fillOpacity="0.96"
        stroke={color}
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path
        d="M 18.1 4.8 L 22.4 9.1"
        stroke={color}
        strokeWidth="1.55"
        strokeLinecap="round"
      />
      <path
        d="M 3.5 23 L 5.4 17.5 L 9.7 21.8 Z"
        fill={color}
        fillOpacity={Math.max(0.72, opacity)}
        stroke={color}
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <circle
        cx="3.5"
        cy="23"
        r="1.45"
        fill={color}
        fillOpacity={Math.max(0.82, opacity)}
      />
    </svg>
  );
}

function isLeafletMapSurfaceTarget(
  eventTarget: EventTarget | null,
  container: HTMLElement,
) {
  if (!(eventTarget instanceof Element)) {
    return false;
  }

  const target = eventTarget;

  if (!container.contains(target)) {
    return false;
  }

  if (
    target.closest(
      [".leaflet-control", ".leaflet-top", ".leaflet-bottom"].join(","),
    )
  ) {
    return false;
  }

  /**
   * En mode pose, les objets Leaflet déjà présents font partie de la surface
   * de carte. Certains marqueurs/textes peuvent contenir des éléments avec
   * role=button ou des wrappers interactifs : ils ne doivent pas faire revenir
   * le curseur système ni masquer le fantôme de pose.
   */
  if (
    target.closest(
      [
        ".dromap-placement-preview-layer",
        ".dromap-placement-preview-layer *",
        ".dromap-drawing-geometry-preview",
        ".dromap-drawing-geometry-preview *",
        ".dromap-text-icon",
        ".dromap-text-icon *",
        ".dromap-text-frame",
        ".dromap-text-frame *",
        '[data-dromap-text-click-target="true"]',
        '[data-dromap-text-click-target="true"] *',
      ].join(","),
    )
  ) {
    return true;
  }

  if (
    target.closest(
      [
        ".leaflet-pane",
        ".leaflet-tile-pane",
        ".leaflet-overlay-pane",
        ".leaflet-marker-pane",
        ".leaflet-shadow-pane",
        ".leaflet-tooltip-pane",
        ".leaflet-layer",
        ".leaflet-tile",
        ".leaflet-interactive",
        ".leaflet-marker-icon",
        ".leaflet-div-icon",
        "svg.leaflet-zoom-animated",
        "canvas.leaflet-zoom-animated",
      ].join(","),
    )
  ) {
    return true;
  }

  if (target === container) {
    return true;
  }

  if (
    target.closest(
      [
        "button",
        "a[href]",
        "input",
        "select",
        "textarea",
        "label",
        "summary",
        "[role='button']",
        "[role='menuitem']",
        "[contenteditable='true']",
      ].join(","),
    )
  ) {
    return false;
  }

  return false;
}

function setMapPlacementCursorHidden(container: HTMLElement, hidden: boolean) {
  container.classList.toggle("dromap-placement-pointer-on-map", hidden);

  if (hidden) {
    container.style.setProperty("cursor", "none", "important");
    return;
  }

  container.style.removeProperty("cursor");
}

function forceMapPlacementCursorHidden(container: HTMLElement) {
  /**
   * Après la pose d'un marqueur, React/Leaflet insère immédiatement un
   * nouveau Marker sous la souris. Le navigateur peut recalculer le curseur
   * sur ce nouvel élément avant le prochain pointermove, ce qui faisait
   * réapparaître le curseur système tant que l'utilisateur ne bougeait pas.
   * On réapplique donc le masquage sur plusieurs frames autour du clic.
   */
  setMapPlacementCursorHidden(container, true);

  if (typeof window === "undefined") {
    return;
  }

  window.requestAnimationFrame(() => {
    setMapPlacementCursorHidden(container, true);

    window.requestAnimationFrame(() => {
      setMapPlacementCursorHidden(container, true);
    });
  });
}

function getCursorPreviewTransform(activeTool: EditorTestActiveTool) {
  if (activeTool === "freehand" || activeTool === "freehand-zone") {
    // Le point exact de dessin correspond à la pointe du crayon, pas à son centre.
    return "translate(-3.5px, -23px)";
  }

  return "translate(-50%, -50%)";
}

function PointPlacementPreview({ type }: { type: "line" | "zone" }) {
  const lineStyle = useEditorTestDrawingOptionsStore(
    (state) => state.lineStyle,
  );
  const zoneStyle = useEditorTestDrawingOptionsStore(
    (state) => state.zoneStyle,
  );
  const style = type === "line" ? lineStyle : zoneStyle;
  const color = style.color;
  const opacity = clamp(style.opacity, 0, 1);
  const size = POINT_PREVIEW_SIZE + 12;
  const center = size / 2;
  const armLength = POINT_PREVIEW_SIZE + 3;

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="select-none overflow-visible"
      style={{ opacity: Math.max(0.72, opacity) }}
    >
      <line
        x1={center - armLength / 2}
        y1={center}
        x2={center + armLength / 2}
        y2={center}
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <line
        x1={center}
        y1={center - armLength / 2}
        x2={center}
        y2={center + armLength / 2}
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx={center} cy={center} r="2.1" fill={color} />
      <circle
        cx={center}
        cy={center}
        r="4.2"
        fill="none"
        stroke={color}
        strokeOpacity="0.42"
        strokeWidth="1"
      />
    </svg>
  );
}

function CursorPlacementPreview({
  activeTool,
}: {
  activeTool: EditorTestActiveTool;
}) {
  if (activeTool === "marker") {
    return <MarkerPlacementPreview />;
  }

  if (activeTool === "text") {
    return <TextPlacementPreview />;
  }

  if (activeTool === "freehand") {
    return <FreehandPencilPreview type="line" />;
  }

  if (activeTool === "freehand-zone") {
    return <FreehandPencilPreview type="zone" />;
  }

  if (activeTool === "line" || activeTool === "trace-line") {
    return <PointPlacementPreview type="line" />;
  }

  if (activeTool === "shape") {
    return <QuickShapePlacementPreview />;
  }

  if (activeTool === "zone") {
    return <PointPlacementPreview type="zone" />;
  }

  return null;
}

function LineGeometryPreview({ points }: { points: PointerPosition[] }) {
  const lineStyle = useEditorTestDrawingOptionsStore(
    (state) => state.lineStyle,
  );

  if (points.length < 2) {
    return null;
  }

  const weight = clamp(lineStyle.weight, 1, 20);
  const color = lineStyle.color;
  const opacity = clamp(lineStyle.opacity, 0, 1);
  const dashArray = getSvgDashArray(lineStyle.dashStyle, weight);
  const arrowSize = clamp(13 + weight * 2.8, MIN_ARROW_SIZE, MAX_ARROW_SIZE);
  const bodyPoints = trimLinePreviewBodyForArrows(points, {
    arrowStart: lineStyle.arrowStart,
    arrowEnd: lineStyle.arrowEnd,
    arrowSize,
    weight,
  });

  return (
    <g opacity={PREVIEW_OPACITY}>
      <path
        d={toPath(bodyPoints)}
        fill="none"
        stroke={color}
        strokeWidth={weight}
        strokeOpacity={opacity}
        strokeDasharray={dashArray}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {lineStyle.arrowStart ? (
        <ArrowHead
          points={points}
          direction="start"
          size={arrowSize}
          color={color}
          opacity={opacity}
        />
      ) : null}
      {lineStyle.arrowEnd ? (
        <ArrowHead
          points={points}
          direction="end"
          size={arrowSize}
          color={color}
          opacity={opacity}
        />
      ) : null}
    </g>
  );
}

function ZoneGeometryPreview({ points }: { points: PointerPosition[] }) {
  const zoneStyle = useEditorTestDrawingOptionsStore(
    (state) => state.zoneStyle,
  );

  if (points.length < 2) {
    return null;
  }

  const weight = clamp(zoneStyle.weight, 1, 20);
  const strokeOpacity = zoneStyle.zoneStrokeEnabled
    ? clamp(zoneStyle.opacity, 0, 1)
    : 0;
  const fillOpacity = zoneStyle.zoneFillEnabled
    ? clamp(zoneStyle.fillOpacity, 0, 1)
    : 0;
  const isClosedShape = points.length >= 3;
  const clipId = "dromap-zone-geometry-preview-clip";
  const hatchSegments =
    isClosedShape && zoneStyle.zoneHatchingStyle !== "none"
      ? createHatchSegmentsForRing(points, {
          style: zoneStyle.zoneHatchingStyle,
          spacing: zoneStyle.zoneHatchingSpacing,
        })
      : [];
  const hatchDots =
    isClosedShape && zoneStyle.zoneDotsEnabled
      ? createHatchDotsForRing(points, {
          spacing: zoneStyle.zoneDotsSpacing,
          radius: zoneStyle.zoneDotsRadius,
          margin: zoneStyle.zoneDotsRadius,
        })
      : [];

  return (
    <g opacity={PREVIEW_OPACITY}>
      {isClosedShape ? (
        <defs>
          <clipPath id={clipId}>
            <path d={toPath(points, true)} />
          </clipPath>
        </defs>
      ) : null}

      <path
        d={toPath(points, isClosedShape)}
        fill={
          isClosedShape && zoneStyle.zoneFillEnabled
            ? zoneStyle.fillColor
            : "none"
        }
        fillOpacity={isClosedShape ? fillOpacity : 0}
        stroke="none"
      />

      {zoneStyle.zoneStrokeEnabled ? (
        <AlignedZoneSvgOutline
          points={points}
          closed={isClosedShape}
          color={zoneStyle.color}
          opacity={strokeOpacity}
          weight={weight}
          dashStyle={zoneStyle.dashStyle}
        />
      ) : null}

      {hatchSegments.length > 0 ? (
        <g
          clipPath={`url(#${clipId})`}
          stroke={zoneStyle.zoneHatchingColor}
          strokeWidth={zoneStyle.zoneHatchingWeight}
          strokeLinecap="butt"
        >
          {hatchSegments.map(([start, end], index) => (
            <line
              key={`${index}-${start.x}-${start.y}`}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
            />
          ))}
        </g>
      ) : null}

      {hatchDots.length > 0 ? (
        <g clipPath={`url(#${clipId})`} fill={zoneStyle.zoneDotsColor}>
          {hatchDots.map((point, index) => (
            <circle
              key={`${index}-${point.x}-${point.y}`}
              cx={point.x}
              cy={point.y}
              r={zoneStyle.zoneDotsRadius}
            />
          ))}
        </g>
      ) : null}
    </g>
  );
}

function getQuickShapePreviewPoints(
  kind: ReturnType<typeof getQuickShapeKind>,
  firstPoint: PointerPosition,
  secondPoint: PointerPosition,
): PointerPosition[] {
  if (kind === "circle") {
    const radius = Math.max(
      POINT_PREVIEW_SIZE,
      Math.hypot(secondPoint.x - firstPoint.x, secondPoint.y - firstPoint.y),
    );
    return buildLocalShapePoints("circle", radius * 2, radius * 2).map(
      (point) => ({
        x: firstPoint.x + point.x,
        y: firstPoint.y + point.y,
      }),
    );
  }

  const center = {
    x: (firstPoint.x + secondPoint.x) / 2,
    y: (firstPoint.y + secondPoint.y) / 2,
  };
  const width = Math.max(
    POINT_PREVIEW_SIZE * 2,
    kind === "ellipse"
      ? Math.abs(secondPoint.x - firstPoint.x) * Math.SQRT2
      : Math.abs(secondPoint.x - firstPoint.x),
  );
  const height = Math.max(
    POINT_PREVIEW_SIZE * 2,
    kind === "ellipse"
      ? Math.abs(secondPoint.y - firstPoint.y) * Math.SQRT2
      : Math.abs(secondPoint.y - firstPoint.y),
  );

  return buildLocalShapePoints(kind, width, height).map((point) => ({
    x: center.x + point.x,
    y: center.y + point.y,
  }));
}

function QuickShapeGeometryPreview({ points }: { points: PointerPosition[] }) {
  const zoneStyle = useEditorTestDrawingOptionsStore(
    (state) => state.zoneStyle,
  );

  if (points.length < 2) {
    return null;
  }

  const kind = getQuickShapeKind(zoneStyle);
  const shapePoints = getQuickShapePreviewPoints(kind, points[0], points[1]);
  const weight = clamp(zoneStyle.weight, 1, 20);
  const strokeOpacity = zoneStyle.zoneStrokeEnabled
    ? clamp(zoneStyle.opacity, 0, 1)
    : 0;
  const fillOpacity = zoneStyle.zoneFillEnabled
    ? clamp(zoneStyle.fillOpacity, 0, 1)
    : 0;
  const clipId = "dromap-quick-shape-geometry-preview-clip";
  const hatchSegments =
    zoneStyle.zoneHatchingStyle !== "none"
      ? createHatchSegmentsForRing(shapePoints, {
          style: zoneStyle.zoneHatchingStyle,
          spacing: zoneStyle.zoneHatchingSpacing,
        })
      : [];
  const hatchDots = zoneStyle.zoneDotsEnabled
    ? createHatchDotsForRing(shapePoints, {
        spacing: zoneStyle.zoneDotsSpacing,
        radius: zoneStyle.zoneDotsRadius,
        margin: zoneStyle.zoneDotsRadius,
      })
    : [];

  return (
    <g opacity={PREVIEW_OPACITY}>
      <defs>
        <clipPath id={clipId}>
          <path d={toPath(shapePoints, true)} />
        </clipPath>
      </defs>

      <path
        d={toPath(shapePoints, true)}
        fill={zoneStyle.zoneFillEnabled ? zoneStyle.fillColor : "none"}
        fillOpacity={fillOpacity}
        stroke="none"
      />

      {zoneStyle.zoneStrokeEnabled ? (
        <AlignedZoneSvgOutline
          points={shapePoints}
          closed={true}
          color={zoneStyle.color}
          opacity={strokeOpacity}
          weight={weight}
          dashStyle={zoneStyle.dashStyle}
          alignCorners={kind === "rectangle"}
        />
      ) : null}

      {hatchSegments.length > 0 ? (
        <g
          clipPath={`url(#${clipId})`}
          stroke={zoneStyle.zoneHatchingColor}
          strokeWidth={zoneStyle.zoneHatchingWeight}
          strokeLinecap="butt"
        >
          {hatchSegments.map(([start, end], index) => (
            <line
              key={`${index}-${start.x}-${start.y}`}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
            />
          ))}
        </g>
      ) : null}

      {hatchDots.length > 0 ? (
        <g clipPath={`url(#${clipId})`} fill={zoneStyle.zoneDotsColor}>
          {hatchDots.map((point, index) => (
            <circle
              key={`${index}-${point.x}-${point.y}`}
              cx={point.x}
              cy={point.y}
              r={zoneStyle.zoneDotsRadius}
            />
          ))}
        </g>
      ) : null}
    </g>
  );
}

function DrawingGeometryOverlay({
  activeTool,
  drawingPoints,
  pointerPosition,
  mapRevision,
}: {
  activeTool: EditorTestActiveTool;
  drawingPoints: LatLngValue[];
  pointerPosition: PointerPosition | null;
  mapRevision: number;
}) {
  const map = useMap();
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = map.getContainer();

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
    };

    updateSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(container);

    return () => observer.disconnect();
  }, [map]);

  const points = useMemo(() => {
    // mapRevision force le recalcul après pan/zoom même si les latlngs n'ont pas changé.
    void mapRevision;

    const projected = drawingPoints.map((latLng) => {
      const point = map.latLngToContainerPoint([latLng.lat, latLng.lng]);
      return { x: point.x, y: point.y };
    });

    if (pointerPosition) {
      projected.push(pointerPosition);
    }

    return projected;
  }, [drawingPoints, map, mapRevision, pointerPosition]);

  if (!GEOMETRY_PREVIEW_TOOLS.has(activeTool) || points.length < 2) {
    return null;
  }

  return createPortal(
    <svg
      aria-hidden="true"
      className="dromap-drawing-geometry-preview absolute left-0 top-0 select-none overflow-visible"
      width={containerSize.width}
      height={containerSize.height}
      viewBox={`0 0 ${containerSize.width} ${containerSize.height}`}
      style={{
        zIndex: PREVIEW_LAYER_Z_INDEX - 1,
        pointerEvents: "none",
      }}
    >
      {activeTool === "line" ? <LineGeometryPreview points={points} /> : null}
      {activeTool === "zone" ? <ZoneGeometryPreview points={points} /> : null}
      {activeTool === "shape" ? (
        <QuickShapeGeometryPreview points={points} />
      ) : null}
    </svg>,
    map.getContainer(),
  );
}

function PlacementPreviewStyles() {
  return (
    <style>{`
      .leaflet-container.dromap-placement-mode-active,
      .leaflet-container.dromap-placement-mode-active *,
      .leaflet-container.dromap-placement-pointer-on-map,
      .leaflet-container.dromap-placement-pointer-on-map * {
        cursor: none !important;
      }

      .leaflet-container.dromap-placement-pointer-on-map,
      .leaflet-container.dromap-placement-pointer-on-map .leaflet-pane,
      .leaflet-container.dromap-placement-pointer-on-map .leaflet-pane *,
      .leaflet-container.dromap-placement-pointer-on-map .leaflet-layer,
      .leaflet-container.dromap-placement-pointer-on-map .leaflet-layer *,
      .leaflet-container.dromap-placement-pointer-on-map .leaflet-tile,
      .leaflet-container.dromap-placement-pointer-on-map .leaflet-interactive,
      .leaflet-container.dromap-placement-pointer-on-map path,
      .leaflet-container.dromap-placement-pointer-on-map svg,
      .leaflet-container.dromap-placement-pointer-on-map canvas,
      .leaflet-container.dromap-editor-map.dromap-placement-mode-active .leaflet-pane,
      .leaflet-container.dromap-editor-map.dromap-placement-mode-active .leaflet-pane *,
      .leaflet-container.dromap-editor-map.dromap-placement-mode-active .leaflet-layer,
      .leaflet-container.dromap-editor-map.dromap-placement-mode-active .leaflet-layer *,
      .leaflet-container.dromap-editor-map.dromap-placement-mode-active .leaflet-tile,
      .leaflet-container.dromap-editor-map.dromap-placement-mode-active .leaflet-interactive,
      .leaflet-container.dromap-editor-map.dromap-placement-mode-active path,
      .leaflet-container.dromap-editor-map.dromap-placement-mode-active svg,
      .leaflet-container.dromap-editor-map.dromap-placement-mode-active canvas {
        cursor: none !important;
      }

      .leaflet-container.dromap-editor-map.dromap-placement-mode-active .leaflet-control,
      .leaflet-container.dromap-editor-map.dromap-placement-mode-active .leaflet-control * {
        pointer-events: auto !important;
      }

      .dromap-placement-mode-active .leaflet-tooltip,
      .dromap-placement-mode-active .leaflet-pm-tooltip,
      .dromap-placement-mode-active .leaflet-pm-error,
      .dromap-placement-mode-active .leaflet-pm-hint-marker,
      .dromap-placement-mode-active .leaflet-pm-cursor-marker,
      .dromap-placement-mode-active .leaflet-pm-temp-layer,
      .dromap-placement-mode-active .leaflet-pm-temp-line,
      .dromap-placement-mode-active .leaflet-pm-templine,
      .dromap-placement-mode-active .leaflet-pm-hint-line,
      .dromap-placement-mode-active .leaflet-marker-icon.marker-icon,
      .dromap-placement-mode-active .leaflet-marker-icon.leaflet-pm-marker,
      .dromap-placement-mode-active .leaflet-div-icon.leaflet-pm-marker {
        display: none !important;
      }

      .leaflet-container.dromap-placement-mode-active [class*="leaflet-dromap-feature-pane-"],
      .leaflet-container.dromap-placement-mode-active [class*="leaflet-dromap-feature-pane-"] *,
      .leaflet-container.dromap-placement-mode-active .leaflet-marker-pane,
      .leaflet-container.dromap-placement-mode-active .leaflet-marker-pane *,
      .leaflet-container.dromap-placement-mode-active .dromap-selectable-layer,
      .leaflet-container.dromap-placement-mode-active .dromap-line-selection-hitbox,
      .leaflet-container.dromap-placement-mode-active .dromap-marker-icon,
      .leaflet-container.dromap-placement-mode-active .dromap-marker-icon *,
      .leaflet-container.dromap-placement-mode-active .dromap-text-icon,
      .leaflet-container.dromap-placement-mode-active .dromap-text-icon *,
      .leaflet-container.dromap-editor-map.dromap-placement-mode-active .dromap-text-icon [data-dromap-text-click-target="true"],
      .leaflet-container.dromap-editor-map.dromap-placement-mode-active .dromap-text-icon [data-dromap-text-click-target="true"] *,
      .leaflet-container.dromap-editor-map.dromap-placement-mode-active .dromap-text-frame,
      .leaflet-container.dromap-editor-map.dromap-placement-mode-active .dromap-text-frame *,
      .leaflet-container.dromap-placement-mode-active .leaflet-interactive {
        cursor: none !important;
        pointer-events: none !important;
      }

      .dromap-placement-preview-layer,
      .dromap-placement-preview-layer * {
        cursor: none !important;
        pointer-events: none !important;
      }

      .dromap-drawing-geometry-preview,
      .dromap-drawing-geometry-preview * {
        pointer-events: none !important;
      }
    `}</style>
  );
}

export function DrawingToolPreviewLayer() {
  const map = useMap();
  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const activeTool = useEditorTestToolStore((state) => state.activeTool);
  const [pointerPosition, setPointerPosition] =
    useState<PointerPosition | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<LatLngValue[]>([]);
  const [mapRevision, setMapRevision] = useState(0);
  const geometryPointCandidateRef = useRef<GeometryPointCandidate | null>(null);

  const showPreview = shouldShowPlacementPreview(currentMode, activeTool);

  useEffect(() => {
    const container = map.getContainer();

    const resetCursor = () => {
      container.classList.remove("dromap-placement-mode-active");
      setMapPlacementCursorHidden(container, false);
    };

    if (!showPreview) {
      resetCursor();
      return;
    }

    container.classList.add("dromap-placement-mode-active");

    return resetCursor;
  }, [map, showPreview]);

  useEffect(() => {
    setDrawingPoints([]);
    setPointerPosition(null);
  }, [activeTool, currentMode]);

  useEffect(() => {
    const container = map.getContainer();

    if (!showPreview) {
      setPointerPosition(null);
      setDrawingPoints([]);
      setMapPlacementCursorHidden(container, false);
      return;
    }

    const updatePointerPosition = (event: PointerEvent | MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const isInsideMapRect =
        x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      const isOnMapSurface =
        isInsideMapRect && isLeafletMapSurfaceTarget(event.target, container);

      if (!isOnMapSurface) {
        setPointerPosition(null);
        setMapPlacementCursorHidden(container, false);
        return;
      }

      forceMapPlacementCursorHidden(container);
      setPointerPosition({ x, y });
    };

    const keepCursorHiddenDuringPlacementClick = (
      event: PointerEvent | MouseEvent,
    ) => {
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const isInsideMapRect =
        x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;

      if (
        !isInsideMapRect ||
        !isLeafletMapSurfaceTarget(event.target, container)
      ) {
        return;
      }

      forceMapPlacementCursorHidden(container);
      setPointerPosition({ x, y });
    };

    const hidePointerPreview = () => {
      setPointerPosition(null);
      setMapPlacementCursorHidden(container, false);
    };

    document.addEventListener("pointermove", updatePointerPosition, true);
    document.addEventListener("pointerdown", updatePointerPosition, true);
    document.addEventListener("pointerup", updatePointerPosition, true);
    document.addEventListener("mousemove", updatePointerPosition, true);
    document.addEventListener(
      "mousedown",
      keepCursorHiddenDuringPlacementClick,
      true,
    );
    document.addEventListener(
      "mouseup",
      keepCursorHiddenDuringPlacementClick,
      true,
    );
    document.addEventListener(
      "click",
      keepCursorHiddenDuringPlacementClick,
      true,
    );
    container.addEventListener("pointerleave", hidePointerPreview, true);
    window.addEventListener("blur", hidePointerPreview);

    return () => {
      document.removeEventListener("pointermove", updatePointerPosition, true);
      document.removeEventListener("pointerdown", updatePointerPosition, true);
      document.removeEventListener("pointerup", updatePointerPosition, true);
      document.removeEventListener("mousemove", updatePointerPosition, true);
      document.removeEventListener(
        "mousedown",
        keepCursorHiddenDuringPlacementClick,
        true,
      );
      document.removeEventListener(
        "mouseup",
        keepCursorHiddenDuringPlacementClick,
        true,
      );
      document.removeEventListener(
        "click",
        keepCursorHiddenDuringPlacementClick,
        true,
      );
      container.removeEventListener("pointerleave", hidePointerPreview, true);
      window.removeEventListener("blur", hidePointerPreview);
      setMapPlacementCursorHidden(container, false);
    };
  }, [map, showPreview]);

  useEffect(() => {
    if (!showPreview || !GEOMETRY_PREVIEW_TOOLS.has(activeTool)) {
      setDrawingPoints([]);
      return;
    }

    const container = map.getContainer();

    const isPointerInsideMap = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      return x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
    };

    const rememberPotentialDrawingPoint = (event: PointerEvent) => {
      const latestMode = useEditorTestModeStore.getState().currentMode;
      const latestTool = useEditorTestToolStore.getState().activeTool;

      if (latestMode !== "edit" || latestTool !== activeTool) {
        geometryPointCandidateRef.current = null;
        return;
      }

      if (event.button !== 0 || !isPointerInsideMap(event)) {
        geometryPointCandidateRef.current = null;
        return;
      }

      /**
       * Important : en outil Trait/Zone, un point DroMap correspond à un
       * clic court et simple. Un clic maintenu avec déplacement ne doit pas
       * amorcer notre preview custom, sinon on affiche un segment fantôme
       * alors que Geoman ne pose pas réellement de point.
       */
      geometryPointCandidateRef.current = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        timeStamp: event.timeStamp,
      };
    };

    const confirmPotentialDrawingPoint = (event: PointerEvent) => {
      const candidate = geometryPointCandidateRef.current;
      geometryPointCandidateRef.current = null;

      const latestMode = useEditorTestModeStore.getState().currentMode;
      const latestTool = useEditorTestToolStore.getState().activeTool;

      if (!candidate || latestMode !== "edit" || latestTool !== activeTool) {
        return;
      }

      if (
        event.pointerId !== candidate.pointerId ||
        !isPointerInsideMap(event)
      ) {
        return;
      }

      const distance = getClientDistance(candidate, event);
      const duration = event.timeStamp - candidate.timeStamp;

      if (
        distance > GEOMETRY_POINT_CLICK_MAX_DISTANCE ||
        duration > GEOMETRY_POINT_CLICK_MAX_DURATION_MS
      ) {
        return;
      }

      const latLng = map.mouseEventToLatLng(event);

      setDrawingPoints((currentPoints) => {
        if (latestTool === "shape" && currentPoints.length >= 1) {
          return [];
        }

        return [...currentPoints, { lat: latLng.lat, lng: latLng.lng }];
      });
    };

    const cancelPotentialDrawingPoint = () => {
      geometryPointCandidateRef.current = null;
    };

    const resetDrawingPreview = () => {
      geometryPointCandidateRef.current = null;

      window.setTimeout(() => {
        setDrawingPoints([]);
      }, 0);
    };

    const forceMapRevision = () => {
      setMapRevision((value) => value + 1);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawingPoints([]);
      }
    };

    container.addEventListener(
      "pointerdown",
      rememberPotentialDrawingPoint,
      true,
    );
    container.addEventListener("pointerup", confirmPotentialDrawingPoint, true);
    container.addEventListener(
      "pointercancel",
      cancelPotentialDrawingPoint,
      true,
    );
    container.addEventListener(
      "pointerleave",
      cancelPotentialDrawingPoint,
      true,
    );
    map.on("pm:create pm:drawend pm:drawstart", resetDrawingPreview);
    map.on("move zoom resize", forceMapRevision);
    window.addEventListener("keydown", handleEscape, true);

    return () => {
      container.removeEventListener(
        "pointerdown",
        rememberPotentialDrawingPoint,
        true,
      );
      container.removeEventListener(
        "pointerup",
        confirmPotentialDrawingPoint,
        true,
      );
      container.removeEventListener(
        "pointercancel",
        cancelPotentialDrawingPoint,
        true,
      );
      container.removeEventListener(
        "pointerleave",
        cancelPotentialDrawingPoint,
        true,
      );
      geometryPointCandidateRef.current = null;
      map.off("pm:create pm:drawend pm:drawstart", resetDrawingPreview);
      map.off("move zoom resize", forceMapRevision);
      window.removeEventListener("keydown", handleEscape, true);
    };
  }, [activeTool, map, showPreview]);

  if (!showPreview) {
    return createPortal(<PlacementPreviewStyles />, map.getContainer());
  }

  return createPortal(
    <>
      <PlacementPreviewStyles />

      <DrawingGeometryOverlay
        activeTool={activeTool}
        drawingPoints={drawingPoints}
        pointerPosition={pointerPosition}
        mapRevision={mapRevision}
      />

      {pointerPosition ? (
        <div
          aria-hidden="true"
          className="dromap-placement-preview-layer"
          style={{
            position: "absolute",
            left: pointerPosition.x,
            top: pointerPosition.y,
            zIndex: PREVIEW_LAYER_Z_INDEX,
            pointerEvents: "none",
            transform: getCursorPreviewTransform(activeTool),
            willChange: "left, top",
          }}
        >
          <CursorPlacementPreview activeTool={activeTool} />
        </div>
      ) : null}
    </>,
    map.getContainer(),
  );
}
