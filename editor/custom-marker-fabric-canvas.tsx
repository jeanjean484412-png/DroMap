"use client";

import { getDromapRuntimeFontFamily } from "@/lib/dromap/font-family";

import { useEffect, useRef } from "react";

import {
  CUSTOM_MARKER_CANVAS_SIZE,
  type DroMapDrawnMarkerDashStyle,
  type DroMapDrawnMarkerElement,
  type DroMapDrawnMarkerHatchingStyle,
  type DroMapDrawnMarkerPathElement,
  type DroMapDrawnMarkerPoint,
  type DroMapDrawnMarkerShapeElement,
  type DroMapDrawnMarkerShapeKind,
  type DroMapDrawnMarkerTextElement,
} from "@/stores/editor-custom-markers";

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

type CustomMarkerFabricCanvasProps = {
  elements: DroMapDrawnMarkerElement[];
  activeTool: DesignerTool;
  selectedElementId: string | null;
  linePreset: LinePreset;
  zonePreset: ZonePreset;
  textPreset: TextPreset;
  onSelectElement: (elementId: string | null) => void;
  onCommitElements: (
    elements: DroMapDrawnMarkerElement[],
    coalesceKey?: string,
  ) => void;
  onSwitchToSelect: () => void;
};

type FabricObjectWithDroMapMeta = {
  __dromapElementId?: string;
  __dromapBaseElement?: DroMapDrawnMarkerElement;
  __dromapInitialMatrix?: number[];
  __dromapGuide?: boolean;
  [key: string]: unknown;
};

type Matrix = [number, number, number, number, number, number];

type Draft =
  | {
      kind: "drag";
      tool:
        | "rectangle"
        | "circle"
        | "ellipse"
        | "triangle"
        | "diamond"
        | "star";
      start: DroMapDrawnMarkerPoint;
      preview: any | null;
    }
  | {
      kind: "freehand";
      closed: boolean;
      points: DroMapDrawnMarkerPoint[];
      preview: any | null;
    }
  | {
      kind: "polyline";
      tool: "line" | "arrow" | "polygon";
      points: DroMapDrawnMarkerPoint[];
      preview: any | null;
      pointer: DroMapDrawnMarkerPoint | null;
    };

const MIN_ELEMENT_SIZE = 8;
const SNAP_DISTANCE = 6;
const DROMAP_BLUE = "#2563eb";

function cloneElement<T extends DroMapDrawnMarkerElement>(element: T): T {
  return JSON.parse(JSON.stringify(element)) as T;
}

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

function clampPoint(point: DroMapDrawnMarkerPoint) {
  return {
    x: clamp(point.x),
    y: clamp(point.y),
  };
}

function normalizeRotation(value: number) {
  let next = Number.isFinite(value) ? value : 0;
  while (next > 180) next -= 360;
  while (next < -180) next += 360;
  return Math.round(next * 10) / 10;
}

function normalizeShapeBounds(
  start: DroMapDrawnMarkerPoint,
  end: DroMapDrawnMarkerPoint,
  forceSquare = false,
) {
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

function getElementBounds(element: DroMapDrawnMarkerElement) {
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

function getElementAnchors(element: DroMapDrawnMarkerElement) {
  const bounds = getElementBounds(element);
  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
  if (element.type === "line" || element.type === "arrow") {
    return [
      { x: element.x1, y: element.y1 },
      { x: element.x2, y: element.y2 },
      center,
    ];
  }
  if (element.type === "path") {
    return [...element.points, center];
  }
  return [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.minX, y: bounds.maxY },
    { x: bounds.maxX, y: bounds.maxY },
    center,
  ];
}

function snapPoint(
  point: DroMapDrawnMarkerPoint,
  elements: DroMapDrawnMarkerElement[],
  ignoredElementIds: string[] = [],
) {
  const ignored = new Set(ignoredElementIds);
  const targets = [
    { x: CUSTOM_MARKER_CANVAS_SIZE / 2, y: CUSTOM_MARKER_CANVAS_SIZE / 2 },
    ...elements
      .filter((element) => !ignored.has(element.id))
      .flatMap(getElementAnchors),
  ];

  let best = point;
  let bestDistance = SNAP_DISTANCE + 1;
  for (const target of targets) {
    const distance = Math.hypot(point.x - target.x, point.y - target.y);
    if (distance <= SNAP_DISTANCE && distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  return clampPoint(best);
}

function smoothPath(
  points: DroMapDrawnMarkerPoint[],
  smoothing: number,
  closed: boolean,
) {
  if (points.length < 3 || smoothing <= 0) return points;
  const passes = Math.min(4, Math.max(1, Math.round(smoothing / 25)));
  let current = points.map((point) => ({ ...point }));
  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.map((point, index) => {
      if (!closed && (index === 0 || index === current.length - 1)) return point;
      const previous = current[(index - 1 + current.length) % current.length];
      const following = current[(index + 1) % current.length];
      return {
        x: point.x * 0.5 + previous.x * 0.25 + following.x * 0.25,
        y: point.y * 0.5 + previous.y * 0.25 + following.y * 0.25,
      };
    });
    current = next;
  }
  return current;
}

function dashArray(
  style: DroMapDrawnMarkerDashStyle | undefined,
  width: number,
) {
  if (style === "dashed") return [Math.max(6, width * 4), Math.max(4, width * 2.5)];
  if (style === "dotted") return [0.1, Math.max(5, width * 2.8)];
  return undefined;
}

function multiplyMatrices(left: Matrix, right: Matrix): Matrix {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function invertMatrix(matrix: Matrix): Matrix {
  const [a, b, c, d, e, f] = matrix;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-9) return [1, 0, 0, 1, 0, 0];
  const inverse = 1 / determinant;
  return [
    d * inverse,
    -b * inverse,
    -c * inverse,
    a * inverse,
    (c * f - d * e) * inverse,
    (b * e - a * f) * inverse,
  ];
}

function transformPoint(
  matrix: Matrix,
  point: DroMapDrawnMarkerPoint,
): DroMapDrawnMarkerPoint {
  return {
    x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
    y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
  };
}

function distance(first: DroMapDrawnMarkerPoint, second: DroMapDrawnMarkerPoint) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function applyFabricTransform(
  element: DroMapDrawnMarkerElement,
  initialMatrix: Matrix,
  currentMatrix: Matrix,
): DroMapDrawnMarkerElement {
  const delta = multiplyMatrices(currentMatrix, invertMatrix(initialMatrix));

  if (element.type === "line" || element.type === "arrow") {
    const start = transformPoint(delta, { x: element.x1, y: element.y1 });
    const end = transformPoint(delta, { x: element.x2, y: element.y2 });
    return {
      ...element,
      x1: clamp(start.x),
      y1: clamp(start.y),
      x2: clamp(end.x),
      y2: clamp(end.y),
    };
  }

  if (element.type === "path") {
    return {
      ...element,
      points: element.points.map((point) => clampPoint(transformPoint(delta, point))),
      rawPoints: element.rawPoints?.map((point) =>
        clampPoint(transformPoint(delta, point)),
      ),
    };
  }

  if (element.type !== "shape" && element.type !== "text") return element;

  const center = {
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
  };
  const angle = ((element.rotation ?? 0) * Math.PI) / 180;
  const xAxis = {
    x: center.x + Math.cos(angle) * (element.width / 2),
    y: center.y + Math.sin(angle) * (element.width / 2),
  };
  const yAxis = {
    x: center.x - Math.sin(angle) * (element.height / 2),
    y: center.y + Math.cos(angle) * (element.height / 2),
  };
  const nextCenter = transformPoint(delta, center);
  const nextXAxis = transformPoint(delta, xAxis);
  const nextYAxis = transformPoint(delta, yAxis);
  const width = Math.max(MIN_ELEMENT_SIZE, distance(nextCenter, nextXAxis) * 2);
  const height = Math.max(MIN_ELEMENT_SIZE, distance(nextCenter, nextYAxis) * 2);
  const rotation = normalizeRotation(
    (Math.atan2(nextXAxis.y - nextCenter.y, nextXAxis.x - nextCenter.x) * 180) /
      Math.PI,
  );

  if (element.type === "text") {
    const scale = Math.max(width / element.width, height / element.height);
    return {
      ...element,
      x: clamp(nextCenter.x - width / 2, 0, CUSTOM_MARKER_CANVAS_SIZE - width),
      y: clamp(nextCenter.y - height / 2, 0, CUSTOM_MARKER_CANVAS_SIZE - height),
      width: Math.min(CUSTOM_MARKER_CANVAS_SIZE, width),
      height: Math.min(CUSTOM_MARKER_CANVAS_SIZE, height),
      rotation,
      fontSize: clamp(element.fontSize * scale, 10, 120),
    };
  }

  return {
    ...element,
    x: clamp(nextCenter.x - width / 2, 0, CUSTOM_MARKER_CANVAS_SIZE - width),
    y: clamp(nextCenter.y - height / 2, 0, CUSTOM_MARKER_CANVAS_SIZE - height),
    width: Math.min(CUSTOM_MARKER_CANVAS_SIZE, width),
    height: Math.min(CUSTOM_MARKER_CANVAS_SIZE, height),
    rotation,
  };
}

function makePatternCanvas(
  kind: "hatch" | "dots",
  options: {
    color: string;
    spacing: number;
    weight?: number;
    radius?: number;
    direction?: DroMapDrawnMarkerHatchingStyle;
  },
) {
  const spacing = Math.max(4, Math.round(options.spacing));
  const canvas = document.createElement("canvas");
  canvas.width = spacing;
  canvas.height = spacing;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  context.clearRect(0, 0, spacing, spacing);
  context.strokeStyle = options.color;
  context.fillStyle = options.color;
  context.lineWidth = Math.max(1, options.weight ?? 1);
  context.lineCap = "round";

  if (kind === "dots") {
    context.beginPath();
    context.arc(spacing / 2, spacing / 2, Math.max(0.8, options.radius ?? 1.5), 0, Math.PI * 2);
    context.fill();
    return canvas;
  }

  context.beginPath();
  const direction = options.direction ?? "diagonal-right";
  if (direction === "horizontal") {
    context.moveTo(0, spacing / 2);
    context.lineTo(spacing, spacing / 2);
  } else if (direction === "vertical") {
    context.moveTo(spacing / 2, 0);
    context.lineTo(spacing / 2, spacing);
  } else if (direction === "diagonal-left") {
    context.moveTo(-spacing / 4, spacing / 4);
    context.lineTo((spacing * 3) / 4, spacing * 1.25);
    context.moveTo(spacing / 4, -spacing / 4);
    context.lineTo(spacing * 1.25, (spacing * 3) / 4);
  } else {
    context.moveTo(-spacing / 4, (spacing * 3) / 4);
    context.lineTo((spacing * 3) / 4, -spacing / 4);
    context.moveTo(spacing / 4, spacing * 1.25);
    context.lineTo(spacing * 1.25, spacing / 4);
  }
  context.stroke();
  return canvas;
}

function configureInteractiveObject(object: any, element: DroMapDrawnMarkerElement) {
  object.set({
    borderColor: DROMAP_BLUE,
    cornerColor: "#ffffff",
    cornerStrokeColor: DROMAP_BLUE,
    cornerStyle: "circle",
    cornerSize: 8,
    transparentCorners: false,
    borderDashArray: [4, 3],
    padding: 3,
    lockSkewingX: true,
    lockSkewingY: true,
    lockScalingFlip: true,
    centeredRotation: true,
  });

  if (element.type === "text") {
    object.setControlsVisibility?.({ ml: false, mr: false, mt: false, mb: false });
  }
  if (element.type === "shape" && element.shape === "circle") {
    object.setControlsVisibility?.({ ml: false, mr: false, mt: false, mb: false });
  }
}

function starPoints(width: number, height: number) {
  const points: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const ratio = index % 2 === 0 ? 1 : 0.44;
    points.push({
      x: Math.cos(angle) * (width / 2) * ratio,
      y: Math.sin(angle) * (height / 2) * ratio,
    });
  }
  return points;
}

function makeShapePrimitive(
  fabric: any,
  element: DroMapDrawnMarkerShapeElement,
  options: Record<string, unknown>,
) {
  const common = {
    left: 0,
    top: 0,
    originX: "center",
    originY: "center",
    objectCaching: false,
    ...options,
  };
  if (element.shape === "ellipse" || element.shape === "circle") {
    return new fabric.Ellipse({
      ...common,
      rx: element.width / 2,
      ry: element.height / 2,
    });
  }
  if (element.shape === "triangle") {
    return new fabric.Triangle({
      ...common,
      width: element.width,
      height: element.height,
    });
  }
  if (element.shape === "diamond") {
    return new fabric.Polygon(
      [
        { x: 0, y: -element.height / 2 },
        { x: element.width / 2, y: 0 },
        { x: 0, y: element.height / 2 },
        { x: -element.width / 2, y: 0 },
      ],
      common,
    );
  }
  if (element.shape === "star") {
    return new fabric.Polygon(starPoints(element.width, element.height), common);
  }
  return new fabric.Rect({
    ...common,
    width: element.width,
    height: element.height,
    rx: Math.min(18, element.width / 8, element.height / 8),
    ry: Math.min(18, element.width / 8, element.height / 8),
  });
}

function makeShapeObject(fabric: any, element: DroMapDrawnMarkerShapeElement) {
  const layers: any[] = [];
  if (element.fillEnabled) {
    layers.push(
      makeShapePrimitive(fabric, element, {
        fill: element.fillColor,
        opacity: element.fillOpacity ?? 0.25,
        stroke: undefined,
      }),
    );
  }
  if (element.hatchingStyle && element.hatchingStyle !== "none") {
    const pattern = new fabric.Pattern({
      source: makePatternCanvas("hatch", {
        color: element.hatchingColor ?? "#111827",
        spacing: element.hatchingSpacing ?? 14,
        weight: element.hatchingWeight ?? 2,
        direction: element.hatchingStyle,
      }),
      repeat: "repeat",
    });
    layers.push(
      makeShapePrimitive(fabric, element, {
        fill: pattern,
        stroke: undefined,
      }),
    );
  }
  if (element.dotsEnabled) {
    const pattern = new fabric.Pattern({
      source: makePatternCanvas("dots", {
        color: element.dotsColor ?? "#111827",
        spacing: element.dotsSpacing ?? 14,
        radius: element.dotsRadius ?? 2,
      }),
      repeat: "repeat",
    });
    layers.push(
      makeShapePrimitive(fabric, element, {
        fill: pattern,
        stroke: undefined,
      }),
    );
  }
  if (element.strokeEnabled !== false && element.strokeWidth > 0) {
    layers.push(
      makeShapePrimitive(fabric, element, {
        fill: "transparent",
        stroke: element.strokeColor,
        strokeWidth: element.strokeWidth,
        strokeDashArray: dashArray(element.dashStyle, element.strokeWidth),
        strokeLineCap: "round",
        strokeLineJoin: "round",
        strokeUniform: true,
        opacity: element.strokeOpacity ?? 1,
      }),
    );
  }
  if (layers.length === 0) {
    layers.push(
      makeShapePrimitive(fabric, element, {
        fill: "rgba(15,23,42,0.02)",
        stroke: "rgba(15,23,42,0.16)",
        strokeWidth: 1,
        strokeUniform: true,
      }),
    );
  }
  return new fabric.Group(layers, {
    left: element.x + element.width / 2,
    top: element.y + element.height / 2,
    originX: "center",
    originY: "center",
    angle: element.rotation,
    objectCaching: false,
    subTargetCheck: false,
  });
}

function arrowHeadPoints(
  tip: DroMapDrawnMarkerPoint,
  from: DroMapDrawnMarkerPoint,
  strokeWidth: number,
) {
  const deltaX = tip.x - from.x;
  const deltaY = tip.y - from.y;
  const length = Math.max(1, Math.hypot(deltaX, deltaY));
  const unitX = deltaX / length;
  const unitY = deltaY / length;
  const normalX = -unitY;
  const normalY = unitX;
  const headLength = Math.max(12, strokeWidth * 3.2);
  const halfWidth = Math.max(7, strokeWidth * 1.8);
  const baseX = tip.x - unitX * headLength;
  const baseY = tip.y - unitY * headLength;
  return [
    { x: tip.x, y: tip.y },
    { x: baseX + normalX * halfWidth, y: baseY + normalY * halfWidth },
    { x: baseX - normalX * halfWidth, y: baseY - normalY * halfWidth },
  ];
}

function makeLineObject(fabric: any, element: Extract<DroMapDrawnMarkerElement, { type: "line" | "arrow" }>) {
  const center = {
    x: (element.x1 + element.x2) / 2,
    y: (element.y1 + element.y2) / 2,
  };
  const toLocal = (point: DroMapDrawnMarkerPoint) => ({
    x: point.x - center.x,
    y: point.y - center.y,
  });
  const start = toLocal({ x: element.x1, y: element.y1 });
  const end = toLocal({ x: element.x2, y: element.y2 });
  const layers: any[] = [
    new fabric.Line([start.x, start.y, end.x, end.y], {
      stroke: element.strokeColor,
      strokeWidth: element.strokeWidth,
      strokeDashArray: dashArray(element.dashStyle, element.strokeWidth),
      strokeLineCap: "round",
      strokeLineJoin: "round",
      strokeUniform: true,
      opacity: element.strokeOpacity ?? 1,
      originX: "center",
      originY: "center",
      objectCaching: false,
    }),
  ];
  if (element.arrowStart) {
    layers.push(
      new fabric.Polygon(
        arrowHeadPoints(start, end, element.strokeWidth),
        {
          fill: element.strokeColor,
          opacity: element.strokeOpacity ?? 1,
          objectCaching: false,
        },
      ),
    );
  }
  if (element.arrowEnd || element.type === "arrow") {
    layers.push(
      new fabric.Polygon(
        arrowHeadPoints(end, start, element.strokeWidth),
        {
          fill: element.strokeColor,
          opacity: element.strokeOpacity ?? 1,
          objectCaching: false,
        },
      ),
    );
  }
  return new fabric.Group(layers, {
    left: center.x,
    top: center.y,
    originX: "center",
    originY: "center",
    objectCaching: false,
    subTargetCheck: false,
  });
}

function makePathShape(
  fabric: any,
  points: DroMapDrawnMarkerPoint[],
  closed: boolean,
  options: Record<string, unknown>,
) {
  const Klass = closed ? fabric.Polygon : fabric.Polyline;
  return new Klass(points, {
    objectCaching: false,
    ...options,
  });
}

function makePathObject(fabric: any, element: DroMapDrawnMarkerPathElement) {
  const bounds = getElementBounds(element);
  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
  const points = element.points.map((point) => ({
    x: point.x - center.x,
    y: point.y - center.y,
  }));
  const layers: any[] = [];

  if (element.closed && element.fillEnabled) {
    layers.push(
      makePathShape(fabric, points, true, {
        fill: element.fillColor,
        opacity: element.fillOpacity ?? 0.25,
        stroke: undefined,
      }),
    );
  }
  if (
    element.closed &&
    element.hatchingStyle &&
    element.hatchingStyle !== "none"
  ) {
    const pattern = new fabric.Pattern({
      source: makePatternCanvas("hatch", {
        color: element.hatchingColor ?? "#111827",
        spacing: element.hatchingSpacing ?? 14,
        weight: element.hatchingWeight ?? 2,
        direction: element.hatchingStyle,
      }),
      repeat: "repeat",
    });
    layers.push(
      makePathShape(fabric, points, true, {
        fill: pattern,
        stroke: undefined,
      }),
    );
  }
  if (element.closed && element.dotsEnabled) {
    const pattern = new fabric.Pattern({
      source: makePatternCanvas("dots", {
        color: element.dotsColor ?? "#111827",
        spacing: element.dotsSpacing ?? 14,
        radius: element.dotsRadius ?? 2,
      }),
      repeat: "repeat",
    });
    layers.push(
      makePathShape(fabric, points, true, {
        fill: pattern,
        stroke: undefined,
      }),
    );
  }
  if (!element.closed || (element.strokeEnabled !== false && element.strokeWidth > 0)) {
    layers.push(
      makePathShape(fabric, points, element.closed, {
        fill: element.closed ? "transparent" : undefined,
        stroke: element.strokeColor,
        strokeWidth: element.strokeWidth,
        strokeDashArray: dashArray(element.dashStyle, element.strokeWidth),
        strokeLineCap: "round",
        strokeLineJoin: "round",
        strokeUniform: true,
        opacity: element.strokeOpacity ?? 1,
      }),
    );
  }
  if (!element.closed && element.points.length >= 2) {
    const start = points[0];
    const second = points[1];
    const end = points[points.length - 1];
    const beforeEnd = points[points.length - 2];
    if (element.arrowStart) {
      layers.push(
        new fabric.Polygon(arrowHeadPoints(start, second, element.strokeWidth), {
          fill: element.strokeColor,
          opacity: element.strokeOpacity ?? 1,
          objectCaching: false,
        }),
      );
    }
    if (element.arrowEnd) {
      layers.push(
        new fabric.Polygon(arrowHeadPoints(end, beforeEnd, element.strokeWidth), {
          fill: element.strokeColor,
          opacity: element.strokeOpacity ?? 1,
          objectCaching: false,
        }),
      );
    }
  }

  return new fabric.Group(layers, {
    left: center.x,
    top: center.y,
    originX: "center",
    originY: "center",
    objectCaching: false,
    subTargetCheck: false,
  });
}

function makeTextObject(fabric: any, element: DroMapDrawnMarkerTextElement) {
  const layers: any[] = [
    new fabric.Rect({
      left: 0,
      top: 0,
      originX: "center",
      originY: "center",
      width: element.width,
      height: element.height,
      fill: "rgba(255,255,255,0.001)",
      stroke: undefined,
      objectCaching: false,
    }),
  ];
  if (element.backgroundEnabled || element.borderEnabled) {
    layers.push(
      new fabric.Rect({
        left: 0,
        top: 0,
        originX: "center",
        originY: "center",
        width: element.width,
        height: element.height,
        rx: 8,
        ry: 8,
        fill: element.backgroundEnabled
          ? element.backgroundColor ?? "#ffffff"
          : "transparent",
        opacity: element.backgroundEnabled ? element.backgroundOpacity ?? 0.85 : 1,
        stroke: element.borderEnabled
          ? element.borderColor ?? "#111827"
          : undefined,
        strokeWidth: element.borderEnabled ? element.borderWidth ?? 2 : 0,
        strokeUniform: true,
        objectCaching: false,
      }),
    );
  }
  layers.push(
    new fabric.Text(element.text, {
      left: 0,
      top: 0,
      originX: "center",
      originY: "center",
      fill: element.color,
      opacity: element.opacity ?? 1,
      fontFamily: getDromapRuntimeFontFamily(),
      fontSize: element.fontSize,
      fontWeight: 700,
      textAlign: "center",
      objectCaching: false,
    }),
  );
  return new fabric.Group(layers, {
    left: element.x + element.width / 2,
    top: element.y + element.height / 2,
    originX: "center",
    originY: "center",
    angle: element.rotation,
    objectCaching: false,
    subTargetCheck: false,
  });
}

function createFabricObject(fabric: any, element: DroMapDrawnMarkerElement) {
  const object =
    element.type === "shape"
      ? makeShapeObject(fabric, element)
      : element.type === "path"
        ? makePathObject(fabric, element)
        : element.type === "text"
          ? makeTextObject(fabric, element)
          : makeLineObject(fabric, element);

  configureInteractiveObject(object, element);
  const meta = object as FabricObjectWithDroMapMeta;
  meta.__dromapElementId = element.id;
  meta.__dromapBaseElement = cloneElement(element);
  object.setCoords?.();
  meta.__dromapInitialMatrix = [...object.calcTransformMatrix()] as Matrix;
  return object;
}

function createShapeElement(
  tool: Exclude<
    DesignerTool,
    "select" | "text" | "line" | "arrow" | "freehand-line" | "freehand-zone" | "polygon"
  >,
  start: DroMapDrawnMarkerPoint,
  end: DroMapDrawnMarkerPoint,
  preset: ZonePreset,
): DroMapDrawnMarkerShapeElement {
  return {
    id: createElementId(),
    type: "shape",
    shape: tool as DroMapDrawnMarkerShapeKind,
    ...normalizeShapeBounds(start, end, tool === "circle"),
    rotation: 0,
    fillEnabled: preset.fillEnabled,
    fillColor: preset.fillColor,
    fillOpacity: preset.fillOpacity,
    strokeEnabled: preset.strokeEnabled,
    strokeColor: preset.color,
    strokeOpacity: preset.opacity,
    strokeWidth: preset.weight,
    dashStyle: preset.dashStyle,
    hatchingStyle: preset.hatchingStyle,
    hatchingColor: preset.hatchingColor,
    hatchingWeight: preset.hatchingWeight,
    hatchingSpacing: preset.hatchingSpacing,
    dotsEnabled: preset.dotsEnabled,
    dotsColor: preset.dotsColor,
    dotsRadius: preset.dotsRadius,
    dotsSpacing: preset.dotsSpacing,
  };
}

function createPathElement(
  tool: "line" | "arrow" | "polygon",
  points: DroMapDrawnMarkerPoint[],
  linePreset: LinePreset,
  zonePreset: ZonePreset,
): DroMapDrawnMarkerPathElement {
  const closed = tool === "polygon";
  return {
    id: createElementId(),
    type: "path",
    points,
    rawPoints: points,
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
    arrowStart: !closed && tool !== "arrow" ? linePreset.arrowStart : false,
    arrowEnd: !closed && (tool === "arrow" || linePreset.arrowEnd),
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

function createFreehandElement(
  closed: boolean,
  rawPoints: DroMapDrawnMarkerPoint[],
  linePreset: LinePreset,
  zonePreset: ZonePreset,
): DroMapDrawnMarkerPathElement {
  const smoothing = closed ? zonePreset.smoothing : linePreset.smoothing;
  const points = smoothPath(rawPoints, smoothing, closed);
  return {
    id: createElementId(),
    type: "path",
    points,
    rawPoints,
    smoothing,
    closed,
    fillEnabled: closed ? zonePreset.fillEnabled : false,
    fillColor: zonePreset.fillColor,
    fillOpacity: zonePreset.fillOpacity,
    strokeEnabled: closed ? zonePreset.strokeEnabled : true,
    strokeColor: closed ? zonePreset.color : linePreset.color,
    strokeOpacity: closed ? zonePreset.opacity : linePreset.opacity,
    strokeWidth: closed ? zonePreset.weight : linePreset.weight,
    dashStyle: closed ? zonePreset.dashStyle : linePreset.dashStyle,
    arrowStart: false,
    arrowEnd: false,
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

function createTextElement(point: DroMapDrawnMarkerPoint, preset: TextPreset) {
  return {
    id: createElementId(),
    type: "text" as const,
    x: clamp(point.x - 90, 0, CUSTOM_MARKER_CANVAS_SIZE - 180),
    y: clamp(point.y - 35, 0, CUSTOM_MARKER_CANVAS_SIZE - 70),
    width: 180,
    height: 70,
    rotation: 0,
    text: "Texte",
    fontSize: preset.fontSize,
    color: preset.color,
    opacity: preset.opacity,
    backgroundEnabled: preset.backgroundEnabled,
    backgroundColor: preset.backgroundColor,
    backgroundOpacity: preset.backgroundOpacity,
    borderEnabled: preset.borderEnabled,
    borderColor: preset.borderColor,
    borderWidth: preset.borderWidth,
  } satisfies DroMapDrawnMarkerTextElement;
}

function getCanvasPoint(canvas: any, event: any): DroMapDrawnMarkerPoint {
  const point =
    event?.scenePoint ??
    (typeof canvas.getScenePoint === "function"
      ? canvas.getScenePoint(event?.e)
      : typeof canvas.getPointer === "function"
        ? canvas.getPointer(event?.e)
        : { x: 0, y: 0 });
  return clampPoint({ x: Number(point.x) || 0, y: Number(point.y) || 0 });
}

function getObjectId(object: any) {
  return (object as FabricObjectWithDroMapMeta).__dromapElementId ?? null;
}

function collectTransformObjects(target: any) {
  if (!target) return [];
  if (!getObjectId(target) && typeof target.getObjects === "function") {
    return target.getObjects().filter((object: any) => Boolean(getObjectId(object)));
  }
  return getObjectId(target) ? [target] : [];
}

export function CustomMarkerFabricCanvas({
  elements,
  activeTool,
  selectedElementId,
  linePreset,
  zonePreset,
  textPreset,
  onSelectElement,
  onCommitElements,
  onSwitchToSelect,
}: CustomMarkerFabricCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<any | null>(null);
  const fabricModuleRef = useRef<any | null>(null);
  const elementsRef = useRef(elements);
  const activeToolRef = useRef(activeTool);
  const linePresetRef = useRef(linePreset);
  const zonePresetRef = useRef(zonePreset);
  const textPresetRef = useRef(textPreset);
  const selectedElementIdRef = useRef(selectedElementId);
  const onSelectElementRef = useRef(onSelectElement);
  const onCommitElementsRef = useRef(onCommitElements);
  const onSwitchToSelectRef = useRef(onSwitchToSelect);
  const draftRef = useRef<Draft | null>(null);
  const skipNextElementsSyncRef = useRef(false);
  const syncTokenRef = useRef(0);

  elementsRef.current = elements;
  activeToolRef.current = activeTool;
  linePresetRef.current = linePreset;
  zonePresetRef.current = zonePreset;
  textPresetRef.current = textPreset;
  selectedElementIdRef.current = selectedElementId;
  onSelectElementRef.current = onSelectElement;
  onCommitElementsRef.current = onCommitElements;
  onSwitchToSelectRef.current = onSwitchToSelect;

  function configureHighQualityContexts(canvas: any) {
    for (const context of [canvas.contextContainer, canvas.contextTop]) {
      if (!context) continue;
      context.imageSmoothingEnabled = true;
      if ("imageSmoothingQuality" in context) {
        context.imageSmoothingQuality = "high";
      }
    }
  }

  function resizeCanvasToHost(canvas: any) {
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const displaySize = Math.max(1, Math.floor(Math.min(rect.width, rect.height)));
    const zoom = displaySize / CUSTOM_MARKER_CANVAS_SIZE;

    // Le modèle DroMap reste en 360×360 unités, mais Fabric rend à la vraie
    // taille CSS du panneau. Avec enableRetinaScaling, le backing store est
    // ensuite multiplié par le DPR de l'écran : aucune mise à l'échelle CSS
    // floue, même sur un canevas affiché à ~760 px ou sur écran Retina.
    canvas.setDimensions({ width: displaySize, height: displaySize });
    canvas.setViewportTransform([zoom, 0, 0, zoom, 0, 0]);
    canvas.calcOffset?.();
    configureHighQualityContexts(canvas);
    canvas.requestRenderAll();
  }

  function clearGuides(canvas: any) {
    const guides = canvas
      .getObjects()
      .filter((object: any) => (object as FabricObjectWithDroMapMeta).__dromapGuide);
    guides.forEach((guide: any) => canvas.remove(guide));
  }

  function addGuide(canvas: any, vertical: boolean, value: number) {
    const fabric = fabricModuleRef.current;
    if (!fabric) return;
    const guide = new fabric.Line(
      vertical
        ? [value, 0, value, CUSTOM_MARKER_CANVAS_SIZE]
        : [0, value, CUSTOM_MARKER_CANVAS_SIZE, value],
      {
        stroke: DROMAP_BLUE,
        strokeWidth: 1,
        strokeDashArray: [4, 4],
        opacity: 0.7,
        selectable: false,
        evented: false,
        excludeFromExport: true,
        objectCaching: false,
      },
    );
    (guide as FabricObjectWithDroMapMeta).__dromapGuide = true;
    canvas.add(guide);
    canvas.bringObjectToFront?.(guide);
  }

  function snapMovingObject(canvas: any, object: any) {
    clearGuides(canvas);
    const movingId = getObjectId(object);
    if (!movingId) return;
    const bounds = object.getBoundingRect();
    const xValues = [bounds.left, bounds.left + bounds.width / 2, bounds.left + bounds.width];
    const yValues = [bounds.top, bounds.top + bounds.height / 2, bounds.top + bounds.height];
    const targetsX = [0, CUSTOM_MARKER_CANVAS_SIZE / 2, CUSTOM_MARKER_CANVAS_SIZE];
    const targetsY = [0, CUSTOM_MARKER_CANVAS_SIZE / 2, CUSTOM_MARKER_CANVAS_SIZE];

    canvas.getObjects().forEach((candidate: any) => {
      const candidateId = getObjectId(candidate);
      if (!candidateId || candidateId === movingId) return;
      const box = candidate.getBoundingRect();
      targetsX.push(box.left, box.left + box.width / 2, box.left + box.width);
      targetsY.push(box.top, box.top + box.height / 2, box.top + box.height);
    });

    let bestX: { delta: number; target: number } | null = null;
    let bestY: { delta: number; target: number } | null = null;
    for (const value of xValues) {
      for (const target of targetsX) {
        const delta = target - value;
        if (Math.abs(delta) <= SNAP_DISTANCE && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) {
          bestX = { delta, target };
        }
      }
    }
    for (const value of yValues) {
      for (const target of targetsY) {
        const delta = target - value;
        if (Math.abs(delta) <= SNAP_DISTANCE && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) {
          bestY = { delta, target };
        }
      }
    }

    if (bestX) {
      object.left += bestX.delta;
      addGuide(canvas, true, bestX.target);
    }
    if (bestY) {
      object.top += bestY.delta;
      addGuide(canvas, false, bestY.target);
    }
    object.setCoords?.();
  }

  function updateObjectMode(canvas: any) {
    const selectMode = activeToolRef.current === "select";
    canvas.selection = selectMode;
    canvas.defaultCursor = selectMode ? "default" : activeToolRef.current === "text" ? "text" : "crosshair";
    canvas.hoverCursor = selectMode ? "move" : canvas.defaultCursor;
    canvas.getObjects().forEach((object: any) => {
      if ((object as FabricObjectWithDroMapMeta).__dromapGuide) return;
      object.selectable = selectMode;
      object.evented = selectMode;
    });
    if (!selectMode) {
      canvas.discardActiveObject();
      onSelectElementRef.current(null);
    }
    canvas.requestRenderAll();
  }

  function rebuildCanvas() {
    const canvas = fabricCanvasRef.current;
    const fabric = fabricModuleRef.current;
    if (!canvas || !fabric) return;
    const token = ++syncTokenRef.current;
    const currentSelection = selectedElementIdRef.current;
    canvas.discardActiveObject();
    canvas.getObjects().forEach((object: any) => canvas.remove(object));

    const objects = elementsRef.current.map((element) => createFabricObject(fabric, element));
    if (token !== syncTokenRef.current) return;
    objects.forEach((object) => canvas.add(object));
    updateObjectMode(canvas);

    if (activeToolRef.current === "select" && currentSelection) {
      const selected = objects.find((object) => getObjectId(object) === currentSelection);
      if (selected) canvas.setActiveObject(selected);
    }
    canvas.requestRenderAll();
  }

  function commitFabricTransform(target: any) {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    clearGuides(canvas);
    const transformedObjects = collectTransformObjects(target);
    if (transformedObjects.length === 0) return;
    const transformedById = new Map<string, DroMapDrawnMarkerElement>();

    for (const object of transformedObjects) {
      const meta = object as FabricObjectWithDroMapMeta;
      const id = meta.__dromapElementId;
      const base = meta.__dromapBaseElement;
      const initial = meta.__dromapInitialMatrix as Matrix | undefined;
      if (!id || !base || !initial) continue;
      object.setCoords?.();
      const current = [...object.calcTransformMatrix()] as Matrix;
      const nextElement = applyFabricTransform(base, initial, current);
      transformedById.set(id, nextElement);
      meta.__dromapBaseElement = cloneElement(nextElement);
      meta.__dromapInitialMatrix = current;
      object.scaleX = 1;
      object.scaleY = 1;
    }

    if (transformedById.size === 0) return;
    const next = elementsRef.current.map((element) =>
      transformedById.get(element.id) ?? element,
    );
    elementsRef.current = next;
    skipNextElementsSyncRef.current = true;
    onCommitElementsRef.current(next, "fabric-transform");
    canvas.requestRenderAll();
  }

  function removeDraftPreview(canvas: any) {
    const draft = draftRef.current;
    if (draft?.preview) canvas.remove(draft.preview);
  }

  function makeSimplePreview(
    canvas: any,
    start: DroMapDrawnMarkerPoint,
    end: DroMapDrawnMarkerPoint,
    tool: Extract<Draft, { kind: "drag" }>["tool"],
  ) {
    const fabric = fabricModuleRef.current;
    if (!fabric) return null;
    const bounds = normalizeShapeBounds(start, end, tool === "circle");
    const previewElement = createShapeElement(tool, start, end, zonePresetRef.current);
    const preview = makeShapeObject(fabric, previewElement);
    preview.set({
      selectable: false,
      evented: false,
      opacity: 0.72,
      excludeFromExport: true,
    });
    if (bounds.width < MIN_ELEMENT_SIZE || bounds.height < MIN_ELEMENT_SIZE) return null;
    canvas.add(preview);
    return preview;
  }

  function updatePolylinePreview(canvas: any, draft: Extract<Draft, { kind: "polyline" }>) {
    const fabric = fabricModuleRef.current;
    if (!fabric) return;
    if (draft.preview) canvas.remove(draft.preview);
    const points = draft.pointer ? [...draft.points, draft.pointer] : draft.points;
    if (points.length < 2) return;
    const closed = draft.tool === "polygon";
    const preview = closed
      ? new fabric.Polygon(points, {
          fill: zonePresetRef.current.fillEnabled
            ? zonePresetRef.current.fillColor
            : "rgba(37,99,235,0.04)",
          opacity: zonePresetRef.current.fillEnabled
            ? zonePresetRef.current.fillOpacity
            : 1,
          stroke: zonePresetRef.current.color,
          strokeWidth: zonePresetRef.current.weight,
          strokeDashArray: dashArray(zonePresetRef.current.dashStyle, zonePresetRef.current.weight),
          strokeUniform: true,
          selectable: false,
          evented: false,
          objectCaching: false,
        })
      : new fabric.Polyline(points, {
          fill: undefined,
          stroke: linePresetRef.current.color,
          strokeWidth: linePresetRef.current.weight,
          strokeDashArray: dashArray(linePresetRef.current.dashStyle, linePresetRef.current.weight),
          strokeUniform: true,
          selectable: false,
          evented: false,
          objectCaching: false,
        });
    preview.set({ opacity: 0.76, excludeFromExport: true });
    canvas.add(preview);
    draft.preview = preview;
    canvas.requestRenderAll();
  }

  function finishPolylineDraft() {
    const canvas = fabricCanvasRef.current;
    const draft = draftRef.current;
    if (!canvas || !draft || draft.kind !== "polyline") return;
    if (draft.preview) canvas.remove(draft.preview);
    const minimum = draft.tool === "polygon" ? 3 : 2;
    if (draft.points.length >= minimum) {
      const element = createPathElement(
        draft.tool,
        draft.points,
        linePresetRef.current,
        zonePresetRef.current,
      );
      onCommitElementsRef.current([...elementsRef.current, element]);
    }
    draftRef.current = null;
    canvas.requestRenderAll();
  }

  useEffect(() => {
    let cancelled = false;
    let localCanvas: any | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let windowResizeHandler: (() => void) | null = null;

    void (async () => {
      if (!canvasElementRef.current) return;
      const fabric = await import("fabric");
      if (cancelled || !canvasElementRef.current) return;
      fabricModuleRef.current = fabric;
      const canvas = new fabric.Canvas(canvasElementRef.current, {
        width: CUSTOM_MARKER_CANVAS_SIZE,
        height: CUSTOM_MARKER_CANVAS_SIZE,
        preserveObjectStacking: true,
        selection: true,
        selectionColor: "rgba(37,99,235,0.08)",
        selectionBorderColor: DROMAP_BLUE,
        selectionLineWidth: 1,
        fireRightClick: false,
        stopContextMenu: true,
        enableRetinaScaling: true,
      });
      localCanvas = canvas;
      fabricCanvasRef.current = canvas;

      canvas.wrapperEl.style.position = "absolute";
      canvas.wrapperEl.style.inset = "0 auto auto 0";
      canvas.upperCanvasEl.style.touchAction = "none";

      const syncDisplayResolution = () => resizeCanvasToHost(canvas);
      syncDisplayResolution();
      if (typeof ResizeObserver !== "undefined" && hostRef.current) {
        resizeObserver = new ResizeObserver(syncDisplayResolution);
        resizeObserver.observe(hostRef.current);
      } else {
        windowResizeHandler = syncDisplayResolution;
        window.addEventListener("resize", windowResizeHandler);
      }

      canvas.on("selection:created", (event: any) => {
        const selected = event.selected ?? canvas.getActiveObjects();
        onSelectElementRef.current(selected.length === 1 ? getObjectId(selected[0]) : null);
      });
      canvas.on("selection:updated", (event: any) => {
        const selected = event.selected ?? canvas.getActiveObjects();
        onSelectElementRef.current(selected.length === 1 ? getObjectId(selected[0]) : null);
      });
      canvas.on("selection:cleared", () => onSelectElementRef.current(null));
      canvas.on("object:moving", (event: any) => snapMovingObject(canvas, event.target));
      canvas.on("object:scaling", (event: any) => {
        const target = event.target;
        const object = collectTransformObjects(target)[0];
        const element = object
          ? (object as FabricObjectWithDroMapMeta).__dromapBaseElement
          : null;
        if (
          target &&
          element &&
          (element.type === "text" ||
            (element.type === "shape" && element.shape === "circle"))
        ) {
          const scale = Math.max(Math.abs(target.scaleX ?? 1), Math.abs(target.scaleY ?? 1));
          target.scaleX = Math.sign(target.scaleX || 1) * scale;
          target.scaleY = Math.sign(target.scaleY || 1) * scale;
        }
      });
      canvas.on("object:modified", (event: any) => commitFabricTransform(event.target));

      canvas.on("mouse:down", (event: any) => {
        const tool = activeToolRef.current;
        if (tool === "select") return;
        if (event.target) return;
        const raw = getCanvasPoint(canvas, event);
        const point = snapPoint(raw, elementsRef.current);

        if (tool === "text") {
          const element = createTextElement(point, textPresetRef.current);
          onCommitElementsRef.current([...elementsRef.current, element]);
          onSelectElementRef.current(element.id);
          onSwitchToSelectRef.current();
          return;
        }

        if (tool === "line" || tool === "arrow" || tool === "polygon") {
          const current = draftRef.current;
          if (current?.kind === "polyline" && current.tool === tool) {
            if (
              tool === "polygon" &&
              current.points.length >= 3 &&
              distance(point, current.points[0]) <= SNAP_DISTANCE * 1.8
            ) {
              finishPolylineDraft();
              return;
            }
            current.points = [...current.points, point];
            current.pointer = point;
            updatePolylinePreview(canvas, current);
          } else {
            draftRef.current = {
              kind: "polyline",
              tool,
              points: [point],
              preview: null,
              pointer: point,
            };
          }
          return;
        }

        if (tool === "freehand-line" || tool === "freehand-zone") {
          draftRef.current = {
            kind: "freehand",
            closed: tool === "freehand-zone",
            points: [point],
            preview: null,
          };
          return;
        }

        draftRef.current = {
          kind: "drag",
          tool,
          start: point,
          preview: null,
        };
      });

      canvas.on("mouse:move", (event: any) => {
        const draft = draftRef.current;
        if (!draft || activeToolRef.current === "select") return;
        const raw = getCanvasPoint(canvas, event);
        const point = snapPoint(raw, elementsRef.current);

        if (draft.kind === "polyline") {
          draft.pointer = point;
          updatePolylinePreview(canvas, draft);
          return;
        }

        if (draft.kind === "drag") {
          if (draft.preview) canvas.remove(draft.preview);
          draft.preview = makeSimplePreview(canvas, draft.start, point, draft.tool);
          canvas.requestRenderAll();
          return;
        }

        const lastPoint = draft.points[draft.points.length - 1];
        if (distance(lastPoint, point) < 2.5) return;
        draft.points = [...draft.points, point];
        if (draft.preview) canvas.remove(draft.preview);
        const fabricNow = fabricModuleRef.current;
        if (!fabricNow) return;
        const smoothing = draft.closed
          ? zonePresetRef.current.smoothing
          : linePresetRef.current.smoothing;
        const display = smoothPath(draft.points, smoothing, draft.closed);
        draft.preview = draft.closed
          ? new fabricNow.Polygon(display, {
              fill: zonePresetRef.current.fillEnabled
                ? zonePresetRef.current.fillColor
                : "rgba(37,99,235,0.04)",
              opacity: zonePresetRef.current.fillEnabled
                ? zonePresetRef.current.fillOpacity
                : 1,
              stroke: zonePresetRef.current.color,
              strokeWidth: zonePresetRef.current.weight,
              strokeUniform: true,
              selectable: false,
              evented: false,
              objectCaching: false,
            })
          : new fabricNow.Polyline(display, {
              fill: undefined,
              stroke: linePresetRef.current.color,
              strokeWidth: linePresetRef.current.weight,
              strokeUniform: true,
              selectable: false,
              evented: false,
              objectCaching: false,
            });
        draft.preview.set({ opacity: 0.74, excludeFromExport: true });
        canvas.add(draft.preview);
        canvas.requestRenderAll();
      });

      canvas.on("mouse:up", (event: any) => {
        const draft = draftRef.current;
        if (!draft || draft.kind === "polyline") return;
        const raw = getCanvasPoint(canvas, event);
        const point = snapPoint(raw, elementsRef.current);
        removeDraftPreview(canvas);

        if (draft.kind === "drag") {
          const bounds = normalizeShapeBounds(draft.start, point, draft.tool === "circle");
          if (bounds.width >= MIN_ELEMENT_SIZE && bounds.height >= MIN_ELEMENT_SIZE) {
            const element = createShapeElement(
              draft.tool,
              draft.start,
              point,
              zonePresetRef.current,
            );
            onCommitElementsRef.current([...elementsRef.current, element]);
          }
        } else if (draft.points.length >= 2 && distance(draft.points[0], draft.points[draft.points.length - 1]) >= MIN_ELEMENT_SIZE) {
          const element = createFreehandElement(
            draft.closed,
            draft.points,
            linePresetRef.current,
            zonePresetRef.current,
          );
          onCommitElementsRef.current([...elementsRef.current, element]);
        }
        draftRef.current = null;
        canvas.requestRenderAll();
      });

      canvas.on("mouse:dblclick", () => {
        if (draftRef.current?.kind === "polyline") finishPolylineDraft();
      });

      rebuildCanvas();
    })();

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (isEditing) return;
      if (event.key === "Enter" && draftRef.current?.kind === "polyline") {
        event.preventDefault();
        finishPolylineDraft();
      }
      if (event.key === "Escape" && draftRef.current) {
        event.preventDefault();
        const canvas = fabricCanvasRef.current;
        if (canvas) removeDraftPreview(canvas);
        draftRef.current = null;
        canvas?.requestRenderAll();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKeyDown);
      resizeObserver?.disconnect();
      if (windowResizeHandler) {
        window.removeEventListener("resize", windowResizeHandler);
      }
      if (localCanvas) {
        localCanvas.dispose();
      }
      if (fabricCanvasRef.current === localCanvas) fabricCanvasRef.current = null;
      fabricModuleRef.current = null;
    };
    // Fabric doit être créé une seule fois ; les props passent par des refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!fabricCanvasRef.current || !fabricModuleRef.current) return;
    if (skipNextElementsSyncRef.current) {
      skipNextElementsSyncRef.current = false;
      return;
    }
    rebuildCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    updateObjectMode(canvas);
    if (activeTool === "select" && selectedElementId) {
      const object = canvas
        .getObjects()
        .find((candidate: any) => getObjectId(candidate) === selectedElementId);
      if (object) canvas.setActiveObject(object);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, selectedElementId]);

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 overflow-hidden"
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
      <canvas ref={canvasElementRef} aria-label="Zone de dessin du marqueur" />
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-slate-200/90 bg-white/90 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 shadow-sm backdrop-blur">
        Maj + clic : sélection multiple · poignées : taille et rotation
      </div>
    </div>
  );
}
