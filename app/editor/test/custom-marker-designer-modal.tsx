"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import {
  CUSTOM_MARKER_CANVAS_SIZE,
  type DroMapCustomMarkerDefinition,
  type DroMapDrawnMarkerDashStyle,
  type DroMapDrawnMarkerElement,
  type DroMapDrawnMarkerHatchingStyle,
  type DroMapDrawnMarkerLineElement,
  type DroMapDrawnMarkerPathElement,
  type DroMapDrawnMarkerPoint,
  type DroMapDrawnMarkerShapeElement,
  type DroMapDrawnMarkerShapeKind,
  type DroMapDrawnMarkerTextElement,
} from "@/stores/editor-test-custom-markers";
import { ColorPicker } from "./color-picker";
import { createDrawnMarkerDataUrl } from "./custom-marker-rendering";

type DesignerTool =
  | "select"
  | "line"
  | "arrow"
  | "freehand-line"
  | "freehand-zone"
  | "polygon"
  | "rectangle"
  | "circle"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "star"
  | "text";

type Point = DroMapDrawnMarkerPoint;
type SnapGuide = { x?: number; y?: number; point?: Point } | null;

type LinePreset = {
  color: string;
  opacity: number;
  weight: number;
  dashStyle: DroMapDrawnMarkerDashStyle;
  arrowStart: boolean;
  arrowEnd: boolean;
  smoothing: number;
};

type ZonePreset = {
  strokeEnabled: boolean;
  color: string;
  opacity: number;
  weight: number;
  dashStyle: DroMapDrawnMarkerDashStyle;
  fillEnabled: boolean;
  fillColor: string;
  fillOpacity: number;
  hatchingStyle: DroMapDrawnMarkerHatchingStyle;
  hatchingColor: string;
  hatchingWeight: number;
  hatchingSpacing: number;
  dotsEnabled: boolean;
  dotsColor: string;
  dotsRadius: number;
  dotsSpacing: number;
  smoothing: number;
};

type TextPreset = {
  color: string;
  opacity: number;
  fontSize: number;
  backgroundEnabled: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
  borderEnabled: boolean;
  borderColor: string;
  borderWidth: number;
};

type DragState =
  | {
      kind: "create";
      tool: Exclude<
        DesignerTool,
        "select" | "text" | "freehand-line" | "freehand-zone"
      >;
      start: Point;
    }
  | {
      kind: "freehand";
      closed: boolean;
      points: Point[];
    }
  | {
      kind: "move";
      elementId: string;
      start: Point;
      original: DroMapDrawnMarkerElement;
    }
  | {
      kind: "resize-shape";
      elementId: string;
      corner: "nw" | "ne" | "sw" | "se";
      original: DroMapDrawnMarkerShapeElement;
    }
  | {
      kind: "resize-text";
      elementId: string;
      original: DroMapDrawnMarkerTextElement;
      start: Point;
    }
  | {
      kind: "line-point";
      elementId: string;
      endpoint: "start" | "end";
      original: DroMapDrawnMarkerLineElement;
    }
  | {
      kind: "rotate";
      elementId: string;
      center: Point;
      startPointerAngle: number;
      originalRotation: number;
    };

type ClickDraft =
  | {
      kind: "polyline";
      tool: "line" | "arrow" | "polygon";
      points: Point[];
    }
  | {
      kind: "shape";
      tool:
        "rectangle" | "circle" | "ellipse" | "triangle" | "diamond" | "star";
      start: Point;
    };

type CustomMarkerDesignerModalProps = {
  initialMarker?: DroMapCustomMarkerDefinition | null;
  onCancel: () => void;
  onSave: (input: {
    name: string;
    elements: DroMapDrawnMarkerElement[];
    dataUrl: string;
  }) => void;
};

const SNAP_DISTANCE = 10;
const MIN_ELEMENT_SIZE = 8;
const DEFAULT_LINE_PRESET: LinePreset = {
  color: "#111827",
  opacity: 1,
  weight: 2,
  dashStyle: "solid",
  arrowStart: false,
  arrowEnd: false,
  smoothing: 45,
};
const DEFAULT_ZONE_PRESET: ZonePreset = {
  strokeEnabled: true,
  color: "#111827",
  opacity: 1,
  weight: 2,
  dashStyle: "solid",
  fillEnabled: false,
  fillColor: "#2563eb",
  fillOpacity: 0.25,
  hatchingStyle: "none",
  hatchingColor: "#111827",
  hatchingWeight: 2,
  hatchingSpacing: 14,
  dotsEnabled: false,
  dotsColor: "#111827",
  dotsRadius: 2,
  dotsSpacing: 14,
  smoothing: 45,
};
const DEFAULT_TEXT_PRESET: TextPreset = {
  color: "#111827",
  opacity: 1,
  fontSize: 42,
  backgroundEnabled: false,
  backgroundColor: "#ffffff",
  backgroundOpacity: 0.85,
  borderEnabled: false,
  borderColor: "#111827",
  borderWidth: 2,
};

const TOOL_GROUPS: Array<{
  label: string;
  tools: Array<{ id: DesignerTool; label: string; icon: string }>;
}> = [
  {
    label: "Sélection",
    tools: [{ id: "select", label: "Sélection", icon: "↖" }],
  },
  {
    label: "Traits",
    tools: [
      { id: "line", label: "Trait", icon: "╱" },
      { id: "arrow", label: "Flèche", icon: "→" },
      { id: "freehand-line", label: "Dessin libre", icon: "〰" },
    ],
  },
  {
    label: "Zones",
    tools: [
      { id: "polygon", label: "Zone", icon: "⬠" },
      { id: "freehand-zone", label: "Zone libre", icon: "⌁" },
      { id: "rectangle", label: "Rectangle", icon: "▭" },
      { id: "circle", label: "Cercle", icon: "○" },
      { id: "ellipse", label: "Ellipse", icon: "⬭" },
      { id: "triangle", label: "Triangle", icon: "△" },
      { id: "diamond", label: "Losange", icon: "◇" },
      { id: "star", label: "Étoile", icon: "☆" },
    ],
  },
  {
    label: "Texte",
    tools: [{ id: "text", label: "Texte", icon: "T" }],
  },
];

function createElementId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `marker-element-${crypto.randomUUID()}`;
  }
  return `marker-element-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clamp(value: number, min = 0, max = CUSTOM_MARKER_CANVAS_SIZE) {
  return Math.min(max, Math.max(min, value));
}

function cloneElement<T extends DroMapDrawnMarkerElement>(element: T): T {
  return JSON.parse(JSON.stringify(element)) as T;
}

function cloneElements(elements: DroMapDrawnMarkerElement[]) {
  return elements.map(cloneElement);
}

function elementsEqual(
  first: DroMapDrawnMarkerElement[],
  second: DroMapDrawnMarkerElement[],
) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function normalizeRotation(value: number) {
  let next = Number.isFinite(value) ? value : 0;
  while (next > 180) next -= 360;
  while (next < -180) next += 360;
  return Math.round(next * 10) / 10;
}

function getSvgPointFromClient(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): Point {
  const rect = svg.getBoundingClientRect();
  return {
    x: clamp(
      ((clientX - rect.left) / Math.max(1, rect.width)) *
        CUSTOM_MARKER_CANVAS_SIZE,
    ),
    y: clamp(
      ((clientY - rect.top) / Math.max(1, rect.height)) *
        CUSTOM_MARKER_CANVAS_SIZE,
    ),
  };
}

function getSvgPoint(event: React.PointerEvent<SVGSVGElement>): Point {
  return getSvgPointFromClient(
    event.currentTarget,
    event.clientX,
    event.clientY,
  );
}

function getStarPoints(element: DroMapDrawnMarkerShapeElement) {
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;
  const radiusX = element.width / 2;
  const radiusY = element.height / 2;
  const points: string[] = [];
  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const ratio = index % 2 === 0 ? 1 : 0.44;
    points.push(
      `${centerX + Math.cos(angle) * radiusX * ratio},${centerY + Math.sin(angle) * radiusY * ratio}`,
    );
  }
  return points.join(" ");
}

function getTrianglePoints(element: DroMapDrawnMarkerShapeElement) {
  return [
    `${element.x + element.width / 2},${element.y}`,
    `${element.x + element.width},${element.y + element.height}`,
    `${element.x},${element.y + element.height}`,
  ].join(" ");
}

function getDiamondPoints(element: DroMapDrawnMarkerShapeElement) {
  return [
    `${element.x + element.width / 2},${element.y}`,
    `${element.x + element.width},${element.y + element.height / 2}`,
    `${element.x + element.width / 2},${element.y + element.height}`,
    `${element.x},${element.y + element.height / 2}`,
  ].join(" ");
}

function normalizeShapeBounds(start: Point, end: Point, forceSquare = false) {
  let width = Math.max(MIN_ELEMENT_SIZE, Math.abs(end.x - start.x));
  let height = Math.max(MIN_ELEMENT_SIZE, Math.abs(end.y - start.y));
  if (forceSquare) {
    const size = Math.max(width, height);
    width = size;
    height = size;
  }
  return {
    x: end.x >= start.x ? start.x : start.x - width,
    y: end.y >= start.y ? start.y : start.y - height,
    width,
    height,
  };
}

function getBounds(element: DroMapDrawnMarkerElement) {
  if (element.type === "shape" || element.type === "text") {
    return {
      minX: element.x,
      minY: element.y,
      maxX: element.x + element.width,
      maxY: element.y + element.height,
    };
  }
  if (element.type === "path") {
    const xs = element.points.map((point) => point.x);
    const ys = element.points.map((point) => point.y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  }
  return {
    minX: Math.min(element.x1, element.x2),
    minY: Math.min(element.y1, element.y2),
    maxX: Math.max(element.x1, element.x2),
    maxY: Math.max(element.y1, element.y2),
  };
}

function getAnchors(element: DroMapDrawnMarkerElement): Point[] {
  const bounds = getBounds(element);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const anchors: Point[] = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.minX, y: bounds.maxY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: centerX, y: centerY },
    { x: centerX, y: bounds.minY },
    { x: centerX, y: bounds.maxY },
    { x: bounds.minX, y: centerY },
    { x: bounds.maxX, y: centerY },
  ];
  if (element.type === "line" || element.type === "arrow") {
    anchors.push(
      { x: element.x1, y: element.y1 },
      { x: element.x2, y: element.y2 },
    );
  }
  if (element.type === "path") {
    anchors.push(
      ...element.points.filter(
        (_, index) => index === 0 || index === element.points.length - 1,
      ),
    );
  }
  return anchors;
}

function getTargetAnchors(
  elements: DroMapDrawnMarkerElement[],
  excludeId?: string,
) {
  return elements
    .filter((element) => element.id !== excludeId)
    .flatMap(getAnchors);
}

function snapPoint(point: Point, targets: Point[]) {
  let best: { target: Point; distance: number } | null = null;
  for (const target of targets) {
    const distance = Math.hypot(point.x - target.x, point.y - target.y);
    if (distance <= SNAP_DISTANCE && (!best || distance < best.distance)) {
      best = { target, distance };
    }
  }
  if (best) {
    return {
      point: { ...best.target },
      guide: {
        x: best.target.x,
        y: best.target.y,
        point: best.target,
      } as SnapGuide,
    };
  }

  let snapX: number | undefined;
  let snapY: number | undefined;
  let xDistance = SNAP_DISTANCE + 1;
  let yDistance = SNAP_DISTANCE + 1;
  for (const target of targets) {
    const dx = Math.abs(point.x - target.x);
    const dy = Math.abs(point.y - target.y);
    if (dx < xDistance && dx <= SNAP_DISTANCE) {
      xDistance = dx;
      snapX = target.x;
    }
    if (dy < yDistance && dy <= SNAP_DISTANCE) {
      yDistance = dy;
      snapY = target.y;
    }
  }
  return {
    point: { x: snapX ?? point.x, y: snapY ?? point.y },
    guide:
      snapX !== undefined || snapY !== undefined
        ? ({ x: snapX, y: snapY } as SnapGuide)
        : null,
  };
}

function translateElement(
  element: DroMapDrawnMarkerElement,
  dx: number,
  dy: number,
): DroMapDrawnMarkerElement {
  const bounds = getBounds(element);
  const safeDx = clamp(
    dx,
    -bounds.minX,
    CUSTOM_MARKER_CANVAS_SIZE - bounds.maxX,
  );
  const safeDy = clamp(
    dy,
    -bounds.minY,
    CUSTOM_MARKER_CANVAS_SIZE - bounds.maxY,
  );

  if (element.type === "shape" || element.type === "text") {
    return { ...element, x: element.x + safeDx, y: element.y + safeDy };
  }
  if (element.type === "path") {
    const movePoints = (points: Point[] | undefined) =>
      points?.map((point) => ({
        x: point.x + safeDx,
        y: point.y + safeDy,
      }));
    return {
      ...element,
      points: movePoints(element.points) ?? element.points,
      rawPoints: movePoints(element.rawPoints),
    };
  }
  return {
    ...element,
    x1: element.x1 + safeDx,
    y1: element.y1 + safeDy,
    x2: element.x2 + safeDx,
    y2: element.y2 + safeDy,
  };
}

function snapMovedElement(
  original: DroMapDrawnMarkerElement,
  dx: number,
  dy: number,
  targets: Point[],
) {
  const candidate = translateElement(original, dx, dy);
  const anchors = getAnchors(candidate);
  let best: { dx: number; dy: number; distance: number; target: Point } | null =
    null;
  for (const anchor of anchors) {
    for (const target of targets) {
      const correctionX = target.x - anchor.x;
      const correctionY = target.y - anchor.y;
      const distance = Math.hypot(correctionX, correctionY);
      if (distance <= SNAP_DISTANCE && (!best || distance < best.distance)) {
        best = {
          dx: correctionX,
          dy: correctionY,
          distance,
          target,
        };
      }
    }
  }
  if (!best) return { element: candidate, guide: null as SnapGuide };
  return {
    element: translateElement(candidate, best.dx, best.dy),
    guide: { x: best.target.x, y: best.target.y, point: best.target },
  };
}

function getElementCenter(element: DroMapDrawnMarkerElement): Point {
  const bounds = getBounds(element);
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

function smoothPath(points: Point[], smoothing: number, closed: boolean) {
  if (points.length < 3 || smoothing <= 0)
    return points.map((point) => ({ ...point }));
  const passes = Math.max(1, Math.round((smoothing / 100) * 4));
  let current = points.map((point) => ({ ...point }));
  for (let pass = 0; pass < passes; pass += 1) {
    const next: Point[] = [];
    if (!closed) next.push(current[0]);
    const limit = closed ? current.length : current.length - 1;
    for (let index = 0; index < limit; index += 1) {
      const first = current[index];
      const second = current[(index + 1) % current.length];
      next.push({
        x: first.x * 0.75 + second.x * 0.25,
        y: first.y * 0.75 + second.y * 0.25,
      });
      next.push({
        x: first.x * 0.25 + second.x * 0.75,
        y: first.y * 0.25 + second.y * 0.75,
      });
    }
    if (!closed) next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

function getDashArray(
  dashStyle: DroMapDrawnMarkerDashStyle | undefined,
  width: number,
) {
  if (dashStyle === "dashed") {
    return `${Math.max(6, width * 4)} ${Math.max(4, width * 2.5)}`;
  }
  if (dashStyle === "dotted") {
    return `0 ${Math.max(5, width * 2.8)}`;
  }
  return undefined;
}

function getPatternId(prefix: string, elementId: string) {
  return `designer-${prefix}-${elementId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function ShapePrimitive({
  element,
  fill,
  fillOpacity,
  stroke,
  strokeOpacity,
  strokeWidth,
  strokeDasharray,
}: {
  element: DroMapDrawnMarkerShapeElement;
  fill: string;
  fillOpacity?: number;
  stroke: string;
  strokeOpacity?: number;
  strokeWidth?: number;
  strokeDasharray?: string;
}) {
  const common = {
    fill,
    fillOpacity,
    stroke,
    strokeOpacity,
    strokeWidth,
    strokeDasharray,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
    transform: `rotate(${element.rotation} ${element.x + element.width / 2} ${element.y + element.height / 2})`,
  };

  if (element.shape === "ellipse" || element.shape === "circle") {
    return (
      <ellipse
        cx={element.x + element.width / 2}
        cy={element.y + element.height / 2}
        rx={element.width / 2}
        ry={element.height / 2}
        {...common}
      />
    );
  }
  if (element.shape === "triangle") {
    return <polygon points={getTrianglePoints(element)} {...common} />;
  }
  if (element.shape === "diamond") {
    return <polygon points={getDiamondPoints(element)} {...common} />;
  }
  if (element.shape === "star") {
    return <polygon points={getStarPoints(element)} {...common} />;
  }
  return (
    <rect
      x={element.x}
      y={element.y}
      width={element.width}
      height={element.height}
      rx={Math.min(18, element.width / 8, element.height / 8)}
      {...common}
    />
  );
}

function MarkerElementVisual({
  element,
  selected,
  onPointerDown,
  opacityMultiplier = 1,
}: {
  element: DroMapDrawnMarkerElement;
  selected: boolean;
  onPointerDown: (event: React.PointerEvent<SVGElement>) => void;
  opacityMultiplier?: number;
}) {
  const pointerProps = {
    onPointerDown,
    style: { cursor: selected ? "move" : "pointer" },
  };

  if (element.type === "shape") {
    const dash = getDashArray(element.dashStyle, element.strokeWidth);
    return (
      <g {...pointerProps} opacity={opacityMultiplier}>
        {element.fillEnabled ? (
          <ShapePrimitive
            element={element}
            fill={element.fillColor}
            fillOpacity={element.fillOpacity ?? 0.25}
            stroke="none"
          />
        ) : null}
        {element.hatchingStyle && element.hatchingStyle !== "none" ? (
          <ShapePrimitive
            element={element}
            fill={`url(#${getPatternId("hatch", element.id)})`}
            stroke="none"
          />
        ) : null}
        {element.dotsEnabled ? (
          <ShapePrimitive
            element={element}
            fill={`url(#${getPatternId("dots", element.id)})`}
            stroke="none"
          />
        ) : null}
        {element.strokeEnabled !== false && element.strokeWidth > 0 ? (
          <ShapePrimitive
            element={element}
            fill="none"
            stroke={element.strokeColor}
            strokeOpacity={element.strokeOpacity ?? 1}
            strokeWidth={element.strokeWidth}
            strokeDasharray={dash}
          />
        ) : null}
        {!element.fillEnabled &&
        element.strokeEnabled === false &&
        (!element.hatchingStyle || element.hatchingStyle === "none") &&
        !element.dotsEnabled ? (
          <ShapePrimitive
            element={element}
            fill="transparent"
            stroke="transparent"
            strokeWidth={12}
          />
        ) : null}
      </g>
    );
  }

  if (element.type === "path") {
    const points = element.points
      .map((point) => `${point.x},${point.y}`)
      .join(" ");
    const dash = getDashArray(element.dashStyle, element.strokeWidth);
    const Primitive = element.closed ? "polygon" : "polyline";
    return (
      <g {...pointerProps} opacity={opacityMultiplier}>
        {element.closed && element.fillEnabled ? (
          <Primitive
            points={points}
            fill={element.fillColor}
            fillOpacity={element.fillOpacity ?? 0.25}
            stroke="none"
          />
        ) : null}
        {element.closed &&
        element.hatchingStyle &&
        element.hatchingStyle !== "none" ? (
          <Primitive
            points={points}
            fill={`url(#${getPatternId("hatch", element.id)})`}
            stroke="none"
          />
        ) : null}
        {element.closed && element.dotsEnabled ? (
          <Primitive
            points={points}
            fill={`url(#${getPatternId("dots", element.id)})`}
            stroke="none"
          />
        ) : null}
        {!element.closed || element.strokeEnabled !== false ? (
          <Primitive
            points={points}
            fill="none"
            stroke={element.strokeColor}
            strokeOpacity={element.strokeOpacity ?? 1}
            strokeWidth={element.strokeWidth}
            strokeDasharray={dash}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            markerStart={
              !element.closed && element.arrowStart
                ? "url(#custom-marker-designer-arrow-start)"
                : undefined
            }
            markerEnd={
              !element.closed && element.arrowEnd
                ? "url(#custom-marker-designer-arrow-end)"
                : undefined
            }
          />
        ) : null}
      </g>
    );
  }

  if (element.type === "text") {
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    return (
      <g
        {...pointerProps}
        transform={`rotate(${element.rotation} ${centerX} ${centerY})`}
        opacity={opacityMultiplier}
      >
        {element.backgroundEnabled || element.borderEnabled ? (
          <rect
            x={element.x}
            y={element.y}
            width={element.width}
            height={element.height}
            rx="8"
            fill={
              element.backgroundEnabled
                ? (element.backgroundColor ?? "#ffffff")
                : "transparent"
            }
            fillOpacity={
              element.backgroundEnabled
                ? (element.backgroundOpacity ?? 0.85)
                : 0
            }
            stroke={
              element.borderEnabled
                ? (element.borderColor ?? "#111827")
                : "transparent"
            }
            strokeWidth={element.borderEnabled ? (element.borderWidth ?? 2) : 0}
          />
        ) : null}
        <text
          x={centerX}
          y={centerY}
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="Arial, Helvetica, sans-serif"
          fontWeight="700"
          fontSize={element.fontSize}
          fill={element.color}
          fillOpacity={element.opacity ?? 1}
          style={{ userSelect: "none" }}
        >
          {element.text}
        </text>
      </g>
    );
  }

  const dash = getDashArray(element.dashStyle, element.strokeWidth);
  const arrowStart = element.arrowStart === true;
  const arrowEnd = element.arrowEnd === true || element.type === "arrow";
  return (
    <g {...pointerProps} opacity={opacityMultiplier}>
      <line
        x1={element.x1}
        y1={element.y1}
        x2={element.x2}
        y2={element.y2}
        stroke={element.strokeColor}
        strokeOpacity={element.strokeOpacity ?? 1}
        strokeWidth={element.strokeWidth}
        strokeDasharray={dash}
        strokeLinecap="round"
        markerStart={
          arrowStart ? "url(#custom-marker-designer-arrow-start)" : undefined
        }
        markerEnd={
          arrowEnd ? "url(#custom-marker-designer-arrow-end)" : undefined
        }
      />
    </g>
  );
}

function PatternDefinitions({
  elements,
}: {
  elements: DroMapDrawnMarkerElement[];
}) {
  return (
    <>
      {elements.flatMap((element) => {
        if (
          element.type !== "shape" &&
          !(element.type === "path" && element.closed)
        ) {
          return [];
        }
        const definitions: ReactNode[] = [];
        if (element.hatchingStyle && element.hatchingStyle !== "none") {
          const spacing = Math.max(3, element.hatchingSpacing ?? 14);
          const weight = Math.max(0.5, element.hatchingWeight ?? 2);
          const color = element.hatchingColor ?? element.strokeColor;
          let path = "";
          if (element.hatchingStyle === "diagonal-right") {
            path = `M-${spacing} ${spacing} L${spacing} -${spacing} M0 ${spacing * 2} L${spacing * 2} 0`;
          } else if (element.hatchingStyle === "diagonal-left") {
            path = `M-${spacing} 0 L${spacing} ${spacing * 2} M0 -${spacing} L${spacing * 2} ${spacing}`;
          } else if (element.hatchingStyle === "horizontal") {
            path = `M0 ${spacing / 2} H${spacing}`;
          } else {
            path = `M${spacing / 2} 0 V${spacing}`;
          }
          definitions.push(
            <pattern
              key={`hatch-${element.id}`}
              id={getPatternId("hatch", element.id)}
              width={spacing}
              height={spacing}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={weight}
                strokeLinecap="round"
              />
            </pattern>,
          );
        }
        if (element.dotsEnabled) {
          const spacing = Math.max(3, element.dotsSpacing ?? 14);
          definitions.push(
            <pattern
              key={`dots-${element.id}`}
              id={getPatternId("dots", element.id)}
              width={spacing}
              height={spacing}
              patternUnits="userSpaceOnUse"
            >
              <circle
                cx={spacing / 2}
                cy={spacing / 2}
                r={Math.max(0.5, element.dotsRadius ?? 2)}
                fill={element.dotsColor ?? element.strokeColor}
              />
            </pattern>,
          );
        }
        return definitions;
      })}
    </>
  );
}

function ToolButton({
  tool,
  activeTool,
  onChoose,
}: {
  tool: { id: DesignerTool; label: string; icon: string };
  activeTool: DesignerTool;
  onChoose: (tool: DesignerTool) => void;
}) {
  const active = activeTool === tool.id;
  return (
    <button
      type="button"
      data-dromap-tool-control="true"
      aria-pressed={active}
      onClick={() => onChoose(tool.id)}
      className={[
        "flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl border px-1 text-center shadow-sm transition",
        active
          ? "border-blue-700 bg-blue-600 text-white shadow-blue-200/70"
          : "border-slate-200 bg-white text-slate-800 hover:border-blue-300 hover:bg-blue-50/60",
      ].join(" ")}
      title={tool.label}
    >
      <span className="flex h-7 items-center justify-center text-xl leading-none">
        {tool.icon}
      </span>
      <span className="max-w-full text-[9px] font-extrabold uppercase leading-none tracking-wide">
        {tool.label}
      </span>
    </button>
  );
}

function SettingSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <h3 className="mb-3 text-xs font-black text-slate-950">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="dromap-marker-setting-row flex items-center justify-between gap-3 text-xs">
      <span>{label}</span>
      <ColorPicker value={value} onChange={onChange} ariaLabel={label} />
    </div>
  );
}

function RangeRow({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="dromap-marker-setting-row block text-xs">
      <span className="mb-1 flex items-center justify-between gap-2">
        <span>{label}</span>
        <strong>
          {Number.isInteger(value) ? value : value.toFixed(2)}
          {suffix}
        </strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-blue-600"
      />
    </label>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="dromap-marker-setting-row flex items-center justify-between gap-3 text-xs">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 accent-blue-600"
      />
    </label>
  );
}

function DashRow({
  value,
  onChange,
}: {
  value: DroMapDrawnMarkerDashStyle;
  onChange: (value: DroMapDrawnMarkerDashStyle) => void;
}) {
  return (
    <label className="dromap-marker-setting-row flex items-center justify-between gap-3 text-xs">
      <span>Trait</span>
      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value as DroMapDrawnMarkerDashStyle)
        }
        className="w-36 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
      >
        <option value="solid">Plein</option>
        <option value="dashed">Tireté</option>
        <option value="dotted">Pointillé</option>
      </select>
    </label>
  );
}

function HatchingRow({
  value,
  onChange,
}: {
  value: DroMapDrawnMarkerHatchingStyle;
  onChange: (value: DroMapDrawnMarkerHatchingStyle) => void;
}) {
  return (
    <label className="dromap-marker-setting-row flex items-center justify-between gap-3 text-xs">
      <span>Hachures</span>
      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value as DroMapDrawnMarkerHatchingStyle)
        }
        className="w-36 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
      >
        <option value="none">Aucune</option>
        <option value="diagonal-right">Diagonale /</option>
        <option value="diagonal-left">Diagonale \</option>
        <option value="horizontal">Horizontale</option>
        <option value="vertical">Verticale</option>
      </select>
    </label>
  );
}

function toolTitle(tool: DesignerTool) {
  return (
    TOOL_GROUPS.flatMap((group) => group.tools).find((item) => item.id === tool)
      ?.label ?? "Outil"
  );
}

export function CustomMarkerDesignerModal({
  initialMarker,
  onCancel,
  onSave,
}: CustomMarkerDesignerModalProps) {
  const initialElements = useMemo(
    () => initialMarker?.elements?.map(cloneElement) ?? [],
    [initialMarker],
  );
  const [name, setName] = useState(
    initialMarker?.name ?? "Mon marqueur dessiné",
  );
  const [elements, setElements] =
    useState<DroMapDrawnMarkerElement[]>(initialElements);
  const elementsRef = useRef(elements);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(
    initialElements[0]?.id ?? null,
  );
  const [activeTool, setActiveTool] = useState<DesignerTool>("select");
  const [linePreset, setLinePreset] = useState<LinePreset>(DEFAULT_LINE_PRESET);
  const [zonePreset, setZonePreset] = useState<ZonePreset>(DEFAULT_ZONE_PRESET);
  const [textPreset, setTextPreset] = useState<TextPreset>(DEFAULT_TEXT_PRESET);
  const [previewElement, setPreviewElement] =
    useState<DroMapDrawnMarkerElement | null>(null);
  const [snapGuide, setSnapGuide] = useState<SnapGuide>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [clickDraft, setClickDraft] = useState<ClickDraft | null>(null);
  const dragStartSnapshotRef = useRef<DroMapDrawnMarkerElement[] | null>(null);
  const historyRef = useRef<DroMapDrawnMarkerElement[][]>([
    cloneElements(initialElements),
  ]);
  const historyIndexRef = useRef(0);
  const lastCoalescedRef = useRef<{ key: string; time: number } | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  const selectedElement = useMemo(
    () => elements.find((element) => element.id === selectedElementId) ?? null,
    [elements, selectedElementId],
  );
  const selectedShape =
    selectedElement?.type === "shape" ? selectedElement : null;
  const selectedText =
    selectedElement?.type === "text" ? selectedElement : null;
  const selectedLine =
    selectedElement?.type === "line" || selectedElement?.type === "arrow"
      ? selectedElement
      : null;
  const selectedPath =
    selectedElement?.type === "path" ? selectedElement : null;

  const canUndo = historyVersion >= 0 && historyIndexRef.current > 0;
  const canRedo =
    historyVersion >= 0 &&
    historyIndexRef.current < historyRef.current.length - 1;

  function setElementsWithoutHistory(next: DroMapDrawnMarkerElement[]) {
    elementsRef.current = next;
    setElements(next);
  }

  function commitElements(
    nextInput: DroMapDrawnMarkerElement[],
    coalesceKey?: string,
  ) {
    const next = cloneElements(nextInput);
    const current = elementsRef.current;
    if (elementsEqual(current, next)) return;

    const now = Date.now();
    const canCoalesce =
      coalesceKey &&
      lastCoalescedRef.current?.key === coalesceKey &&
      now - lastCoalescedRef.current.time < 550 &&
      historyIndexRef.current === historyRef.current.length - 1;

    if (canCoalesce) {
      historyRef.current[historyIndexRef.current] = cloneElements(next);
    } else {
      historyRef.current = historyRef.current.slice(
        0,
        historyIndexRef.current + 1,
      );
      historyRef.current.push(cloneElements(next));
      historyIndexRef.current += 1;
    }

    lastCoalescedRef.current = coalesceKey
      ? { key: coalesceKey, time: now }
      : null;
    setElementsWithoutHistory(next);
    setHistoryVersion((value) => value + 1);
  }

  function registerLiveDragResult(before: DroMapDrawnMarkerElement[] | null) {
    if (!before || elementsEqual(before, elementsRef.current)) return;
    historyRef.current = historyRef.current.slice(
      0,
      historyIndexRef.current + 1,
    );
    historyRef.current.push(cloneElements(elementsRef.current));
    historyIndexRef.current += 1;
    lastCoalescedRef.current = null;
    setHistoryVersion((value) => value + 1);
  }

  function undo() {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const next = cloneElements(historyRef.current[historyIndexRef.current]);
    setElementsWithoutHistory(next);
    setSelectedElementId((current) =>
      current && next.some((element) => element.id === current)
        ? current
        : null,
    );
    setPreviewElement(null);
    setClickDraft(null);
    dragStateRef.current = null;
    setHistoryVersion((value) => value + 1);
  }

  function redo() {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const next = cloneElements(historyRef.current[historyIndexRef.current]);
    setElementsWithoutHistory(next);
    setSelectedElementId((current) =>
      current && next.some((element) => element.id === current)
        ? current
        : null,
    );
    setPreviewElement(null);
    setClickDraft(null);
    dragStateRef.current = null;
    setHistoryVersion((value) => value + 1);
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      const modifier = event.ctrlKey || event.metaKey;

      if (!isEditing && modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (!isEditing && modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (
        !isEditing &&
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedElementId
      ) {
        event.preventDefault();
        commitElements(
          elementsRef.current.filter(
            (element) => element.id !== selectedElementId,
          ),
        );
        setSelectedElementId(null);
        return;
      }
      if (
        !isEditing &&
        event.key === "Enter" &&
        clickDraft?.kind === "polyline"
      ) {
        event.preventDefault();
        finishClickDraft();
        return;
      }
      if (!isEditing && event.key === "Escape") {
        event.preventDefault();
        if (clickDraft) {
          setClickDraft(null);
          setPreviewElement(null);
          setSnapGuide(null);
          return;
        }
        if (dragStartSnapshotRef.current) {
          setElementsWithoutHistory(
            cloneElements(dragStartSnapshotRef.current),
          );
        }
        dragStartSnapshotRef.current = null;
        dragStateRef.current = null;
        setPreviewElement(null);
        setSnapGuide(null);
        if (activeTool !== "select") setActiveTool("select");
        else setSelectedElementId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function chooseTool(tool: DesignerTool) {
    setPreviewElement(null);
    setClickDraft(null);
    setSnapGuide(null);
    dragStateRef.current = null;
    dragStartSnapshotRef.current = null;
    setSelectedElementId(null);
    setActiveTool((current) =>
      current === tool && tool !== "select" ? "select" : tool,
    );
  }

  function finishClickDraft() {
    const draft = clickDraft;
    if (!draft) return;

    if (draft.kind === "polyline") {
      const deduped = draft.points.filter((point, index, points) => {
        if (index === 0) return true;
        const previous = points[index - 1];
        return Math.hypot(point.x - previous.x, point.y - previous.y) > 1;
      });
      const minimum = draft.tool === "polygon" ? 3 : 2;
      if (deduped.length >= minimum) {
        const closed = draft.tool === "polygon";
        const element: DroMapDrawnMarkerPathElement = {
          id: createElementId(),
          type: "path",
          points: deduped,
          rawPoints: deduped,
          smoothing: 0,
          closed,
          fillEnabled: closed ? zonePreset.fillEnabled : false,
          fillColor: zonePreset.fillColor,
          fillOpacity: zonePreset.fillOpacity,
          strokeEnabled: closed ? zonePreset.strokeEnabled : true,
          strokeColor: closed ? zonePreset.color : linePreset.color,
          strokeOpacity: closed ? zonePreset.opacity : linePreset.opacity,
          strokeWidth: closed ? zonePreset.weight : linePreset.weight,
          dashStyle: closed ? zonePreset.dashStyle : linePreset.dashStyle,
          arrowStart:
            !closed && draft.tool !== "arrow" ? linePreset.arrowStart : false,
          arrowEnd: !closed && (draft.tool === "arrow" || linePreset.arrowEnd),
          hatchingStyle: zonePreset.hatchingStyle,
          hatchingColor: zonePreset.hatchingColor,
          hatchingWeight: zonePreset.hatchingWeight,
          hatchingSpacing: zonePreset.hatchingSpacing,
          dotsEnabled: zonePreset.dotsEnabled,
          dotsColor: zonePreset.dotsColor,
          dotsRadius: zonePreset.dotsRadius,
          dotsSpacing: zonePreset.dotsSpacing,
        };
        commitElements([...elementsRef.current, element]);
      }
    } else if (previewElement?.type === "shape") {
      const element = {
        ...previewElement,
        id: createElementId(),
      } as DroMapDrawnMarkerShapeElement;
      if (
        element.width >= MIN_ELEMENT_SIZE &&
        element.height >= MIN_ELEMENT_SIZE
      ) {
        commitElements([...elementsRef.current, element]);
      }
    }

    setClickDraft(null);
    setPreviewElement(null);
    setSnapGuide(null);
    setSelectedElementId(null);
  }

  function updateElementLive(
    elementId: string,
    updater: (element: DroMapDrawnMarkerElement) => DroMapDrawnMarkerElement,
  ) {
    const next = elementsRef.current.map((element) =>
      element.id === elementId ? updater(element) : element,
    );
    setElementsWithoutHistory(next);
  }

  function updateSelectedCommitted(
    updater: (element: DroMapDrawnMarkerElement) => DroMapDrawnMarkerElement,
    key: string,
  ) {
    if (!selectedElementId) return;
    commitElements(
      elementsRef.current.map((element) =>
        element.id === selectedElementId ? updater(element) : element,
      ),
      `selected:${selectedElementId}:${key}`,
    );
  }

  function selectAndStartMove(
    event: React.PointerEvent<SVGElement>,
    element: DroMapDrawnMarkerElement,
  ) {
    if (activeTool !== "select") return;
    event.stopPropagation();
    setSelectedElementId(element.id);
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    dragStartSnapshotRef.current = cloneElements(elementsRef.current);
    dragStateRef.current = {
      kind: "move",
      elementId: element.id,
      start: getSvgPointFromClient(svg, event.clientX, event.clientY),
      original: cloneElement(element),
    };
    svg.setPointerCapture(event.pointerId);
  }

  function createPreviewElement(
    tool: Exclude<
      DesignerTool,
      "select" | "text" | "freehand-line" | "freehand-zone"
    >,
    start: Point,
    end: Point,
  ): DroMapDrawnMarkerElement {
    if (tool === "line" || tool === "arrow") {
      return {
        id: "preview",
        type: tool,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        strokeColor: linePreset.color,
        strokeOpacity: linePreset.opacity,
        strokeWidth: linePreset.weight,
        dashStyle: linePreset.dashStyle,
        arrowStart: tool === "arrow" ? false : linePreset.arrowStart,
        arrowEnd: tool === "arrow" ? true : linePreset.arrowEnd,
      };
    }
    return {
      id: "preview",
      type: "shape",
      shape: tool as DroMapDrawnMarkerShapeKind,
      ...normalizeShapeBounds(start, end, tool === "circle"),
      rotation: 0,
      fillEnabled: zonePreset.fillEnabled,
      fillColor: zonePreset.fillColor,
      fillOpacity: zonePreset.fillOpacity,
      strokeEnabled: zonePreset.strokeEnabled,
      strokeColor: zonePreset.color,
      strokeOpacity: zonePreset.opacity,
      strokeWidth: zonePreset.weight,
      dashStyle: zonePreset.dashStyle,
      hatchingStyle: zonePreset.hatchingStyle,
      hatchingColor: zonePreset.hatchingColor,
      hatchingWeight: zonePreset.hatchingWeight,
      hatchingSpacing: zonePreset.hatchingSpacing,
      dotsEnabled: zonePreset.dotsEnabled,
      dotsColor: zonePreset.dotsColor,
      dotsRadius: zonePreset.dotsRadius,
      dotsSpacing: zonePreset.dotsSpacing,
    };
  }

  function handleCanvasPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    const targets = getTargetAnchors(elementsRef.current);
    const snapped = snapPoint(getSvgPoint(event), targets);
    setSnapGuide(snapped.guide);

    if (activeTool === "select") {
      setSelectedElementId(null);
      return;
    }

    if (
      activeTool === "line" ||
      activeTool === "arrow" ||
      activeTool === "polygon"
    ) {
      if (clickDraft?.kind === "polyline" && clickDraft.tool === activeTool) {
        const firstPoint = clickDraft.points[0];
        if (
          activeTool === "polygon" &&
          clickDraft.points.length >= 3 &&
          Math.hypot(
            snapped.point.x - firstPoint.x,
            snapped.point.y - firstPoint.y,
          ) <=
            SNAP_DISTANCE * 1.4
        ) {
          finishClickDraft();
          return;
        }
        setClickDraft({
          ...clickDraft,
          points: [...clickDraft.points, snapped.point],
        });
      } else {
        setClickDraft({
          kind: "polyline",
          tool: activeTool,
          points: [snapped.point],
        });
      }
      return;
    }

    if (
      activeTool === "rectangle" ||
      activeTool === "circle" ||
      activeTool === "ellipse" ||
      activeTool === "triangle" ||
      activeTool === "diamond" ||
      activeTool === "star"
    ) {
      if (clickDraft?.kind === "shape" && clickDraft.tool === activeTool) {
        const finalElement = createPreviewElement(
          activeTool,
          clickDraft.start,
          snapped.point,
        );
        if (
          finalElement.type === "shape" &&
          finalElement.width >= MIN_ELEMENT_SIZE &&
          finalElement.height >= MIN_ELEMENT_SIZE
        ) {
          commitElements([
            ...elementsRef.current,
            { ...finalElement, id: createElementId() },
          ]);
        }
        setClickDraft(null);
        setPreviewElement(null);
        setSnapGuide(null);
      } else {
        setClickDraft({
          kind: "shape",
          tool: activeTool,
          start: snapped.point,
        });
        setPreviewElement(
          createPreviewElement(activeTool, snapped.point, {
            x: snapped.point.x + MIN_ELEMENT_SIZE,
            y: snapped.point.y + MIN_ELEMENT_SIZE,
          }),
        );
      }
      return;
    }

    if (activeTool === "text") {
      const element: DroMapDrawnMarkerTextElement = {
        id: createElementId(),
        type: "text",
        x: clamp(snapped.point.x - 90, 0, CUSTOM_MARKER_CANVAS_SIZE - 180),
        y: clamp(snapped.point.y - 35, 0, CUSTOM_MARKER_CANVAS_SIZE - 70),
        width: 180,
        height: 70,
        rotation: 0,
        text: "Texte",
        fontSize: textPreset.fontSize,
        color: textPreset.color,
        opacity: textPreset.opacity,
        backgroundEnabled: textPreset.backgroundEnabled,
        backgroundColor: textPreset.backgroundColor,
        backgroundOpacity: textPreset.backgroundOpacity,
        borderEnabled: textPreset.borderEnabled,
        borderColor: textPreset.borderColor,
        borderWidth: textPreset.borderWidth,
      };
      commitElements([...elementsRef.current, element]);
      setSelectedElementId(element.id);
      setActiveTool("select");
      window.requestAnimationFrame(() => {
        textAreaRef.current?.focus();
        textAreaRef.current?.select();
      });
      return;
    }

    if (activeTool === "freehand-line" || activeTool === "freehand-zone") {
      dragStateRef.current = {
        kind: "freehand",
        closed: activeTool === "freehand-zone",
        points: [snapped.point],
      };
      const closed = activeTool === "freehand-zone";
      setPreviewElement({
        id: "preview",
        type: "path",
        points: [snapped.point],
        rawPoints: [snapped.point],
        smoothing: closed ? zonePreset.smoothing : linePreset.smoothing,
        closed,
        fillEnabled: closed ? zonePreset.fillEnabled : false,
        fillColor: zonePreset.fillColor,
        fillOpacity: zonePreset.fillOpacity,
        strokeEnabled: closed ? zonePreset.strokeEnabled : true,
        strokeColor: closed ? zonePreset.color : linePreset.color,
        strokeOpacity: closed ? zonePreset.opacity : linePreset.opacity,
        strokeWidth: closed ? zonePreset.weight : linePreset.weight,
        dashStyle: closed ? zonePreset.dashStyle : linePreset.dashStyle,
        hatchingStyle: zonePreset.hatchingStyle,
        hatchingColor: zonePreset.hatchingColor,
        hatchingWeight: zonePreset.hatchingWeight,
        hatchingSpacing: zonePreset.hatchingSpacing,
        dotsEnabled: zonePreset.dotsEnabled,
        dotsColor: zonePreset.dotsColor,
        dotsRadius: zonePreset.dotsRadius,
        dotsSpacing: zonePreset.dotsSpacing,
      });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    dragStateRef.current = {
      kind: "create",
      tool: activeTool,
      start: snapped.point,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleCanvasPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const rawPoint = getSvgPoint(event);
    if (clickDraft) {
      const snapped = snapPoint(
        rawPoint,
        getTargetAnchors(elementsRef.current),
      );
      setSnapGuide(snapped.guide);
      if (clickDraft.kind === "shape") {
        setPreviewElement(
          createPreviewElement(
            clickDraft.tool,
            clickDraft.start,
            snapped.point,
          ),
        );
      } else {
        const closed = clickDraft.tool === "polygon";
        const previewPoints = [...clickDraft.points, snapped.point];
        setPreviewElement({
          id: "preview",
          type: "path",
          points: previewPoints,
          rawPoints: previewPoints,
          smoothing: 0,
          closed,
          fillEnabled: closed ? zonePreset.fillEnabled : false,
          fillColor: zonePreset.fillColor,
          fillOpacity: zonePreset.fillOpacity,
          strokeEnabled: closed ? zonePreset.strokeEnabled : true,
          strokeColor: closed ? zonePreset.color : linePreset.color,
          strokeOpacity: closed ? zonePreset.opacity : linePreset.opacity,
          strokeWidth: closed ? zonePreset.weight : linePreset.weight,
          dashStyle: closed ? zonePreset.dashStyle : linePreset.dashStyle,
          arrowStart:
            !closed && clickDraft.tool !== "arrow"
              ? linePreset.arrowStart
              : false,
          arrowEnd:
            !closed && (clickDraft.tool === "arrow" || linePreset.arrowEnd),
          hatchingStyle: zonePreset.hatchingStyle,
          hatchingColor: zonePreset.hatchingColor,
          hatchingWeight: zonePreset.hatchingWeight,
          hatchingSpacing: zonePreset.hatchingSpacing,
          dotsEnabled: zonePreset.dotsEnabled,
          dotsColor: zonePreset.dotsColor,
          dotsRadius: zonePreset.dotsRadius,
          dotsSpacing: zonePreset.dotsSpacing,
        });
      }
      return;
    }

    const drag = dragStateRef.current;
    if (!drag) return;

    if (drag.kind === "create") {
      const snapped = snapPoint(
        rawPoint,
        getTargetAnchors(elementsRef.current),
      );
      setSnapGuide(snapped.guide);
      setPreviewElement(
        createPreviewElement(drag.tool, drag.start, snapped.point),
      );
      return;
    }

    if (drag.kind === "freehand") {
      const lastPoint = drag.points[drag.points.length - 1];
      if (
        Math.hypot(rawPoint.x - lastPoint.x, rawPoint.y - lastPoint.y) >= 2.5
      ) {
        const nextPoints = [...drag.points, rawPoint];
        dragStateRef.current = { ...drag, points: nextPoints };
        const smoothing = drag.closed
          ? zonePreset.smoothing
          : linePreset.smoothing;
        const displayPoints = smoothPath(nextPoints, smoothing, drag.closed);
        setPreviewElement((current) =>
          current?.type === "path"
            ? {
                ...current,
                points: displayPoints,
                rawPoints: nextPoints,
                smoothing,
              }
            : current,
        );
      }
      return;
    }

    if (drag.kind === "move") {
      const result = snapMovedElement(
        drag.original,
        rawPoint.x - drag.start.x,
        rawPoint.y - drag.start.y,
        getTargetAnchors(elementsRef.current, drag.elementId),
      );
      setSnapGuide(result.guide);
      updateElementLive(drag.elementId, () => result.element);
      return;
    }

    if (drag.kind === "line-point") {
      const snapped = snapPoint(
        rawPoint,
        getTargetAnchors(elementsRef.current, drag.elementId),
      );
      setSnapGuide(snapped.guide);
      updateElementLive(drag.elementId, () => ({
        ...drag.original,
        ...(drag.endpoint === "start"
          ? { x1: snapped.point.x, y1: snapped.point.y }
          : { x2: snapped.point.x, y2: snapped.point.y }),
      }));
      return;
    }

    if (drag.kind === "rotate") {
      const angle =
        (Math.atan2(rawPoint.y - drag.center.y, rawPoint.x - drag.center.x) *
          180) /
        Math.PI;
      const rotation = normalizeRotation(
        drag.originalRotation + angle - drag.startPointerAngle,
      );
      updateElementLive(drag.elementId, (element) =>
        element.type === "shape" || element.type === "text"
          ? { ...element, rotation }
          : element,
      );
      return;
    }

    if (drag.kind === "resize-text") {
      const snapped = snapPoint(
        rawPoint,
        getTargetAnchors(elementsRef.current, drag.elementId),
      );
      setSnapGuide(snapped.guide);
      const width = Math.max(40, snapped.point.x - drag.original.x);
      const height = Math.max(28, snapped.point.y - drag.original.y);
      const scale = Math.max(
        width / drag.original.width,
        height / drag.original.height,
      );
      updateElementLive(drag.elementId, () => ({
        ...drag.original,
        width: clamp(
          drag.original.width * scale,
          40,
          CUSTOM_MARKER_CANVAS_SIZE - drag.original.x,
        ),
        height: clamp(
          drag.original.height * scale,
          28,
          CUSTOM_MARKER_CANVAS_SIZE - drag.original.y,
        ),
        fontSize: clamp(drag.original.fontSize * scale, 10, 120),
      }));
      return;
    }

    const snapped = snapPoint(
      rawPoint,
      getTargetAnchors(elementsRef.current, drag.elementId),
    );
    setSnapGuide(snapped.guide);
    const original = drag.original;
    const oppositeX = drag.corner.includes("w")
      ? original.x + original.width
      : original.x;
    const oppositeY = drag.corner.includes("n")
      ? original.y + original.height
      : original.y;
    const bounds = normalizeShapeBounds(
      { x: oppositeX, y: oppositeY },
      snapped.point,
      original.shape === "circle",
    );
    updateElementLive(drag.elementId, () => ({ ...original, ...bounds }));
  }

  function handleCanvasPointerUp(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragStateRef.current;
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (
      (drag?.kind === "create" || drag?.kind === "freehand") &&
      previewElement
    ) {
      const element = {
        ...previewElement,
        id: createElementId(),
      } as DroMapDrawnMarkerElement;
      const isLargeEnough =
        element.type === "shape"
          ? element.width >= MIN_ELEMENT_SIZE &&
            element.height >= MIN_ELEMENT_SIZE
          : element.type === "path"
            ? element.points.length >= 2 &&
              Math.hypot(
                element.points[element.points.length - 1].x -
                  element.points[0].x,
                element.points[element.points.length - 1].y -
                  element.points[0].y,
              ) >= MIN_ELEMENT_SIZE
            : element.type === "line" || element.type === "arrow"
              ? Math.hypot(element.x2 - element.x1, element.y2 - element.y1) >=
                MIN_ELEMENT_SIZE
              : true;
      if (isLargeEnough) {
        commitElements([...elementsRef.current, element]);
        setSelectedElementId(null);
      }
    } else {
      registerLiveDragResult(dragStartSnapshotRef.current);
    }
    dragStartSnapshotRef.current = null;
    setPreviewElement(null);
    setSnapGuide(null);
  }

  function startShapeResize(
    event: React.PointerEvent<SVGCircleElement>,
    element: DroMapDrawnMarkerShapeElement,
    corner: "nw" | "ne" | "sw" | "se",
  ) {
    event.stopPropagation();
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    dragStartSnapshotRef.current = cloneElements(elementsRef.current);
    dragStateRef.current = {
      kind: "resize-shape",
      elementId: element.id,
      corner,
      original: cloneElement(element),
    };
    svg.setPointerCapture(event.pointerId);
  }

  function startTextResize(
    event: React.PointerEvent<SVGCircleElement>,
    element: DroMapDrawnMarkerTextElement,
  ) {
    event.stopPropagation();
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    dragStartSnapshotRef.current = cloneElements(elementsRef.current);
    dragStateRef.current = {
      kind: "resize-text",
      elementId: element.id,
      original: cloneElement(element),
      start: getSvgPointFromClient(svg, event.clientX, event.clientY),
    };
    svg.setPointerCapture(event.pointerId);
  }

  function startLineEndpointDrag(
    event: React.PointerEvent<SVGCircleElement>,
    element: DroMapDrawnMarkerLineElement,
    endpoint: "start" | "end",
  ) {
    event.stopPropagation();
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    dragStartSnapshotRef.current = cloneElements(elementsRef.current);
    dragStateRef.current = {
      kind: "line-point",
      elementId: element.id,
      endpoint,
      original: cloneElement(element),
    };
    svg.setPointerCapture(event.pointerId);
  }

  function startRotation(
    event: React.PointerEvent<SVGCircleElement>,
    element: DroMapDrawnMarkerShapeElement | DroMapDrawnMarkerTextElement,
  ) {
    event.stopPropagation();
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const center = getElementCenter(element);
    const point = getSvgPointFromClient(svg, event.clientX, event.clientY);
    dragStartSnapshotRef.current = cloneElements(elementsRef.current);
    dragStateRef.current = {
      kind: "rotate",
      elementId: element.id,
      center,
      startPointerAngle:
        (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI,
      originalRotation: element.rotation,
    };
    svg.setPointerCapture(event.pointerId);
  }

  function deleteSelectedElement() {
    if (!selectedElementId) return;
    commitElements(
      elementsRef.current.filter((element) => element.id !== selectedElementId),
    );
    setSelectedElementId(null);
  }

  function moveSelectedElement(direction: "front" | "back") {
    if (!selectedElementId) return;
    const index = elementsRef.current.findIndex(
      (element) => element.id === selectedElementId,
    );
    if (index < 0) return;
    const next = [...elementsRef.current];
    const [element] = next.splice(index, 1);
    if (direction === "front") next.push(element);
    else next.unshift(element);
    commitElements(next);
  }

  function renderLinePresetSettings() {
    return (
      <SettingSection title={`Paramètres — ${toolTitle(activeTool)}`}>
        <ColorRow
          label="Couleur"
          value={linePreset.color}
          onChange={(color) =>
            setLinePreset((current) => ({ ...current, color }))
          }
        />
        <DashRow
          value={linePreset.dashStyle}
          onChange={(dashStyle) =>
            setLinePreset((current) => ({ ...current, dashStyle }))
          }
        />
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-2">
          <CheckRow
            label="Flèche début"
            checked={activeTool === "arrow" ? false : linePreset.arrowStart}
            onChange={(arrowStart) =>
              setLinePreset((current) => ({ ...current, arrowStart }))
            }
          />
          <CheckRow
            label="Flèche fin"
            checked={activeTool === "arrow" ? true : linePreset.arrowEnd}
            onChange={(arrowEnd) =>
              setLinePreset((current) => ({ ...current, arrowEnd }))
            }
          />
        </div>
        <RangeRow
          label="Épaisseur"
          value={linePreset.weight}
          min={1}
          max={24}
          suffix="px"
          onChange={(weight) =>
            setLinePreset((current) => ({ ...current, weight }))
          }
        />
        {activeTool === "freehand-line" ? (
          <RangeRow
            label="Lissage"
            value={linePreset.smoothing}
            min={0}
            max={100}
            suffix="%"
            onChange={(smoothing) =>
              setLinePreset((current) => ({ ...current, smoothing }))
            }
          />
        ) : null}
        <RangeRow
          label="Opacité"
          value={linePreset.opacity}
          min={0.1}
          max={1}
          step={0.05}
          suffix=""
          onChange={(opacity) =>
            setLinePreset((current) => ({ ...current, opacity }))
          }
        />
      </SettingSection>
    );
  }

  function renderZonePresetSettings() {
    return (
      <SettingSection title={`Paramètres — ${toolTitle(activeTool)}`}>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-2">
          <CheckRow
            label="Contour"
            checked={zonePreset.strokeEnabled}
            onChange={(strokeEnabled) =>
              setZonePreset((current) => ({ ...current, strokeEnabled }))
            }
          />
          <CheckRow
            label="Fond"
            checked={zonePreset.fillEnabled}
            onChange={(fillEnabled) =>
              setZonePreset((current) => ({ ...current, fillEnabled }))
            }
          />
        </div>
        <ColorRow
          label="Couleur contour"
          value={zonePreset.color}
          onChange={(color) =>
            setZonePreset((current) => ({ ...current, color }))
          }
        />
        <ColorRow
          label="Couleur fond"
          value={zonePreset.fillColor}
          onChange={(fillColor) =>
            setZonePreset((current) => ({ ...current, fillColor }))
          }
        />
        <DashRow
          value={zonePreset.dashStyle}
          onChange={(dashStyle) =>
            setZonePreset((current) => ({ ...current, dashStyle }))
          }
        />
        <RangeRow
          label="Épaisseur contour"
          value={zonePreset.weight}
          min={1}
          max={24}
          suffix="px"
          onChange={(weight) =>
            setZonePreset((current) => ({ ...current, weight }))
          }
        />
        <RangeRow
          label="Opacité contour"
          value={zonePreset.opacity}
          min={0.1}
          max={1}
          step={0.05}
          onChange={(opacity) =>
            setZonePreset((current) => ({ ...current, opacity }))
          }
        />
        <RangeRow
          label="Opacité fond"
          value={zonePreset.fillOpacity}
          min={0}
          max={1}
          step={0.05}
          onChange={(fillOpacity) =>
            setZonePreset((current) => ({ ...current, fillOpacity }))
          }
        />
        {activeTool === "freehand-zone" ? (
          <RangeRow
            label="Lissage"
            value={zonePreset.smoothing}
            min={0}
            max={100}
            suffix="%"
            onChange={(smoothing) =>
              setZonePreset((current) => ({ ...current, smoothing }))
            }
          />
        ) : null}
        <HatchingRow
          value={zonePreset.hatchingStyle}
          onChange={(hatchingStyle) =>
            setZonePreset((current) => ({ ...current, hatchingStyle }))
          }
        />
        {zonePreset.hatchingStyle !== "none" ? (
          <>
            <ColorRow
              label="Couleur hachures"
              value={zonePreset.hatchingColor}
              onChange={(hatchingColor) =>
                setZonePreset((current) => ({ ...current, hatchingColor }))
              }
            />
            <RangeRow
              label="Épaisseur hachures"
              value={zonePreset.hatchingWeight}
              min={0.5}
              max={12}
              step={0.5}
              suffix="px"
              onChange={(hatchingWeight) =>
                setZonePreset((current) => ({ ...current, hatchingWeight }))
              }
            />
            <RangeRow
              label="Resserrement"
              value={zonePreset.hatchingSpacing}
              min={3}
              max={60}
              suffix="px"
              onChange={(hatchingSpacing) =>
                setZonePreset((current) => ({ ...current, hatchingSpacing }))
              }
            />
          </>
        ) : null}
        <CheckRow
          label="Points"
          checked={zonePreset.dotsEnabled}
          onChange={(dotsEnabled) =>
            setZonePreset((current) => ({ ...current, dotsEnabled }))
          }
        />
        {zonePreset.dotsEnabled ? (
          <>
            <ColorRow
              label="Couleur points"
              value={zonePreset.dotsColor}
              onChange={(dotsColor) =>
                setZonePreset((current) => ({ ...current, dotsColor }))
              }
            />
            <RangeRow
              label="Rayon points"
              value={zonePreset.dotsRadius}
              min={0.5}
              max={10}
              step={0.5}
              suffix="px"
              onChange={(dotsRadius) =>
                setZonePreset((current) => ({ ...current, dotsRadius }))
              }
            />
            <RangeRow
              label="Espacement points"
              value={zonePreset.dotsSpacing}
              min={3}
              max={60}
              suffix="px"
              onChange={(dotsSpacing) =>
                setZonePreset((current) => ({ ...current, dotsSpacing }))
              }
            />
          </>
        ) : null}
      </SettingSection>
    );
  }

  function renderTextPresetSettings() {
    return (
      <SettingSection title="Paramètres — Texte">
        <ColorRow
          label="Couleur"
          value={textPreset.color}
          onChange={(color) =>
            setTextPreset((current) => ({ ...current, color }))
          }
        />
        <RangeRow
          label="Opacité"
          value={textPreset.opacity}
          min={0.1}
          max={1}
          step={0.05}
          onChange={(opacity) =>
            setTextPreset((current) => ({ ...current, opacity }))
          }
        />
        <RangeRow
          label="Taille"
          value={textPreset.fontSize}
          min={10}
          max={120}
          suffix="px"
          onChange={(fontSize) =>
            setTextPreset((current) => ({ ...current, fontSize }))
          }
        />
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-2">
          <CheckRow
            label="Fond"
            checked={textPreset.backgroundEnabled}
            onChange={(backgroundEnabled) =>
              setTextPreset((current) => ({ ...current, backgroundEnabled }))
            }
          />
          <CheckRow
            label="Cadre"
            checked={textPreset.borderEnabled}
            onChange={(borderEnabled) =>
              setTextPreset((current) => ({ ...current, borderEnabled }))
            }
          />
        </div>
        {textPreset.backgroundEnabled ? (
          <>
            <ColorRow
              label="Couleur fond"
              value={textPreset.backgroundColor}
              onChange={(backgroundColor) =>
                setTextPreset((current) => ({ ...current, backgroundColor }))
              }
            />
            <RangeRow
              label="Opacité fond"
              value={textPreset.backgroundOpacity}
              min={0}
              max={1}
              step={0.05}
              onChange={(backgroundOpacity) =>
                setTextPreset((current) => ({ ...current, backgroundOpacity }))
              }
            />
          </>
        ) : null}
        {textPreset.borderEnabled ? (
          <>
            <ColorRow
              label="Couleur cadre"
              value={textPreset.borderColor}
              onChange={(borderColor) =>
                setTextPreset((current) => ({ ...current, borderColor }))
              }
            />
            <RangeRow
              label="Épaisseur cadre"
              value={textPreset.borderWidth}
              min={1}
              max={12}
              suffix="px"
              onChange={(borderWidth) =>
                setTextPreset((current) => ({ ...current, borderWidth }))
              }
            />
          </>
        ) : null}
      </SettingSection>
    );
  }

  function renderSelectedSettings() {
    if (!selectedElement) return null;
    const patch = (
      updater: (element: DroMapDrawnMarkerElement) => DroMapDrawnMarkerElement,
      key: string,
    ) => updateSelectedCommitted(updater, key);

    return (
      <SettingSection title="Élément sélectionné">
        {selectedElement.type === "text" ? (
          <>
            <label className="dromap-marker-setting-row block text-xs">
              <span className="mb-1 block">Contenu</span>
              <textarea
                ref={textAreaRef}
                value={selectedElement.text}
                onChange={(event) =>
                  patch(
                    (element) =>
                      element.type === "text"
                        ? { ...element, text: event.target.value || "Texte" }
                        : element,
                    "text",
                  )
                }
                rows={3}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
              />
            </label>
            <ColorRow
              label="Couleur"
              value={selectedElement.color}
              onChange={(color) =>
                patch(
                  (element) =>
                    element.type === "text" ? { ...element, color } : element,
                  "color",
                )
              }
            />
            <RangeRow
              label="Opacité"
              value={selectedElement.opacity ?? 1}
              min={0.1}
              max={1}
              step={0.05}
              onChange={(opacity) =>
                patch(
                  (element) =>
                    element.type === "text" ? { ...element, opacity } : element,
                  "opacity",
                )
              }
            />
            <RangeRow
              label="Taille"
              value={selectedElement.fontSize}
              min={10}
              max={120}
              suffix="px"
              onChange={(fontSize) =>
                patch(
                  (element) =>
                    element.type === "text"
                      ? { ...element, fontSize }
                      : element,
                  "font-size",
                )
              }
            />
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-2">
              <CheckRow
                label="Fond"
                checked={selectedElement.backgroundEnabled === true}
                onChange={(backgroundEnabled) =>
                  patch(
                    (element) =>
                      element.type === "text"
                        ? { ...element, backgroundEnabled }
                        : element,
                    "background-enabled",
                  )
                }
              />
              <CheckRow
                label="Cadre"
                checked={selectedElement.borderEnabled === true}
                onChange={(borderEnabled) =>
                  patch(
                    (element) =>
                      element.type === "text"
                        ? { ...element, borderEnabled }
                        : element,
                    "border-enabled",
                  )
                }
              />
            </div>
            {selectedElement.backgroundEnabled ? (
              <>
                <ColorRow
                  label="Couleur fond"
                  value={selectedElement.backgroundColor ?? "#ffffff"}
                  onChange={(backgroundColor) =>
                    patch(
                      (element) =>
                        element.type === "text"
                          ? { ...element, backgroundColor }
                          : element,
                      "background-color",
                    )
                  }
                />
                <RangeRow
                  label="Opacité fond"
                  value={selectedElement.backgroundOpacity ?? 0.85}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(backgroundOpacity) =>
                    patch(
                      (element) =>
                        element.type === "text"
                          ? { ...element, backgroundOpacity }
                          : element,
                      "background-opacity",
                    )
                  }
                />
              </>
            ) : null}
            {selectedElement.borderEnabled ? (
              <>
                <ColorRow
                  label="Couleur cadre"
                  value={selectedElement.borderColor ?? "#111827"}
                  onChange={(borderColor) =>
                    patch(
                      (element) =>
                        element.type === "text"
                          ? { ...element, borderColor }
                          : element,
                      "border-color",
                    )
                  }
                />
                <RangeRow
                  label="Épaisseur cadre"
                  value={selectedElement.borderWidth ?? 2}
                  min={1}
                  max={12}
                  suffix="px"
                  onChange={(borderWidth) =>
                    patch(
                      (element) =>
                        element.type === "text"
                          ? { ...element, borderWidth }
                          : element,
                      "border-width",
                    )
                  }
                />
              </>
            ) : null}
          </>
        ) : (
          <>
            <ColorRow
              label="Couleur contour"
              value={selectedElement.strokeColor}
              onChange={(strokeColor) =>
                patch(
                  (element) =>
                    element.type === "text"
                      ? element
                      : { ...element, strokeColor },
                  "stroke-color",
                )
              }
            />
            <DashRow
              value={selectedElement.dashStyle ?? "solid"}
              onChange={(dashStyle) =>
                patch(
                  (element) =>
                    element.type === "text"
                      ? element
                      : { ...element, dashStyle },
                  "dash-style",
                )
              }
            />
            <RangeRow
              label="Épaisseur"
              value={selectedElement.strokeWidth}
              min={1}
              max={24}
              suffix="px"
              onChange={(strokeWidth) =>
                patch(
                  (element) =>
                    element.type === "text"
                      ? element
                      : { ...element, strokeWidth },
                  "stroke-width",
                )
              }
            />
            <RangeRow
              label="Opacité contour"
              value={selectedElement.strokeOpacity ?? 1}
              min={0.1}
              max={1}
              step={0.05}
              onChange={(strokeOpacity) =>
                patch(
                  (element) =>
                    element.type === "text"
                      ? element
                      : { ...element, strokeOpacity },
                  "stroke-opacity",
                )
              }
            />
            {selectedLine ? (
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-2">
                <CheckRow
                  label="Flèche début"
                  checked={selectedLine.arrowStart === true}
                  onChange={(arrowStart) =>
                    patch(
                      (element) =>
                        element.type === "line" || element.type === "arrow"
                          ? { ...element, arrowStart }
                          : element,
                      "arrow-start",
                    )
                  }
                />
                <CheckRow
                  label="Flèche fin"
                  checked={
                    selectedLine.arrowEnd === true ||
                    selectedLine.type === "arrow"
                  }
                  onChange={(arrowEnd) =>
                    patch(
                      (element) =>
                        element.type === "line" || element.type === "arrow"
                          ? { ...element, type: "line", arrowEnd }
                          : element,
                      "arrow-end",
                    )
                  }
                />
              </div>
            ) : null}
            {selectedPath && !selectedPath.closed ? (
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-2">
                <CheckRow
                  label="Flèche début"
                  checked={selectedPath.arrowStart === true}
                  onChange={(arrowStart) =>
                    patch(
                      (element) =>
                        element.type === "path" && !element.closed
                          ? { ...element, arrowStart }
                          : element,
                      "path-arrow-start",
                    )
                  }
                />
                <CheckRow
                  label="Flèche fin"
                  checked={selectedPath.arrowEnd === true}
                  onChange={(arrowEnd) =>
                    patch(
                      (element) =>
                        element.type === "path" && !element.closed
                          ? { ...element, arrowEnd }
                          : element,
                      "path-arrow-end",
                    )
                  }
                />
              </div>
            ) : null}
          </>
        )}

        {selectedShape || selectedPath?.closed ? (
          <>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-2">
              <CheckRow
                label="Contour"
                checked={
                  selectedShape
                    ? selectedShape.strokeEnabled !== false
                    : selectedPath?.strokeEnabled !== false
                }
                onChange={(strokeEnabled) =>
                  patch(
                    (element) =>
                      element.type === "shape" ||
                      (element.type === "path" && element.closed)
                        ? { ...element, strokeEnabled }
                        : element,
                    "stroke-enabled",
                  )
                }
              />
              <CheckRow
                label="Fond"
                checked={
                  selectedShape?.fillEnabled ??
                  selectedPath?.fillEnabled ??
                  false
                }
                onChange={(fillEnabled) =>
                  patch(
                    (element) =>
                      element.type === "shape" ||
                      (element.type === "path" && element.closed)
                        ? { ...element, fillEnabled }
                        : element,
                    "fill-enabled",
                  )
                }
              />
            </div>
            <ColorRow
              label="Couleur fond"
              value={
                selectedShape?.fillColor ?? selectedPath?.fillColor ?? "#2563eb"
              }
              onChange={(fillColor) =>
                patch(
                  (element) =>
                    element.type === "shape" ||
                    (element.type === "path" && element.closed)
                      ? { ...element, fillColor }
                      : element,
                  "fill-color",
                )
              }
            />
            <RangeRow
              label="Opacité fond"
              value={
                selectedShape?.fillOpacity ?? selectedPath?.fillOpacity ?? 0.25
              }
              min={0}
              max={1}
              step={0.05}
              onChange={(fillOpacity) =>
                patch(
                  (element) =>
                    element.type === "shape" ||
                    (element.type === "path" && element.closed)
                      ? { ...element, fillOpacity }
                      : element,
                  "fill-opacity",
                )
              }
            />
            <HatchingRow
              value={
                selectedShape?.hatchingStyle ??
                selectedPath?.hatchingStyle ??
                "none"
              }
              onChange={(hatchingStyle) =>
                patch(
                  (element) =>
                    element.type === "shape" ||
                    (element.type === "path" && element.closed)
                      ? { ...element, hatchingStyle }
                      : element,
                  "hatching-style",
                )
              }
            />
            {(selectedShape?.hatchingStyle ?? selectedPath?.hatchingStyle) &&
            (selectedShape?.hatchingStyle ?? selectedPath?.hatchingStyle) !==
              "none" ? (
              <>
                <ColorRow
                  label="Couleur hachures"
                  value={
                    selectedShape?.hatchingColor ??
                    selectedPath?.hatchingColor ??
                    "#111827"
                  }
                  onChange={(hatchingColor) =>
                    patch(
                      (element) =>
                        element.type === "shape" ||
                        (element.type === "path" && element.closed)
                          ? { ...element, hatchingColor }
                          : element,
                      "hatching-color",
                    )
                  }
                />
                <RangeRow
                  label="Épaisseur hachures"
                  value={
                    selectedShape?.hatchingWeight ??
                    selectedPath?.hatchingWeight ??
                    2
                  }
                  min={0.5}
                  max={12}
                  step={0.5}
                  suffix="px"
                  onChange={(hatchingWeight) =>
                    patch(
                      (element) =>
                        element.type === "shape" ||
                        (element.type === "path" && element.closed)
                          ? { ...element, hatchingWeight }
                          : element,
                      "hatching-weight",
                    )
                  }
                />
                <RangeRow
                  label="Resserrement"
                  value={
                    selectedShape?.hatchingSpacing ??
                    selectedPath?.hatchingSpacing ??
                    14
                  }
                  min={3}
                  max={60}
                  suffix="px"
                  onChange={(hatchingSpacing) =>
                    patch(
                      (element) =>
                        element.type === "shape" ||
                        (element.type === "path" && element.closed)
                          ? { ...element, hatchingSpacing }
                          : element,
                      "hatching-spacing",
                    )
                  }
                />
              </>
            ) : null}
            <CheckRow
              label="Points"
              checked={
                selectedShape?.dotsEnabled ?? selectedPath?.dotsEnabled ?? false
              }
              onChange={(dotsEnabled) =>
                patch(
                  (element) =>
                    element.type === "shape" ||
                    (element.type === "path" && element.closed)
                      ? { ...element, dotsEnabled }
                      : element,
                  "dots-enabled",
                )
              }
            />
            {(selectedShape?.dotsEnabled ?? selectedPath?.dotsEnabled) ? (
              <>
                <ColorRow
                  label="Couleur points"
                  value={
                    selectedShape?.dotsColor ??
                    selectedPath?.dotsColor ??
                    "#111827"
                  }
                  onChange={(dotsColor) =>
                    patch(
                      (element) =>
                        element.type === "shape" ||
                        (element.type === "path" && element.closed)
                          ? { ...element, dotsColor }
                          : element,
                      "dots-color",
                    )
                  }
                />
                <RangeRow
                  label="Rayon points"
                  value={
                    selectedShape?.dotsRadius ?? selectedPath?.dotsRadius ?? 2
                  }
                  min={0.5}
                  max={10}
                  step={0.5}
                  suffix="px"
                  onChange={(dotsRadius) =>
                    patch(
                      (element) =>
                        element.type === "shape" ||
                        (element.type === "path" && element.closed)
                          ? { ...element, dotsRadius }
                          : element,
                      "dots-radius",
                    )
                  }
                />
                <RangeRow
                  label="Espacement points"
                  value={
                    selectedShape?.dotsSpacing ??
                    selectedPath?.dotsSpacing ??
                    14
                  }
                  min={3}
                  max={60}
                  suffix="px"
                  onChange={(dotsSpacing) =>
                    patch(
                      (element) =>
                        element.type === "shape" ||
                        (element.type === "path" && element.closed)
                          ? { ...element, dotsSpacing }
                          : element,
                      "dots-spacing",
                    )
                  }
                />
              </>
            ) : null}
          </>
        ) : null}

        {selectedPath?.rawPoints ? (
          <RangeRow
            label="Lissage"
            value={selectedPath.smoothing ?? 45}
            min={0}
            max={100}
            suffix="%"
            onChange={(smoothing) =>
              patch(
                (element) =>
                  element.type === "path" && element.rawPoints
                    ? {
                        ...element,
                        smoothing,
                        points: smoothPath(
                          element.rawPoints,
                          smoothing,
                          element.closed,
                        ),
                      }
                    : element,
                "smoothing",
              )
            }
          />
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => moveSelectedElement("back")}
            className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
          >
            Arrière-plan
          </button>
          <button
            type="button"
            onClick={() => moveSelectedElement("front")}
            className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
          >
            Premier plan
          </button>
        </div>
        <button
          type="button"
          onClick={deleteSelectedElement}
          className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100"
        >
          Supprimer cet élément
        </button>
      </SettingSection>
    );
  }

  function renderContextSettings() {
    if (selectedElement) return renderSelectedSettings();
    if (
      activeTool === "line" ||
      activeTool === "arrow" ||
      activeTool === "freehand-line"
    ) {
      return renderLinePresetSettings();
    }
    if (
      activeTool === "polygon" ||
      activeTool === "freehand-zone" ||
      activeTool === "rectangle" ||
      activeTool === "circle" ||
      activeTool === "ellipse" ||
      activeTool === "triangle" ||
      activeTool === "diamond" ||
      activeTool === "star"
    ) {
      return renderZonePresetSettings();
    }
    if (activeTool === "text") return renderTextPresetSettings();
    return (
      <SettingSection title="Sélection">
        <p className="text-xs leading-relaxed text-slate-700">
          Clique sur un élément pour afficher uniquement ses paramètres.
          Recliquer sur un outil actif revient à la sélection, comme dans
          l’éditeur de carte.
        </p>
        <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
          Aimantation activée entre les centres, angles et extrémités.
        </div>
      </SettingSection>
    );
  }

  const content = (
    <div
      data-dromap-tool-settings-panel="true"
      className="dromap-custom-marker-designer fixed inset-0 z-[6000] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
    >
      <style jsx global>{`
        .dromap-custom-marker-designer .dromap-designer-settings,
        .dromap-custom-marker-designer .dromap-designer-settings label,
        .dromap-custom-marker-designer
          .dromap-designer-settings
          .dromap-marker-setting-row,
        .dromap-custom-marker-designer
          .dromap-designer-settings
          .dromap-marker-setting-row
          span,
        .dromap-custom-marker-designer
          .dromap-designer-settings
          .dromap-marker-setting-row
          strong {
          color: #334155 !important;
          opacity: 1 !important;
        }
        .dromap-custom-marker-designer .dromap-designer-settings input,
        .dromap-custom-marker-designer .dromap-designer-settings textarea,
        .dromap-custom-marker-designer .dromap-designer-settings select {
          color: #0f172a !important;
          opacity: 1 !important;
        }
        .dromap-custom-marker-designer input[type="range"] {
          opacity: 1 !important;
        }
      `}</style>
      <section className="flex h-[min(920px,calc(100vh-2rem))] w-[min(1400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-white/15 bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-3">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-slate-950">
              {initialMarker ? "Modifier le marqueur" : "Dessiner un marqueur"}
            </h2>
            <p className="truncate text-xs text-slate-600">
              Même logique que l’éditeur de carte, sans coordonnées ni zone de
              travail.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              title="Annuler — Ctrl+Z"
            >
              ↶
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              title="Rétablir — Ctrl+Y"
            >
              ↷
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Fermer
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[190px_minmax(0,1fr)_300px]">
          <aside className="overflow-y-auto border-r border-slate-200 bg-slate-50 p-3">
            {TOOL_GROUPS.map((group) => (
              <div key={group.label} className="mb-4">
                <div className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-600">
                  {group.label}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {group.tools.map((tool) => (
                    <ToolButton
                      key={tool.id}
                      tool={tool}
                      activeTool={activeTool}
                      onChoose={chooseTool}
                    />
                  ))}
                </div>
              </div>
            ))}
          </aside>

          <main className="min-h-0 overflow-auto bg-slate-100 p-4">
            <div className="mx-auto aspect-square w-full max-w-[760px] overflow-hidden rounded-3xl border border-slate-300 bg-white shadow-xl">
              <svg
                viewBox={`0 0 ${CUSTOM_MARKER_CANVAS_SIZE} ${CUSTOM_MARKER_CANVAS_SIZE}`}
                className="h-full w-full touch-none select-none"
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerCancel={handleCanvasPointerUp}
                onDoubleClick={(event) => {
                  if (clickDraft?.kind === "polyline") {
                    event.preventDefault();
                    event.stopPropagation();
                    finishClickDraft();
                  }
                }}
                style={{
                  cursor:
                    activeTool === "select"
                      ? "default"
                      : activeTool === "text"
                        ? "text"
                        : "crosshair",
                  backgroundImage:
                    "linear-gradient(45deg,#f1f5f9 25%,transparent 25%),linear-gradient(-45deg,#f1f5f9 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#f1f5f9 75%),linear-gradient(-45deg,transparent 75%,#f1f5f9 75%)",
                  backgroundSize: "28px 28px",
                  backgroundPosition: "0 0,0 14px,14px -14px,-14px 0px",
                }}
              >
                <defs>
                  <marker
                    id="custom-marker-designer-arrow-end"
                    markerWidth="8"
                    markerHeight="8"
                    refX="6.5"
                    refY="3"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L0,6 L7,3 z" fill="context-stroke" />
                  </marker>
                  <marker
                    id="custom-marker-designer-arrow-start"
                    markerWidth="8"
                    markerHeight="8"
                    refX="0.5"
                    refY="3"
                    orient="auto-start-reverse"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L0,6 L7,3 z" fill="context-stroke" />
                  </marker>
                  <PatternDefinitions
                    elements={[
                      ...elements,
                      ...(previewElement ? [previewElement] : []),
                    ]}
                  />
                </defs>

                {snapGuide?.x !== undefined ? (
                  <line
                    x1={snapGuide.x}
                    y1="0"
                    x2={snapGuide.x}
                    y2={CUSTOM_MARKER_CANVAS_SIZE}
                    stroke="#10b981"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                    pointerEvents="none"
                  />
                ) : null}
                {snapGuide?.y !== undefined ? (
                  <line
                    x1="0"
                    y1={snapGuide.y}
                    x2={CUSTOM_MARKER_CANVAS_SIZE}
                    y2={snapGuide.y}
                    stroke="#10b981"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                    pointerEvents="none"
                  />
                ) : null}
                {snapGuide?.point ? (
                  <circle
                    cx={snapGuide.point.x}
                    cy={snapGuide.point.y}
                    r="3"
                    fill="#ffffff"
                    stroke="#10b981"
                    strokeWidth="1.25"
                    pointerEvents="none"
                  />
                ) : null}

                {elements.map((element) => (
                  <MarkerElementVisual
                    key={element.id}
                    element={element}
                    selected={element.id === selectedElementId}
                    onPointerDown={(event) =>
                      selectAndStartMove(event, element)
                    }
                  />
                ))}

                {previewElement ? (
                  <MarkerElementVisual
                    element={previewElement}
                    selected={false}
                    opacityMultiplier={0.72}
                    onPointerDown={() => undefined}
                  />
                ) : null}

                {selectedShape ? (
                  <g
                    transform={`rotate(${selectedShape.rotation} ${selectedShape.x + selectedShape.width / 2} ${selectedShape.y + selectedShape.height / 2})`}
                  >
                    <rect
                      x={selectedShape.x - 2}
                      y={selectedShape.y - 2}
                      width={selectedShape.width + 4}
                      height={selectedShape.height + 4}
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="1.25"
                      strokeDasharray="4 3"
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                    {(
                      [
                        ["nw", selectedShape.x - 2, selectedShape.y - 2],
                        [
                          "ne",
                          selectedShape.x + selectedShape.width + 2,
                          selectedShape.y - 2,
                        ],
                        [
                          "sw",
                          selectedShape.x - 2,
                          selectedShape.y + selectedShape.height + 2,
                        ],
                        [
                          "se",
                          selectedShape.x + selectedShape.width + 2,
                          selectedShape.y + selectedShape.height + 2,
                        ],
                      ] as const
                    ).map(([corner, x, y]) => (
                      <circle
                        key={corner}
                        cx={x}
                        cy={y}
                        r="3.2"
                        fill="#ffffff"
                        stroke="#2563eb"
                        strokeWidth="1.5"
                        onPointerDown={(event) =>
                          startShapeResize(event, selectedShape, corner)
                        }
                        style={{ cursor: `${corner}-resize` }}
                      />
                    ))}
                    <line
                      x1={selectedShape.x + selectedShape.width / 2}
                      y1={selectedShape.y - 2}
                      x2={selectedShape.x + selectedShape.width / 2}
                      y2={selectedShape.y - 20}
                      stroke="#2563eb"
                      strokeWidth="1.25"
                      pointerEvents="none"
                    />
                    <circle
                      cx={selectedShape.x + selectedShape.width / 2}
                      cy={selectedShape.y - 24}
                      r="4"
                      fill="#ffffff"
                      stroke="#2563eb"
                      strokeWidth="1.5"
                      onPointerDown={(event) =>
                        startRotation(event, selectedShape)
                      }
                      style={{ cursor: "grab" }}
                    />
                  </g>
                ) : null}

                {selectedText ? (
                  <g
                    transform={`rotate(${selectedText.rotation} ${selectedText.x + selectedText.width / 2} ${selectedText.y + selectedText.height / 2})`}
                  >
                    <rect
                      x={selectedText.x - 2}
                      y={selectedText.y - 2}
                      width={selectedText.width + 4}
                      height={selectedText.height + 4}
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="1.25"
                      strokeDasharray="4 3"
                      pointerEvents="none"
                    />
                    <circle
                      cx={selectedText.x + selectedText.width + 2}
                      cy={selectedText.y + selectedText.height + 2}
                      r="3.2"
                      fill="#ffffff"
                      stroke="#2563eb"
                      strokeWidth="1.5"
                      onPointerDown={(event) =>
                        startTextResize(event, selectedText)
                      }
                      style={{ cursor: "se-resize" }}
                    />
                    <line
                      x1={selectedText.x + selectedText.width / 2}
                      y1={selectedText.y - 2}
                      x2={selectedText.x + selectedText.width / 2}
                      y2={selectedText.y - 20}
                      stroke="#2563eb"
                      strokeWidth="1.25"
                      pointerEvents="none"
                    />
                    <circle
                      cx={selectedText.x + selectedText.width / 2}
                      cy={selectedText.y - 24}
                      r="4"
                      fill="#ffffff"
                      stroke="#2563eb"
                      strokeWidth="1.5"
                      onPointerDown={(event) =>
                        startRotation(event, selectedText)
                      }
                      style={{ cursor: "grab" }}
                    />
                  </g>
                ) : null}

                {selectedLine ? (
                  <g>
                    <line
                      x1={selectedLine.x1}
                      y1={selectedLine.y1}
                      x2={selectedLine.x2}
                      y2={selectedLine.y2}
                      stroke="#2563eb"
                      strokeWidth={selectedLine.strokeWidth + 5}
                      opacity="0.14"
                      strokeLinecap="round"
                      pointerEvents="none"
                    />
                    <circle
                      cx={selectedLine.x1}
                      cy={selectedLine.y1}
                      r="4"
                      fill="#ffffff"
                      stroke="#2563eb"
                      strokeWidth="1.5"
                      onPointerDown={(event) =>
                        startLineEndpointDrag(event, selectedLine, "start")
                      }
                      style={{ cursor: "move" }}
                    />
                    <circle
                      cx={selectedLine.x2}
                      cy={selectedLine.y2}
                      r="4"
                      fill="#ffffff"
                      stroke="#2563eb"
                      strokeWidth="1.5"
                      onPointerDown={(event) =>
                        startLineEndpointDrag(event, selectedLine, "end")
                      }
                      style={{ cursor: "move" }}
                    />
                  </g>
                ) : null}

                {selectedPath
                  ? (() => {
                      const bounds = getBounds(selectedPath);
                      return (
                        <rect
                          x={bounds.minX - 2}
                          y={bounds.minY - 2}
                          width={bounds.maxX - bounds.minX + 4}
                          height={bounds.maxY - bounds.minY + 4}
                          fill="none"
                          stroke="#2563eb"
                          strokeWidth="1.25"
                          strokeDasharray="4 3"
                          pointerEvents="none"
                        />
                      );
                    })()
                  : null}
              </svg>
            </div>
          </main>

          <aside className="dromap-designer-settings overflow-y-auto border-l border-slate-200 bg-white p-4 text-slate-900">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-800">
                Nom du marqueur
              </span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <div className="mt-4">{renderContextSettings()}</div>
          </aside>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3">
          <span className="text-xs text-slate-600">
            {elements.length} élément{elements.length > 1 ? "s" : ""} · Ctrl+Z
            pour annuler
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={elements.length === 0 || name.trim().length === 0}
              onClick={() =>
                onSave({
                  name: name.trim(),
                  elements,
                  dataUrl: createDrawnMarkerDataUrl(elements),
                })
              }
              className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-black text-white shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              Enregistrer dans Mes marqueurs
            </button>
          </div>
        </footer>
      </section>
    </div>
  );

  return typeof document === "undefined"
    ? null
    : createPortal(content, document.body);
}
