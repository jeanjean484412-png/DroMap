"use client";

import { getMarkerTextFontFamily as getDromapRuntimeFontFamily } from "./custom-marker-font";
import { getBuiltinMarkerCompositionSvg } from "./marker-symbol";
import {
  createCurvedMarkerPoints,
  getMarkerPathHandles,
  markerArrowHeadLength,
  trimMarkerLineForArrowheads,
  updateMarkerPathHandle,
} from "./custom-marker-line-geometry";

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

export type DesignerTool =
  | "select"
  | "line"
  | "curved-line"
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
  selectedElementIds: string[];
  linePreset: LinePreset;
  zonePreset: ZonePreset;
  textPreset: TextPreset;
  onSelectElements: (elementIds: string[]) => void;
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
  __dromapLineHandle?: boolean;
  __dromapLineHandleParentId?: string;
  __dromapLineHandlePointIndex?: number;
  __dromapPendingElement?: DroMapDrawnMarkerElement;
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
      tool: "line" | "curved-line" | "arrow" | "polygon";
      points: DroMapDrawnMarkerPoint[];
      preview: any | null;
      pointer: DroMapDrawnMarkerPoint | null;
    };

const MIN_ELEMENT_SIZE = 8;
const SNAP_DISTANCE = 4;
const DROMAP_BLUE = "#168c88";

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

function getLineAngles(elements: DroMapDrawnMarkerElement[]) {
  const angles: number[] = [0, Math.PI / 2];
  for (const element of elements) {
    const points =
      element.type === "line" || element.type === "arrow"
        ? [
            { x: element.x1, y: element.y1 },
            { x: element.x2, y: element.y2 },
          ]
        : element.type === "path" && !element.closed
          ? element.lineVariant === "curved"
            ? []
            : element.points
          : [];
    for (let index = 0; index < points.length - 1; index += 1) {
      const dx = points[index + 1].x - points[index].x;
      const dy = points[index + 1].y - points[index].y;
      if (Math.hypot(dx, dy) > 1) angles.push(Math.atan2(dy, dx));
    }
  }
  return angles;
}

function snapLinePoint(
  point: DroMapDrawnMarkerPoint,
  start: DroMapDrawnMarkerPoint,
  elements: DroMapDrawnMarkerElement[],
  ignoredElementIds: string[] = [],
) {
  const anchorSnapped = snapPoint(point, elements, ignoredElementIds);
  if (distance(anchorSnapped, point) > 0.01) return anchorSnapped;
  const length = distance(start, point);
  if (length < 2) return anchorSnapped;
  const pointerAngle = Math.atan2(point.y - start.y, point.x - start.x);
  let best = point;
  let bestAngularDistance = (8 * Math.PI) / 180;
  for (const baseAngle of getLineAngles(
    elements.filter((element) => !ignoredElementIds.includes(element.id)),
  )) {
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
        best = {
          x: start.x + Math.cos(candidateAngle) * length,
          y: start.y + Math.sin(candidateAngle) * length,
        };
      }
    }
  }
  return snapPoint(clampPoint(best), elements, ignoredElementIds);
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
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
    };
  }

  if (element.type === "path") {
    return {
      ...element,
      points: element.points.map((point) => transformPoint(delta, point)),
      rawPoints: element.rawPoints?.map((point) =>
        transformPoint(delta, point),
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
      x: nextCenter.x - width / 2,
      y: nextCenter.y - height / 2,
      width,
      height,
      rotation,
      fontSize: clamp(element.fontSize * scale, 10, 1200),
    };
  }

  return {
    ...element,
    x: nextCenter.x - width / 2,
    y: nextCenter.y - height / 2,
    width,
    height,
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
    cornerSize: 10,
    touchCornerSize: 20,
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
  if (
    element.type === "line" ||
    element.type === "arrow" ||
    (element.type === "path" && !element.closed)
  ) {
    object.set({
      hasControls: false,
      hasBorders: false,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
    });
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
    rx: element.cornerRadius ?? Math.min(18, element.width / 8, element.height / 8),
    ry: element.cornerRadius ?? Math.min(18, element.width / 8, element.height / 8),
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
  const headLength = markerArrowHeadLength(strokeWidth);
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
  const shaft = trimMarkerLineForArrowheads(
    [start, end],
    element.strokeWidth,
    element.arrowStart === true,
    element.arrowEnd === true || element.type === "arrow",
  );
  const layers: any[] = [
    new fabric.Line([shaft[0].x, shaft[0].y, shaft[1].x, shaft[1].y], {
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
  const shaftPoints = trimMarkerLineForArrowheads(
    points,
    element.strokeWidth,
    element.arrowStart === true,
    element.arrowEnd === true,
  );
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
      makePathShape(fabric, element.closed ? points : shaftPoints, element.closed, {
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
  if (!element.backgroundEnabled && !element.borderEnabled) {
    return new fabric.IText(element.text, {
      left: element.x + element.width / 2, top: element.y + element.height / 2,
      originX: "center", originY: "center", width: element.width,
      fontFamily: getDromapRuntimeFontFamily(), fontSize: element.fontSize,
      fontWeight: element.fontWeight ?? 700, textAlign: element.textAlign ?? "center",
      fill: element.color, opacity: element.opacity ?? 1, angle: element.rotation,
      lineHeight: 1.16, objectCaching: false,
    });
  }
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
      fontWeight: element.fontWeight ?? 700,
      textAlign: element.textAlign ?? "center",
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

async function createFabricObject(fabric: any, element: DroMapDrawnMarkerElement) {
  let symbol = null;
  if (element.type === "shape" && element.symbolId) {
    const loaded = await fabric.loadSVGFromString(getBuiltinMarkerCompositionSvg(element.symbolId, element.fillColor));
    const bounds = new fabric.Rect({ left: 0, top: 0, width: 24, height: 24, originX: "left", originY: "top", fill: "transparent", strokeWidth: 0 });
    symbol = new fabric.Group([bounds, ...loaded.objects.filter(Boolean)], { objectCaching: false });
    symbol.set({ originX: "center", originY: "center", left: element.x + element.width / 2, top: element.y + element.height / 2, scaleX: element.width / 24, scaleY: element.height / 24, angle: element.rotation, opacity: element.fillOpacity ?? 1 });
  }
  const object = symbol ?? (
    element.type === "shape"
      ? makeShapeObject(fabric, element)
      : element.type === "path"
        ? makePathObject(fabric, element)
        : element.type === "text"
          ? makeTextObject(fabric, element)
          : makeLineObject(fabric, element));

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
    "select" | "text" | "line" | "curved-line" | "arrow" | "freehand-line" | "freehand-zone" | "polygon"
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
  tool: "line" | "curved-line" | "arrow" | "polygon",
  points: DroMapDrawnMarkerPoint[],
  linePreset: LinePreset,
  zonePreset: ZonePreset,
): DroMapDrawnMarkerPathElement {
  const closed = tool === "polygon";
  const rawPoints =
    tool === "curved-line" && points.length === 2
      ? [
          { ...points[0] },
          {
            x: (points[0].x + points[1].x) / 2,
            y: (points[0].y + points[1].y) / 2,
          },
          { ...points[1] },
        ]
      : points.map((point) => ({ ...point }));
  const renderedPoints =
    tool === "curved-line"
      ? createCurvedMarkerPoints(rawPoints)
      : rawPoints;
  return {
    strokeScales: true,
    id: createElementId(),
    type: "path",
    points: renderedPoints,
    rawPoints,
    smoothing: 0,
    lineVariant: tool === "curved-line" ? "curved" : "straight",
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
    strokeScales: true,
    id: createElementId(),
    type: "path",
    points,
    rawPoints,
    smoothing,
    lineVariant: "freehand",
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
    return target.getObjects().flatMap(collectTransformObjects);
  }
  return getObjectId(target) ? [target] : [];
}

export function CustomMarkerFabricCanvas({
  elements,
  activeTool,
  selectedElementIds,
  linePreset,
  zonePreset,
  textPreset,
  onSelectElements,
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
  const selectedElementIdsRef = useRef(selectedElementIds);
  const onSelectElementsRef = useRef(onSelectElements);
  const onCommitElementsRef = useRef(onCommitElements);
  const onSwitchToSelectRef = useRef(onSwitchToSelect);
  const draftRef = useRef<Draft | null>(null);
  const skipNextElementsSyncRef = useRef(false);
  const syncTokenRef = useRef(0);
  const rebuildingRef = useRef(false);

  elementsRef.current = elements;
  activeToolRef.current = activeTool;
  linePresetRef.current = linePreset;
  zonePresetRef.current = zonePreset;
  textPresetRef.current = textPreset;
  selectedElementIdsRef.current = selectedElementIds;
  onSelectElementsRef.current = onSelectElements;
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

  function clearLineHandles(canvas: any) {
    canvas
      .getObjects()
      .filter(
        (object: any) =>
          (object as FabricObjectWithDroMapMeta).__dromapLineHandle,
      )
      .forEach((handle: any) => canvas.remove(handle));
  }

  function lineHandlePoints(element: DroMapDrawnMarkerElement) {
    if (element.type === "line" || element.type === "arrow") {
      return [
        { x: element.x1, y: element.y1 },
        { x: element.x2, y: element.y2 },
      ];
    }
    if (
      element.type === "path" &&
      !element.closed &&
      element.lineVariant !== "freehand"
    ) {
      const handles = getMarkerPathHandles(element);
      return element.lineVariant === "curved"
        ? handles
        : [handles[0], handles[handles.length - 1]];
    }
    return [];
  }

  function refreshLineHandles(canvas: any) {
    clearLineHandles(canvas);
    if (
      activeToolRef.current !== "select" ||
      selectedElementIdsRef.current.length !== 1
    )
      return;
    const id = selectedElementIdsRef.current[0];
    const element = elementsRef.current.find((item) => item.id === id);
    if (!element || element.groupId) return;
    const points = lineHandlePoints(element);
    const fabric = fabricModuleRef.current;
    if (!fabric || points.length < 2) return;
    points.forEach((point, pointIndex) => {
      const internal = pointIndex > 0 && pointIndex < points.length - 1;
      const handle = new fabric.Circle({
        left: point.x,
        top: point.y,
        originX: "center",
        originY: "center",
        radius: internal ? 4.6 : 5,
        fill: internal ? "#168c88" : "#2563eb",
        stroke: "#ffffff",
        strokeWidth: 2,
        strokeUniform: true,
        hasControls: false,
        hasBorders: false,
        selectable: true,
        evented: true,
        hoverCursor: "grab",
        moveCursor: "grabbing",
        excludeFromExport: true,
        objectCaching: false,
      });
      const meta = handle as FabricObjectWithDroMapMeta;
      meta.__dromapLineHandle = true;
      meta.__dromapLineHandleParentId = id;
      meta.__dromapLineHandlePointIndex = pointIndex;
      canvas.add(handle);
      canvas.bringObjectToFront?.(handle);
    });
  }

  function createLineVisual(element: DroMapDrawnMarkerElement) {
    const fabric = fabricModuleRef.current;
    if (!fabric) return null;
    const object =
      element.type === "path"
        ? makePathObject(fabric, element)
        : element.type === "line" || element.type === "arrow"
          ? makeLineObject(fabric, element)
          : null;
    if (!object) return null;
    configureInteractiveObject(object, element);
    const meta = object as FabricObjectWithDroMapMeta;
    meta.__dromapElementId = element.id;
    meta.__dromapBaseElement = cloneElement(element);
    object.setCoords?.();
    meta.__dromapInitialMatrix = [...object.calcTransformMatrix()] as Matrix;
    return object;
  }

  function replaceLineVisual(canvas: any, element: DroMapDrawnMarkerElement) {
    const previous = canvas
      .getObjects()
      .find(
        (object: any) =>
          !(object as FabricObjectWithDroMapMeta).__dromapLineHandle &&
          getObjectId(object) === element.id,
      );
    const replacement = createLineVisual(element);
    if (!replacement) return;
    const index = previous ? canvas.getObjects().indexOf(previous) : -1;
    if (previous) canvas.remove(previous);
    canvas.add(replacement);
    if (index >= 0) canvas.moveObjectTo?.(replacement, index);
    canvas
      .getObjects()
      .filter(
        (object: any) =>
          (object as FabricObjectWithDroMapMeta).__dromapLineHandle,
      )
      .forEach((handle: any) => canvas.bringObjectToFront?.(handle));
  }

  function previewLineHandleMove(canvas: any, handle: any) {
    const meta = handle as FabricObjectWithDroMapMeta;
    const parentId = meta.__dromapLineHandleParentId;
    const pointIndex = meta.__dromapLineHandlePointIndex;
    if (!parentId || pointIndex === undefined) return;
    const current =
      meta.__dromapPendingElement ??
      elementsRef.current.find((element) => element.id === parentId);
    if (!current) return;
    const controlPoints = lineHandlePoints(current);
    const raw = clampPoint({ x: handle.left ?? 0, y: handle.top ?? 0 });
    const opposite =
      pointIndex === 0
        ? controlPoints[controlPoints.length - 1]
        : controlPoints[0];
    const point =
      current.type === "path" && current.lineVariant === "curved" &&
      pointIndex > 0 && pointIndex < controlPoints.length - 1
        ? snapPoint(raw, elementsRef.current, [parentId])
        : snapLinePoint(raw, opposite, elementsRef.current, [parentId]);
    handle.set({ left: point.x, top: point.y });
    handle.setCoords?.();
    let next: DroMapDrawnMarkerElement = current;
    if (current.type === "line" || current.type === "arrow") {
      next = pointIndex === 0
        ? { ...current, x1: point.x, y1: point.y }
        : { ...current, x2: point.x, y2: point.y };
    } else if (current.type === "path") {
      const actualIndex =
        current.lineVariant === "curved"
          ? pointIndex
          : pointIndex === 0
            ? 0
            : getMarkerPathHandles(current).length - 1;
      next = updateMarkerPathHandle(current, actualIndex, point);
    }
    meta.__dromapPendingElement = next;
    replaceLineVisual(canvas, next);
    canvas.requestRenderAll();
  }

  function syncLineHandlesToMovingObject(canvas: any, object: any) {
    const id = getObjectId(object);
    const meta = object as FabricObjectWithDroMapMeta;
    if (!id || !meta.__dromapBaseElement || !meta.__dromapInitialMatrix) return;
    const preview = applyFabricTransform(
      meta.__dromapBaseElement,
      meta.__dromapInitialMatrix as Matrix,
      [...object.calcTransformMatrix()] as Matrix,
    );
    const points = lineHandlePoints(preview);
    canvas
      .getObjects()
      .filter(
        (candidate: any) =>
          (candidate as FabricObjectWithDroMapMeta).__dromapLineHandleParentId === id,
      )
      .forEach((handle: any) => {
        const pointIndex = (handle as FabricObjectWithDroMapMeta)
          .__dromapLineHandlePointIndex ?? 0;
        const point = points[pointIndex];
        if (point) {
          handle.set({ left: point.x, top: point.y });
          handle.setCoords?.();
          canvas.bringObjectToFront?.(handle);
        }
      });
  }

  function commitLineHandle(handle: any) {
    const meta = handle as FabricObjectWithDroMapMeta;
    const nextElement = meta.__dromapPendingElement;
    if (!nextElement) return;
    const next = elementsRef.current.map((element) =>
      element.id === nextElement.id ? nextElement : element,
    );
    elementsRef.current = next;
    onCommitElementsRef.current(next);
    onSelectElementsRef.current([nextElement.id]);
    meta.__dromapPendingElement = undefined;
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
    const movingIds = collectTransformObjects(object).map((o: any) => getObjectId(o));
    if (!movingIds.length) return;
    const bounds = object.getBoundingRect();
    const xValues = [bounds.left, bounds.left + bounds.width / 2, bounds.left + bounds.width];
    const yValues = [bounds.top, bounds.top + bounds.height / 2, bounds.top + bounds.height];
    const targetsX = [0, CUSTOM_MARKER_CANVAS_SIZE / 2, CUSTOM_MARKER_CANVAS_SIZE];
    const targetsY = [0, CUSTOM_MARKER_CANVAS_SIZE / 2, CUSTOM_MARKER_CANVAS_SIZE];

    canvas.getObjects().forEach((candidate: any) => {
      const candidateId = getObjectId(candidate);
      if (candidate === object || collectTransformObjects(candidate).some((o: any) => movingIds.includes(getObjectId(o)))) return;
      if (!candidateId && !collectTransformObjects(candidate).length) return;
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
      if (selectedElementIdsRef.current.length) onSelectElementsRef.current([]);
    }
    canvas.requestRenderAll();
  }

  async function rebuildCanvas() {
    const canvas = fabricCanvasRef.current;
    const fabric = fabricModuleRef.current;
    if (!canvas || !fabric) return;
    const token = ++syncTokenRef.current;
    rebuildingRef.current = true;
    const objects = await Promise.all(elementsRef.current.map((element) => createFabricObject(fabric, element)));
    if (token !== syncTokenRef.current || fabricCanvasRef.current !== canvas) return;
    objects.forEach(object => {
      if (object.__dromapBaseElement?.type === "text" && object.enterEditing) {
        // Fabric positions its textarea in page coordinates; keep it on body to avoid
        // scrolling the clipped canvas when the browser focuses the caret.
        object.on("editing:entered", () => object.hiddenTextarea?.addEventListener("keydown", (event: KeyboardEvent) => event.stopPropagation()));
      }
    });
    canvas.discardActiveObject();
    canvas.getObjects().forEach((object: any) => canvas.remove(object));
    const grouped = new Set<string>();
    const topObjects = objects.flatMap(object => {
      const groupId = object.__dromapBaseElement?.groupId;
      if (!groupId) return [object];
      if (grouped.has(groupId)) return [];
      grouped.add(groupId);
      const group = new fabric.Group(objects.filter(o => o.__dromapBaseElement?.groupId === groupId), { subTargetCheck: false, objectCaching: false });
      configureInteractiveObject(group, object.__dromapBaseElement);
      group.set({
        hasControls: true,
        hasBorders: true,
        lockScalingX: false,
        lockScalingY: false,
        lockRotation: false,
      });
      return [group];
    });
    topObjects.forEach((object) => canvas.add(object));
    updateObjectMode(canvas);
    syncSelection();
    rebuildingRef.current = false;
    canvas.requestRenderAll();
  }

  function syncSelection() {
    const canvas = fabricCanvasRef.current, fabric = fabricModuleRef.current;
    if (!canvas || !fabric || activeToolRef.current !== "select") return;
    const wanted = selectedElementIdsRef.current;
    const active = canvas.getActiveObject() as FabricObjectWithDroMapMeta | null;
    const actual = active?.__dromapLineHandleParentId
      ? [active.__dromapLineHandleParentId]
      : collectTransformObjects(active).map((o: any) => getObjectId(o));
    if (actual.length === wanted.length && actual.every((id: string) => wanted.includes(id))) {
      refreshLineHandles(canvas);
      return;
    }
    const busy = rebuildingRef.current; rebuildingRef.current = true;
    canvas.discardActiveObject();
    const selected = canvas.getObjects().filter((o: any) => collectTransformObjects(o).some((child: any) => { const id = getObjectId(child); return id !== null && wanted.includes(id); }));
    if (selected.length === 1) canvas.setActiveObject(selected[0]);
    else if (selected.length > 1) canvas.setActiveObject(new fabric.ActiveSelection(selected, { canvas }));
    refreshLineHandles(canvas);
    rebuildingRef.current = busy;
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
    }

    if (transformedById.size === 0) return;
    const next = elementsRef.current.map((element) =>
      transformedById.get(element.id) ?? element,
    );
    elementsRef.current = next;
    // Only object:modified commits: one completed gesture = one undo entry.
    onCommitElementsRef.current(next);
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
    const rawPoints = draft.pointer ? [...draft.points, draft.pointer] : draft.points;
    const points = draft.tool === "curved-line" && rawPoints.length === 2
      ? createCurvedMarkerPoints([
          rawPoints[0],
          {
            x: (rawPoints[0].x + rawPoints[1].x) / 2,
            y: (rawPoints[0].y + rawPoints[1].y) / 2,
          },
          rawPoints[1],
        ])
      : rawPoints;
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
      onSelectElementsRef.current([element.id]);
      onSwitchToSelectRef.current();
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
        selectionKey: "shiftKey",
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

      const publishSelection = () => {
        if (rebuildingRef.current) return;
        const active = canvas.getActiveObject() as unknown as
          | FabricObjectWithDroMapMeta
          | null;
        if (
          active?.__dromapLineHandleParentId &&
          selectedElementIdsRef.current.length === 1 &&
          selectedElementIdsRef.current[0] === active.__dromapLineHandleParentId
        )
          return;
        const ids = active?.__dromapLineHandleParentId
          ? [active.__dromapLineHandleParentId]
          : collectTransformObjects(active).map((o: any) => getObjectId(o));
        if (
          ids.length === selectedElementIdsRef.current.length &&
          ids.every((id: string) => selectedElementIdsRef.current.includes(id))
        )
          return;
        onSelectElementsRef.current(ids);
      };
      canvas.on("selection:created", publishSelection);
      canvas.on("selection:updated", publishSelection);
      canvas.on("selection:cleared", publishSelection);
      canvas.on("text:changed", (event: any) => {
        const object = event.target;
        const base = object.__dromapBaseElement;
        if (base?.type !== "text") return;
        const nextElement = { ...base, text: object.text, width: object.width, height: object.height, x: object.left - object.width / 2, y: object.top - object.height / 2 };
        const next = elementsRef.current.map(e => e.id === base.id ? nextElement : e);
        object.__dromapBaseElement = nextElement;
        object.__dromapInitialMatrix = [...object.calcTransformMatrix()];
        elementsRef.current = next;
        skipNextElementsSyncRef.current = true;
        onCommitElementsRef.current(next, `text:${base.id}`);
      });
      canvas.on("object:moving", (event: any) => {
        const target = event.target as FabricObjectWithDroMapMeta;
        if (target?.__dromapLineHandle) {
          previewLineHandleMove(canvas, target);
          return;
        }
        snapMovingObject(canvas, target);
        syncLineHandlesToMovingObject(canvas, target);
      });
      canvas.on("object:scaling", (event: any) => {
        const target = event.target;
        const object = collectTransformObjects(target)[0];
        const element = object
          ? (object as FabricObjectWithDroMapMeta).__dromapBaseElement
          : null;
        if (
          target &&
          element &&
          (collectTransformObjects(target).length > 1 || element.type === "text" ||
            (element.type === "shape" && element.shape === "circle"))
        ) {
          const scale = Math.max(Math.abs(target.scaleX ?? 1), Math.abs(target.scaleY ?? 1));
          target.scaleX = Math.sign(target.scaleX || 1) * scale;
          target.scaleY = Math.sign(target.scaleY || 1) * scale;
        }
      });
      canvas.on("object:modified", (event: any) => {
        if ((event.target as FabricObjectWithDroMapMeta)?.__dromapLineHandle) {
          commitLineHandle(event.target);
          return;
        }
        commitFabricTransform(event.target);
      });

      canvas.on("mouse:down", (event: any) => {
        const tool = activeToolRef.current;
        if (tool === "select") return;
        if (event.target) return;
        const raw = getCanvasPoint(canvas, event);
        let point = snapPoint(raw, elementsRef.current);

        if (tool === "text") {
          const element = createTextElement(point, textPresetRef.current);
          onCommitElementsRef.current([...elementsRef.current, element]);
          onSelectElementsRef.current([element.id]);
          onSwitchToSelectRef.current();
          return;
        }

        if (tool === "line" || tool === "curved-line" || tool === "arrow" || tool === "polygon") {
          const current = draftRef.current;
          if (current?.kind === "polyline" && current.tool === tool) {
            if (tool !== "polygon") {
              point = snapLinePoint(
                raw,
                current.points[current.points.length - 1],
                elementsRef.current,
              );
            }
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
            if (tool === "line" || tool === "curved-line" || tool === "arrow") {
              finishPolylineDraft();
              return;
            }
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
        const point =
          draft.kind === "polyline" && draft.points.length > 0 && draft.tool !== "polygon"
            ? snapLinePoint(raw, draft.points[draft.points.length - 1], elementsRef.current)
            : snapPoint(raw, elementsRef.current);

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
            onSelectElementsRef.current([element.id]);
            onSwitchToSelectRef.current();
          }
        } else if (draft.points.length >= 2) {
          const element = createFreehandElement(
            draft.closed,
            draft.points,
            linePresetRef.current,
            zonePresetRef.current,
          );
          onCommitElementsRef.current([...elementsRef.current, element]);
          onSelectElementsRef.current([element.id]);
          onSwitchToSelectRef.current();
        }
        draftRef.current = null;
        canvas.requestRenderAll();
      });

      canvas.on("mouse:dblclick", (event: any) => {
        if (draftRef.current?.kind === "polyline") { finishPolylineDraft(); return; }
        const object = event.target;
        const lineElement = object?.__dromapBaseElement as
          | DroMapDrawnMarkerElement
          | undefined;
        if (
          activeToolRef.current === "select" &&
          lineElement?.type === "path" &&
          lineElement.lineVariant === "curved"
        ) {
          const pointer = getCanvasPoint(canvas, event);
          const handles = getMarkerPathHandles(lineElement);
          if (handles.length >= 32) return;
          let insertion = 1;
          let bestDistance = Number.POSITIVE_INFINITY;
          let insertedPoint = pointer;
          for (let index = 0; index < handles.length - 1; index += 1) {
            const start = handles[index];
            const end = handles[index + 1];
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const lengthSquared = dx * dx + dy * dy;
            if (lengthSquared === 0) continue;
            const ratio = Math.max(
              0,
              Math.min(
                1,
                ((pointer.x - start.x) * dx + (pointer.y - start.y) * dy) /
                  lengthSquared,
              ),
            );
            const projected = {
              x: start.x + dx * ratio,
              y: start.y + dy * ratio,
            };
            const candidateDistance = distance(pointer, projected);
            if (candidateDistance < bestDistance) {
              bestDistance = candidateDistance;
              insertion = index + 1;
              insertedPoint = pointer;
            }
          }
          const nextHandles = [...handles];
          nextHandles.splice(insertion, 0, insertedPoint);
          const nextElement = {
            ...lineElement,
            rawPoints: nextHandles,
            points: createCurvedMarkerPoints(nextHandles),
          };
          const next = elementsRef.current.map((element) =>
            element.id === nextElement.id ? nextElement : element,
          );
          elementsRef.current = next;
          onCommitElementsRef.current(next);
          onSelectElementsRef.current([nextElement.id]);
          return;
        }
        if (activeToolRef.current === "select" && object?.__dromapBaseElement?.type === "text" && object.enterEditing) {
          canvas.setActiveObject(object);
          object.enterEditing();
          object.hiddenTextarea?.focus();
          canvas.requestRenderAll();
        }
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
    if (activeTool === "select" && draftRef.current) {
      removeDraftPreview(canvas);
      draftRef.current = null;
    }
    updateObjectMode(canvas);
    syncSelection();
    // Fabric functions intentionally read the latest props through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, selectedElementIds]);

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
          "linear-gradient(45deg,#f7f9f8 25%,transparent 25%),linear-gradient(-45deg,#f7f9f8 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#f7f9f8 75%),linear-gradient(-45deg,transparent 75%,#f7f9f8 75%)",
        backgroundSize: "28px 28px",
        backgroundPosition: "0 0,0 14px,14px -14px,-14px 0px",
      }}
    >
      <canvas ref={canvasElementRef} aria-label="Zone de dessin du marqueur" />
    </div>
  );
}
