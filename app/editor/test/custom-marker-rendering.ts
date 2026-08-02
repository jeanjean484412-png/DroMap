import type { DroMapFeature } from "@/lib/dromap/feature";
import {
  CUSTOM_MARKER_CANVAS_SIZE,
  getCustomMarkerById,
  type DroMapCustomMarkerDefinition,
  type DroMapDrawnMarkerElement,
  type DroMapDrawnMarkerPathElement,
  type DroMapDrawnMarkerPoint,
  type DroMapDrawnMarkerShapeElement,
  type DroMapDrawnMarkerTextElement,
} from "@/stores/editor-test-custom-markers";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getStarPoints(
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
) {
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

function getShapeTransform(element: DroMapDrawnMarkerShapeElement) {
  if (!element.rotation) return "";
  return ` transform="rotate(${element.rotation} ${element.x + element.width / 2} ${element.y + element.height / 2})"`;
}

function getDashArray(
  style: "solid" | "dashed" | "dotted" | undefined,
  width: number,
) {
  if (style === "dashed")
    return `${Math.max(6, width * 4)} ${Math.max(4, width * 2.5)}`;
  if (style === "dotted") return `0 ${Math.max(5, width * 2.8)}`;
  return undefined;
}

function getElementPatternId(prefix: string, elementId: string) {
  return `${prefix}-${elementId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function renderShapePrimitive(
  element: DroMapDrawnMarkerShapeElement,
  attributes: string,
) {
  const transform = getShapeTransform(element);
  if (element.shape === "ellipse" || element.shape === "circle") {
    return `<ellipse cx="${element.x + element.width / 2}" cy="${element.y + element.height / 2}" rx="${element.width / 2}" ry="${element.height / 2}" ${attributes}${transform} />`;
  }
  if (element.shape === "triangle") {
    return `<polygon points="${getTrianglePoints(element)}" ${attributes}${transform} />`;
  }
  if (element.shape === "diamond") {
    return `<polygon points="${getDiamondPoints(element)}" ${attributes}${transform} />`;
  }
  if (element.shape === "star") {
    return `<polygon points="${getStarPoints(
      element.x + element.width / 2,
      element.y + element.height / 2,
      element.width / 2,
      element.height / 2,
    )}" ${attributes}${transform} />`;
  }
  return `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="${Math.min(18, element.width / 8, element.height / 8)}" ${attributes}${transform} />`;
}

function renderShapeElement(element: DroMapDrawnMarkerShapeElement) {
  const parts: string[] = [];
  if (element.fillEnabled) {
    parts.push(
      renderShapePrimitive(
        element,
        `fill="${escapeXml(element.fillColor)}" fill-opacity="${element.fillOpacity ?? 0.25}" stroke="none"`,
      ),
    );
  }
  if (element.hatchingStyle && element.hatchingStyle !== "none") {
    parts.push(
      renderShapePrimitive(
        element,
        `fill="url(#${getElementPatternId("hatch", element.id)})" stroke="none"`,
      ),
    );
  }
  if (element.dotsEnabled) {
    parts.push(
      renderShapePrimitive(
        element,
        `fill="url(#${getElementPatternId("dots", element.id)})" stroke="none"`,
      ),
    );
  }
  if (element.strokeEnabled !== false && element.strokeWidth > 0) {
    const dash = getDashArray(element.dashStyle, element.strokeWidth);
    parts.push(
      renderShapePrimitive(
        element,
        `fill="none" stroke="${escapeXml(element.strokeColor)}" stroke-opacity="${element.strokeOpacity ?? 1}" stroke-width="${element.strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ""} stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"`,
      ),
    );
  }
  return `<g>${parts.join("")}</g>`;
}

function pathPoints(points: DroMapDrawnMarkerPoint[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function renderPathPrimitive(
  element: DroMapDrawnMarkerPathElement,
  attributes: string,
) {
  return element.closed
    ? `<polygon points="${pathPoints(element.points)}" ${attributes} />`
    : `<polyline points="${pathPoints(element.points)}" ${attributes} />`;
}

function renderPathElement(element: DroMapDrawnMarkerPathElement) {
  if (!element.closed) {
    const dash = getDashArray(element.dashStyle, element.strokeWidth);
    const parts = [
      renderPathPrimitive(
        element,
        `fill="none" stroke="${escapeXml(element.strokeColor)}" stroke-opacity="${element.strokeOpacity ?? 1}" stroke-width="${element.strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ""} stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"`,
      ),
    ];
    if (element.arrowStart && element.points.length >= 2) {
      parts.push(
        renderArrowHead(
          element.points[0].x,
          element.points[0].y,
          element.points[1].x,
          element.points[1].y,
          element.strokeColor,
          element.strokeOpacity ?? 1,
          element.strokeWidth,
        ).markup,
      );
    }
    if (element.arrowEnd && element.points.length >= 2) {
      const lastIndex = element.points.length - 1;
      parts.push(
        renderArrowHead(
          element.points[lastIndex].x,
          element.points[lastIndex].y,
          element.points[lastIndex - 1].x,
          element.points[lastIndex - 1].y,
          element.strokeColor,
          element.strokeOpacity ?? 1,
          element.strokeWidth,
        ).markup,
      );
    }
    return `<g>${parts.join("")}</g>`;
  }

  const parts: string[] = [];
  if (element.fillEnabled) {
    parts.push(
      renderPathPrimitive(
        element,
        `fill="${escapeXml(element.fillColor)}" fill-opacity="${element.fillOpacity ?? 0.25}" stroke="none"`,
      ),
    );
  }
  if (element.hatchingStyle && element.hatchingStyle !== "none") {
    parts.push(
      renderPathPrimitive(
        element,
        `fill="url(#${getElementPatternId("hatch", element.id)})" stroke="none"`,
      ),
    );
  }
  if (element.dotsEnabled) {
    parts.push(
      renderPathPrimitive(
        element,
        `fill="url(#${getElementPatternId("dots", element.id)})" stroke="none"`,
      ),
    );
  }
  if (element.strokeEnabled !== false && element.strokeWidth > 0) {
    const dash = getDashArray(element.dashStyle, element.strokeWidth);
    parts.push(
      renderPathPrimitive(
        element,
        `fill="none" stroke="${escapeXml(element.strokeColor)}" stroke-opacity="${element.strokeOpacity ?? 1}" stroke-width="${element.strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ""} stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"`,
      ),
    );
  }
  return `<g>${parts.join("")}</g>`;
}

function renderTextElement(element: DroMapDrawnMarkerTextElement) {
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;
  const transform = `rotate(${element.rotation} ${centerX} ${centerY})`;
  const parts: string[] = [];
  if (element.backgroundEnabled || element.borderEnabled) {
    parts.push(
      `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="8" fill="${element.backgroundEnabled ? escapeXml(element.backgroundColor ?? "#ffffff") : "none"}" fill-opacity="${element.backgroundEnabled ? (element.backgroundOpacity ?? 0.85) : 0}" stroke="${element.borderEnabled ? escapeXml(element.borderColor ?? "#111827") : "none"}" stroke-width="${element.borderEnabled ? (element.borderWidth ?? 2) : 0}" transform="${transform}" />`,
    );
  }
  parts.push(
    `<text x="${centerX}" y="${centerY}" fill="${escapeXml(element.color)}" fill-opacity="${element.opacity ?? 1}" font-family="Arial, Helvetica, sans-serif" font-size="${element.fontSize}" font-weight="700" text-anchor="middle" dominant-baseline="middle" transform="${transform}">${escapeXml(element.text)}</text>`,
  );
  return `<g>${parts.join("")}</g>`;
}

function renderArrowHead(
  tipX: number,
  tipY: number,
  fromX: number,
  fromY: number,
  strokeColor: string,
  strokeOpacity: number,
  strokeWidth: number,
) {
  const deltaX = tipX - fromX;
  const deltaY = tipY - fromY;
  const length = Math.max(1, Math.hypot(deltaX, deltaY));
  const unitX = deltaX / length;
  const unitY = deltaY / length;
  const normalX = -unitY;
  const normalY = unitX;
  const headLength = Math.max(12, strokeWidth * 3.2);
  const headHalfWidth = Math.max(7, strokeWidth * 1.8);
  const baseX = tipX - unitX * headLength;
  const baseY = tipY - unitY * headLength;
  return {
    baseX,
    baseY,
    markup: `<polygon points="${tipX},${tipY} ${baseX + normalX * headHalfWidth},${baseY + normalY * headHalfWidth} ${baseX - normalX * headHalfWidth},${baseY - normalY * headHalfWidth}" fill="${escapeXml(strokeColor)}" fill-opacity="${strokeOpacity}" />`,
  };
}

function renderElement(element: DroMapDrawnMarkerElement) {
  if (element.type === "shape") return renderShapeElement(element);
  if (element.type === "path") return renderPathElement(element);
  if (element.type === "text") return renderTextElement(element);

  const opacity = element.strokeOpacity ?? 1;
  const arrowStart = element.arrowStart === true;
  const arrowEnd = element.arrowEnd === true || element.type === "arrow";
  const startHead = arrowStart
    ? renderArrowHead(
        element.x1,
        element.y1,
        element.x2,
        element.y2,
        element.strokeColor,
        opacity,
        element.strokeWidth,
      )
    : null;
  const endHead = arrowEnd
    ? renderArrowHead(
        element.x2,
        element.y2,
        element.x1,
        element.y1,
        element.strokeColor,
        opacity,
        element.strokeWidth,
      )
    : null;
  const startX = startHead
    ? startHead.baseX +
      ((element.x2 - element.x1) /
        Math.max(
          1,
          Math.hypot(element.x2 - element.x1, element.y2 - element.y1),
        )) *
        element.strokeWidth
    : element.x1;
  const startY = startHead
    ? startHead.baseY +
      ((element.y2 - element.y1) /
        Math.max(
          1,
          Math.hypot(element.x2 - element.x1, element.y2 - element.y1),
        )) *
        element.strokeWidth
    : element.y1;
  const endX = endHead
    ? endHead.baseX +
      ((element.x1 - element.x2) /
        Math.max(
          1,
          Math.hypot(element.x2 - element.x1, element.y2 - element.y1),
        )) *
        element.strokeWidth
    : element.x2;
  const endY = endHead
    ? endHead.baseY +
      ((element.y1 - element.y2) /
        Math.max(
          1,
          Math.hypot(element.x2 - element.x1, element.y2 - element.y1),
        )) *
        element.strokeWidth
    : element.y2;
  const dash = getDashArray(element.dashStyle, element.strokeWidth);
  return `<g><line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="${escapeXml(element.strokeColor)}" stroke-opacity="${opacity}" stroke-width="${element.strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ""} stroke-linecap="round" />${startHead?.markup ?? ""}${endHead?.markup ?? ""}</g>`;
}

function renderPatternDefinitions(elements: DroMapDrawnMarkerElement[]) {
  const definitions: string[] = [];
  for (const element of elements) {
    if (
      element.type !== "shape" &&
      !(element.type === "path" && element.closed)
    )
      continue;
    const hatchingStyle = element.hatchingStyle ?? "none";
    if (hatchingStyle !== "none") {
      const spacing = Math.max(3, element.hatchingSpacing ?? 14);
      const weight = Math.max(0.5, element.hatchingWeight ?? 2);
      const color = escapeXml(element.hatchingColor ?? element.strokeColor);
      let line = "";
      if (hatchingStyle === "diagonal-right")
        line = `<path d="M-${spacing} ${spacing} L${spacing} -${spacing} M0 ${spacing * 2} L${spacing * 2} 0" />`;
      if (hatchingStyle === "diagonal-left")
        line = `<path d="M-${spacing} 0 L${spacing} ${spacing * 2} M0 -${spacing} L${spacing * 2} ${spacing}" />`;
      if (hatchingStyle === "horizontal")
        line = `<path d="M0 ${spacing / 2} H${spacing}" />`;
      if (hatchingStyle === "vertical")
        line = `<path d="M${spacing / 2} 0 V${spacing}" />`;
      definitions.push(
        `<pattern id="${getElementPatternId("hatch", element.id)}" width="${spacing}" height="${spacing}" patternUnits="userSpaceOnUse"><g fill="none" stroke="${color}" stroke-width="${weight}" stroke-linecap="round">${line}</g></pattern>`,
      );
    }
    if (element.dotsEnabled) {
      const spacing = Math.max(3, element.dotsSpacing ?? 14);
      definitions.push(
        `<pattern id="${getElementPatternId("dots", element.id)}" width="${spacing}" height="${spacing}" patternUnits="userSpaceOnUse"><circle cx="${spacing / 2}" cy="${spacing / 2}" r="${Math.max(0.5, element.dotsRadius ?? 2)}" fill="${escapeXml(element.dotsColor ?? element.strokeColor)}" /></pattern>`,
      );
    }
  }
  return definitions.length > 0 ? `<defs>${definitions.join("")}</defs>` : "";
}

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

function rotatePoint(
  point: DroMapDrawnMarkerPoint,
  center: DroMapDrawnMarkerPoint,
  rotation: number,
) {
  const radians = (rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cosine - dy * sine,
    y: center.y + dx * sine + dy * cosine,
  };
}

function boundsFromPoints(
  points: DroMapDrawnMarkerPoint[],
  padding = 0,
): Bounds {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs) - padding,
    minY: Math.min(...ys) - padding,
    maxX: Math.max(...xs) + padding,
    maxY: Math.max(...ys) + padding,
  };
}

function getElementBounds(element: DroMapDrawnMarkerElement): Bounds {
  if (element.type === "shape" || element.type === "text") {
    const center = {
      x: element.x + element.width / 2,
      y: element.y + element.height / 2,
    };
    const corners = [
      { x: element.x, y: element.y },
      { x: element.x + element.width, y: element.y },
      { x: element.x + element.width, y: element.y + element.height },
      { x: element.x, y: element.y + element.height },
    ].map((point) => rotatePoint(point, center, element.rotation));
    const padding = element.type === "shape" ? element.strokeWidth / 2 + 3 : 4;
    return boundsFromPoints(corners, padding);
  }

  if (element.type === "path") {
    return boundsFromPoints(element.points, element.strokeWidth / 2 + 4);
  }

  const padding =
    element.strokeWidth * (element.type === "arrow" ? 2.2 : 0.8) + 4;
  return {
    minX: Math.min(element.x1, element.x2) - padding,
    minY: Math.min(element.y1, element.y2) - padding,
    maxX: Math.max(element.x1, element.x2) + padding,
    maxY: Math.max(element.y1, element.y2) + padding,
  };
}

function getContentViewBox(elements: DroMapDrawnMarkerElement[]) {
  if (elements.length === 0) {
    return `0 0 ${CUSTOM_MARKER_CANVAS_SIZE} ${CUSTOM_MARKER_CANVAS_SIZE}`;
  }

  const bounds = elements.map(getElementBounds).reduce((result, current) => ({
    minX: Math.min(result.minX, current.minX),
    minY: Math.min(result.minY, current.minY),
    maxX: Math.max(result.maxX, current.maxX),
    maxY: Math.max(result.maxY, current.maxY),
  }));

  const width = Math.max(20, bounds.maxX - bounds.minX);
  const height = Math.max(20, bounds.maxY - bounds.minY);
  const size = Math.max(width, height);
  const padding = Math.max(12, size * 0.08);
  const finalSize = size + padding * 2;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return `${centerX - finalSize / 2} ${centerY - finalSize / 2} ${finalSize} ${finalSize}`;
}

export function createDrawnMarkerSvg(elements: DroMapDrawnMarkerElement[]) {
  const viewBox = getContentViewBox(elements);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="512" height="512" preserveAspectRatio="xMidYMid meet">${renderPatternDefinitions(elements)}${elements.map(renderElement).join("")}</svg>`;
}

export function createDrawnMarkerDataUrl(elements: DroMapDrawnMarkerElement[]) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    createDrawnMarkerSvg(elements),
  )}`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Image illisible."));
    reader.onerror = () => reject(new Error("Image illisible."));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Le fichier image ne peut pas être ouvert."));
    image.src = source;
  });
}

function getOpaqueBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  return maxX >= minX && maxY >= minY
    ? { minX, minY, maxX, maxY }
    : { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 };
}

export async function normalizeImportedMarkerImage(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choisis un fichier PNG, WebP, JPEG ou SVG.");
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error("L’image est trop lourde. Limite : 12 Mo.");
  }

  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const sourceCanvas = document.createElement("canvas");
  const sourceWidth = clamp(image.naturalWidth || image.width, 1, 2048);
  const sourceHeight = clamp(image.naturalHeight || image.height, 1, 2048);
  const sourceScale = Math.min(1, 1024 / Math.max(sourceWidth, sourceHeight));
  sourceCanvas.width = Math.max(1, Math.round(sourceWidth * sourceScale));
  sourceCanvas.height = Math.max(1, Math.round(sourceHeight * sourceScale));
  const sourceContext = sourceCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!sourceContext)
    throw new Error("Le navigateur ne peut pas préparer cette image.");

  sourceContext.drawImage(image, 0, 0, sourceCanvas.width, sourceCanvas.height);
  const imageData = sourceContext.getImageData(
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height,
  );
  const bounds = getOpaqueBounds(
    imageData.data,
    sourceCanvas.width,
    sourceCanvas.height,
  );
  const cropWidth = Math.max(1, bounds.maxX - bounds.minX + 1);
  const cropHeight = Math.max(1, bounds.maxY - bounds.minY + 1);
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = 512;
  outputCanvas.height = 512;
  const outputContext = outputCanvas.getContext("2d");
  if (!outputContext)
    throw new Error("Le navigateur ne peut pas préparer cette image.");

  const padding = 28;
  const targetScale = Math.min(
    (outputCanvas.width - padding * 2) / cropWidth,
    (outputCanvas.height - padding * 2) / cropHeight,
  );
  const targetWidth = cropWidth * targetScale;
  const targetHeight = cropHeight * targetScale;

  outputContext.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
  outputContext.drawImage(
    sourceCanvas,
    bounds.minX,
    bounds.minY,
    cropWidth,
    cropHeight,
    (outputCanvas.width - targetWidth) / 2,
    (outputCanvas.height - targetHeight) / 2,
    targetWidth,
    targetHeight,
  );

  return outputCanvas.toDataURL("image/png");
}

const canvasImageCache = new Map<string, HTMLImageElement>();

export function getCustomMarkerCanvasImage(
  marker: DroMapCustomMarkerDefinition,
) {
  const cached = canvasImageCache.get(marker.id);
  if (cached?.src === marker.dataUrl) return cached;
  if (typeof Image === "undefined") return null;

  const image = new Image();
  image.decoding = "async";
  image.src = marker.dataUrl;
  canvasImageCache.set(marker.id, image);
  return image;
}

export async function preloadCustomMarkerImagesForFeatures(
  features: DroMapFeature[],
) {
  const markerIds = new Set(
    features.flatMap((feature) => {
      const symbol = feature.properties.symbol;
      return feature.properties.type === "marker" &&
        symbol &&
        symbol.type !== "builtin"
        ? [symbol.id]
        : [];
    }),
  );

  await Promise.all(
    Array.from(markerIds).flatMap((markerId) => {
      const marker = getCustomMarkerById(markerId);
      if (!marker) return [];
      const image = getCustomMarkerCanvasImage(marker);
      if (!image || (image.complete && image.naturalWidth > 0)) return [];

      return [
        new Promise<void>((resolve) => {
          const finish = () => resolve();
          image.addEventListener("load", finish, { once: true });
          image.addEventListener("error", finish, { once: true });
        }),
      ];
    }),
  );
}
