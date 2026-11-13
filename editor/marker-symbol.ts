"use client";

import type { DivIcon, Icon, IconOptions } from "leaflet";
import type {
  DroMapMarkerBuiltinSymbol,
  DroMapMarkerSymbol,
} from "@/lib/dromap/feature";
import { getFeatureMarkerSize } from "./feature-style";
import { getCustomMarkerById } from "@/stores/editor-custom-markers";
import { getCustomMarkerCanvasImage } from "./custom-marker-rendering";
import { sanitizeMarkerSvg } from "@/lib/dromap/safe-marker-svg";

import { BUILTIN_MARKER_METADATA, COMMON_MARKER_NODES, DROMAP_MARKER_SYMBOL_CATEGORIES, type DroMapMarkerSymbolOption, type TablerNode } from "./marker-symbol-data";
export { DROMAP_MARKER_SYMBOL_CATEGORIES } from "./marker-symbol-data";
export type { DroMapMarkerSymbolCategoryId, DroMapMarkerSymbolOption } from "./marker-symbol-data";

type FeatureWithMarkerSymbol = {
  properties?: {
    style?: {
      color?: string;
      opacity?: number;
      markerSize?: number;
      weight?: number;
      markerFilled?: boolean;
      markerRotation?: number;
      renderScale?: number;
    };
    symbol?: unknown;
  };
};

type MarkerSymbolHtmlOptions = {
  size?: number;
};

type DrawMarkerSymbolOptions = {
  strokeColor?: string;
  shadow?: boolean;
};

type LeafletMarkerIcon = DivIcon | Icon<IconOptions>;

type LeafletLike = {
  divIcon: (options: {
    className?: string;
    iconSize?: [number, number];
    iconAnchor?: [number, number];
    html?: string;
  }) => LeafletMarkerIcon;
};

export const DEFAULT_MARKER_SYMBOL: DroMapMarkerSymbol = {
  type: "builtin",
  id: "circle",
};

export function getMarkerSymbolCategoryLabel(categoryId: string) {
  return (
    DROMAP_MARKER_SYMBOL_CATEGORIES.find(
      (category) => category.id === categoryId,
    )?.label ?? "Autres"
  );
}

export function getMarkerSymbolOptionFullLabel(
  option: DroMapMarkerSymbolOption,
) {
  return `${getMarkerSymbolCategoryLabel(option.categoryId)} — ${option.label}`;
}

let catalog: typeof import("./marker-symbol-catalog") | undefined;
let catalogPromise: Promise<typeof import("./marker-symbol-catalog")> | undefined;
const catalogListeners = new Set<() => void>();

export function subscribeMarkerCatalog(listener: () => void) {
  catalogListeners.add(listener);
  return () => { catalogListeners.delete(listener); };
}

export function getLoadedMarkerCatalog() {
  return catalog;
}

export function loadMarkerSymbolCatalog() {
  catalogPromise ??= import("./marker-symbol-catalog").then((loaded) => {
    catalog = loaded;
    for (const listener of catalogListeners) listener();
    return loaded;
  }).catch((error: unknown) => {
    catalogPromise = undefined;
    throw error;
  });
  return catalogPromise;
}

export function getBuiltinMarkerCategoryId(id: string) {
  return BUILTIN_MARKER_METADATA.get(id)?.[1];
}

export function markerSymbolNeedsCatalog(symbol: DroMapMarkerSymbol) {
  return symbol.type === "builtin" && BUILTIN_MARKER_METADATA.has(symbol.id) && !COMMON_MARKER_NODES.has(symbol.id);
}

function getBuiltinMarkerNodes(id: string) {
  return COMMON_MARKER_NODES.get(id) ?? catalog?.BUILTIN_MARKER_NODES.get(id) ?? COMMON_MARKER_NODES.get("circle");
}

const FILLABLE_MARKER_SYMBOL_IDS = new Set<DroMapMarkerBuiltinSymbol>([
  "circle",
  "square",
  "square-rounded",
  "diamond",
  "triangle",
  "triangle-inverted",
  "star",
  "navigation",
  "hexagon-marker",
  "pentagon-marker",
  "octagon-marker",
]);

export function markerSymbolSupportsStrokeWeight(
  symbolId: DroMapMarkerBuiltinSymbol,
) {
  return BUILTIN_MARKER_METADATA.has(symbolId);
}

export function markerSymbolSupportsFill(symbolId: DroMapMarkerBuiltinSymbol) {
  return FILLABLE_MARKER_SYMBOL_IDS.has(symbolId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function safeColor(value: unknown, fallback = "#000000") {
  if (typeof value !== "string") {
    return fallback;
  }

  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    return value;
  }

  return fallback;
}

function safeOpacity(value: unknown) {
  return clamp(Number(value ?? 1), 0, 1);
}

function safeBuiltinSymbolId(value: unknown): DroMapMarkerBuiltinSymbol {
  if (typeof value !== "string") {
    return "circle";
  }

  if (BUILTIN_MARKER_METADATA.has(value as DroMapMarkerBuiltinSymbol)) {
    return value as DroMapMarkerBuiltinSymbol;
  }

  return "circle";
}

export function getFeatureMarkerSymbol(
  feature: FeatureWithMarkerSymbol,
): DroMapMarkerSymbol {
  const rawSymbol = feature.properties?.symbol;

  if (!isRecord(rawSymbol)) {
    return DEFAULT_MARKER_SYMBOL;
  }

  if (rawSymbol.type === "builtin") {
    return {
      type: "builtin",
      id: safeBuiltinSymbolId(rawSymbol.id),
    };
  }

  if (
    rawSymbol.type === "custom-svg" ||
    rawSymbol.type === "custom-image" ||
    rawSymbol.type === "ai-generated" ||
    rawSymbol.type === "drawn"
  ) {
    const id = typeof rawSymbol.id === "string" ? rawSymbol.id : "";

    if (id.trim().length > 0) {
      return {
        type: rawSymbol.type,
        id,
      };
    }
  }

  return DEFAULT_MARKER_SYMBOL;
}

export function isRotatableCustomMarkerFeature(
  feature: FeatureWithMarkerSymbol,
) {
  const symbol = getFeatureMarkerSymbol(feature);
  return symbol.type === "drawn" || symbol.type === "custom-image";
}

export function getFeatureMarkerRotation(feature: FeatureWithMarkerSymbol) {
  if (!isRotatableCustomMarkerFeature(feature)) return 0;
  const rawValue = Number(feature.properties?.style?.markerRotation ?? 0);
  if (!Number.isFinite(rawValue)) return 0;
  let rotation = rawValue;
  while (rotation > 180) rotation -= 360;
  while (rotation < -180) rotation += 360;
  return rotation;
}

export function getMarkerSymbolLabel(feature: FeatureWithMarkerSymbol) {
  const symbol = getFeatureMarkerSymbol(feature);

  if (symbol.type !== "builtin") {
    const customMarker = getCustomMarkerById(symbol.id);

    if (customMarker) {
      return customMarker.name;
    }

    if (symbol.type === "custom-svg") return "Symbole importé";
    if (symbol.type === "custom-image") return "Image importée";
    if (symbol.type === "ai-generated") return "Symbole IA";
    if (symbol.type === "drawn") return "Symbole dessiné";

    return "Symbole personnalisé";
  }

  return BUILTIN_MARKER_METADATA.get(symbol.id)?.[0] ?? "Cercle";
}

function getMarkerColor(feature: FeatureWithMarkerSymbol) {
  return safeColor(feature.properties?.style?.color);
}

function getMarkerOpacity(feature: FeatureWithMarkerSymbol) {
  return safeOpacity(feature.properties?.style?.opacity);
}

function getMarkerSymbolSize(
  feature: FeatureWithMarkerSymbol,
  options?: MarkerSymbolHtmlOptions,
) {
  /*
   * Une taille fournie explicitement correspond à une taille de rendu déjà
   * calculée par la carte, la preview ou la légende. Elle ne doit jamais être
   * rabattue sur l'ancien plafond historique de 120 px : le layout réserverait
   * alors la bonne place, mais le SVG resterait visuellement trop petit.
   */
  if (options?.size !== undefined) {
    const explicitSize = Number(options.size);

    return clamp(
      Math.round((Number.isFinite(explicitSize) ? explicitSize : 24) * 100) /
        100,
      0.5,
      4096,
    );
  }

  const rawSize = getFeatureMarkerSize(feature);
  const renderScale = Number(feature.properties?.style?.renderScale);

  if (Number.isFinite(renderScale)) {
    return clamp(Math.round(rawSize * 100) / 100, 0.5, 4096);
  }

  return clamp(Math.round(rawSize), 8, 120);
}

function getMarkerStrokeWeight(feature: FeatureWithMarkerSymbol) {
  const rawValue = Number(feature.properties?.style?.weight);

  if (!Number.isFinite(rawValue)) {
    return 7;
  }

  return clamp(Math.round(rawValue), 3, 13);
}

function getMarkerFilled(feature: FeatureWithMarkerSymbol) {
  const symbol = getFeatureMarkerSymbol(feature);

  if (symbol.type !== "builtin") {
    return false;
  }

  return (
    markerSymbolSupportsFill(symbol.id) &&
    feature.properties?.style?.markerFilled === true
  );
}

function getTablerStrokeWidth(feature: FeatureWithMarkerSymbol) {
  return Number((getMarkerStrokeWeight(feature) / 3.5).toFixed(2));
}

function escapeSvgAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function nodeToSvg(node: TablerNode) {
  if (node.tag === "path") {
    return `<path d="${escapeSvgAttribute(node.d)}" />`;
  }

  if (node.tag === "line") {
    return `<line x1="${node.x1}" y1="${node.y1}" x2="${node.x2}" y2="${node.y2}" />`;
  }

  if (node.tag === "polyline" || node.tag === "polygon") {
    return `<${node.tag} points="${escapeSvgAttribute(node.points)}" />`;
  }

  if (node.tag === "circle") {
    return `<circle cx="${node.cx}" cy="${node.cy}" r="${node.r}" />`;
  }

  if (node.tag === "rect") {
    const rx = node.rx ?? 0;
    const ry = node.ry ?? rx;
    return `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${rx}" ry="${ry}" />`;
  }

  if (node.tag === "ellipse") {
    return `<ellipse cx="${node.cx}" cy="${node.cy}" rx="${node.rx}" ry="${node.ry}" />`;
  }

  return "";
}

function wrapFilledMarkerSvgShape(shape: string, color: string) {
  if (!shape) {
    return "";
  }

  return `<g fill="${escapeSvgAttribute(color)}" stroke="none">${shape}</g>`;
}

function getFilledBuiltinSvgShape(
  symbolId: DroMapMarkerBuiltinSymbol,
  color: string,
) {
  if (symbolId === "circle") {
    return wrapFilledMarkerSvgShape(`<circle cx="12" cy="12" r="9" />`, color);
  }

  if (symbolId === "square") {
    return wrapFilledMarkerSvgShape(
      `<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />`,
      color,
    );
  }

  if (symbolId === "square-rounded") {
    return wrapFilledMarkerSvgShape(
      `<path d="M12 3c7.2 0 9 1.8 9 9c0 7.2 -1.8 9 -9 9c-7.2 0 -9 -1.8 -9 -9c0 -7.2 1.8 -9 9 -9" />`,
      color,
    );
  }

  if (symbolId === "diamond") {
    return wrapFilledMarkerSvgShape(
      `<path d="M12 3l9 9l-9 9l-9 -9l9 -9" />`,
      color,
    );
  }

  if (symbolId === "triangle") {
    return wrapFilledMarkerSvgShape(
      `<path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0" />`,
      color,
    );
  }

  if (symbolId === "triangle-inverted") {
    return wrapFilledMarkerSvgShape(
      `<path d="M10.363 20.405l-8.106 -13.534a1.914 1.914 0 0 1 1.636 -2.871h16.214a1.914 1.914 0 0 1 1.636 2.871l-8.106 13.534a1.914 1.914 0 0 1 -3.274 0" />`,
      color,
    );
  }

  if (symbolId === "star") {
    return wrapFilledMarkerSvgShape(
      `<path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245" />`,
      color,
    );
  }

  if (symbolId === "navigation") {
    return wrapFilledMarkerSvgShape(
      `<path d="M12 2l8 20l-8 -3l-8 3l8 -20" />`,
      color,
    );
  }

  if (symbolId === "hexagon-marker") {
    return wrapFilledMarkerSvgShape(
      `<path d="M19.875 6.27a2.225 2.225 0 0 1 1.125 1.948v7.284c0 .809 -.443 1.555 -1.158 1.948l-6.75 4.27a2.269 2.269 0 0 1 -2.184 0l-6.75 -4.27a2.225 2.225 0 0 1 -1.158 -1.948v-7.285c0 -.809 .443 -1.554 1.158 -1.947l6.75 -3.98a2.33 2.33 0 0 1 2.25 0l6.75 3.98h-.033" />`,
      color,
    );
  }

  if (symbolId === "pentagon-marker") {
    return wrapFilledMarkerSvgShape(
      `<path d="M13.163 2.168l8.021 5.828c.694 .504 .984 1.397 .719 2.212l-3.064 9.43a1.978 1.978 0 0 1 -1.881 1.367h-9.916a1.978 1.978 0 0 1 -1.881 -1.367l-3.064 -9.43a1.978 1.978 0 0 1 .719 -2.212l8.021 -5.828a1.978 1.978 0 0 1 2.326 0" />`,
      color,
    );
  }

  if (symbolId === "octagon-marker") {
    return wrapFilledMarkerSvgShape(
      `<path d="M12.802 2.165l5.575 2.389c.48 .206 .863 .589 1.07 1.07l2.388 5.574c.22 .512 .22 1.092 0 1.604l-2.389 5.575c-.206 .48 -.589 .863 -1.07 1.07l-5.574 2.388c-.512 .22 -1.092 .22 -1.604 0l-5.575 -2.389a2.036 2.036 0 0 1 -1.07 -1.07l-2.388 -5.574a2.036 2.036 0 0 1 0 -1.604l2.389 -5.575c.206 -.48 .589 -.863 1.07 -1.07l5.574 -2.388a2.036 2.036 0 0 1 1.604 0" />`,
      color,
    );
  }

  return "";
}

function getBuiltinSvgShape(
  symbolId: DroMapMarkerBuiltinSymbol,
  filled = false,
  color = "#000000",
) {
  const nodes = getBuiltinMarkerNodes(symbolId);

  if (!nodes) {
    return "";
  }

  const outlineShape = `<g fill="none">${nodes.map(nodeToSvg).join("")}</g>`;

  if (!filled) {
    return outlineShape;
  }

  const filledShape = getFilledBuiltinSvgShape(symbolId, color);

  if (filledShape.length === 0) {
    return outlineShape;
  }

  return `${filledShape}${outlineShape}`;
}

/** Same catalog geometry as the map, embedded as vector paths in compositions. */
export function getBuiltinMarkerCompositionSvg(symbolId: string, color: string) {
  const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : "#194858";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="${safeColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${getBuiltinSvgShape(symbolId)}</svg>`;
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getInlineDrawnMarkerSvg(dataUrl: string, size: number) {
  if (!dataUrl.startsWith("data:image/svg+xml")) return null;

  try {
    const separatorIndex = dataUrl.indexOf(",");
    if (separatorIndex < 0) return null;
    const encoded = dataUrl.slice(separatorIndex + 1);
    const svgMarkup = sanitizeMarkerSvg(decodeURIComponent(encoded));
    if (!svgMarkup) return null;
    const openingMatch = svgMarkup.match(/<svg\b([^>]*)>/i);
    if (!openingMatch) return null;
    const viewBoxMatch = openingMatch[1].match(/viewBox=["']([^"']+)["']/i);
    const viewBox = viewBoxMatch?.[1] ?? "0 0 512 512";
    const body = svgMarkup
      .replace(/^[\s\S]*?<svg\b[^>]*>/i, "")
      .replace(/<\/svg>\s*$/i, "");

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeHtmlAttribute(viewBox)}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet" style="display:block;width:${size}px;height:${size}px;overflow:visible;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.30));pointer-events:none;user-select:none">${body}</svg>`;
  } catch {
    return null;
  }
}

export function getMarkerSymbolHtml(
  feature: FeatureWithMarkerSymbol,
  options?: MarkerSymbolHtmlOptions,
) {
  const symbol = getFeatureMarkerSymbol(feature);
  const color = getMarkerColor(feature);
  const opacity = getMarkerOpacity(feature);
  const size = getMarkerSymbolSize(feature, options);
  const strokeWidth = getTablerStrokeWidth(feature);
  const filled = getMarkerFilled(feature);

  if (symbol.type !== "builtin") {
    const customMarker = getCustomMarkerById(symbol.id);

    if (customMarker) {
      const rotation = getFeatureMarkerRotation(feature);
      const inlineSvg =
        customMarker.kind === "drawn"
          ? getInlineDrawnMarkerSvg(customMarker.dataUrl, size)
          : null;
      return `
        <span
          aria-hidden="true"
          style="
            display:flex;
            align-items:center;
            justify-content:center;
            width:${size}px;
            height:${size}px;
            line-height:0;
            opacity:${opacity};
            transform:rotate(${rotation}deg);
            transform-origin:center center;
          "
        >
          ${
            inlineSvg ??
            `<img
              src="${escapeHtmlAttribute(customMarker.dataUrl)}"
              alt=""
              draggable="false"
              decoding="async"
              style="display:block;width:${size}px;height:${size}px;object-fit:contain;image-rendering:auto;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.30));pointer-events:none;user-select:none;"
            />`
          }
        </span>
      `;
    }

    return getMarkerSymbolHtml(
      {
        properties: {
          style: feature.properties?.style,
          symbol: DEFAULT_MARKER_SYMBOL,
        },
      },
      options,
    );
  }

  return `
    <span
      aria-hidden="true"
      style="
        display:block;
        width:${size}px;
        height:${size}px;
        line-height:0;
        opacity:${opacity};
      "
    >
      <svg
        viewBox="0 0 24 24"
        width="${size}"
        height="${size}"
        fill="none"
        stroke="${escapeSvgAttribute(color)}"
        stroke-width="${strokeWidth}"
        stroke-linecap="round"
        stroke-linejoin="round"
        style="display:block;overflow:visible;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.30));"
      >
        ${getBuiltinSvgShape(symbol.id, filled, color)}
      </svg>
    </span>
  `;
}

export function createMarkerLeafletIcon(
  feature: FeatureWithMarkerSymbol,
  leaflet: LeafletLike,
) {
  const markerSize = getFeatureMarkerSize(feature);

  return leaflet.divIcon({
    className: "dromap-marker-icon",
    iconSize: [markerSize, markerSize],
    iconAnchor: [markerSize / 2, markerSize / 2],
    html: getMarkerSymbolHtml(feature, { size: markerSize }),
  });
}

function parsePoints(points: string) {
  return points
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").map(Number))
    .filter(
      (pair): pair is [number, number] =>
        pair.length === 2 &&
        Number.isFinite(pair[0]) &&
        Number.isFinite(pair[1]),
    );
}

function drawNode(ctx: CanvasRenderingContext2D, node: TablerNode) {
  ctx.beginPath();

  if (node.tag === "path") {
    ctx.stroke(new Path2D(node.d));
    return;
  }

  if (node.tag === "line") {
    ctx.moveTo(node.x1, node.y1);
    ctx.lineTo(node.x2, node.y2);
    ctx.stroke();
    return;
  }

  if (node.tag === "polyline" || node.tag === "polygon") {
    const points = parsePoints(node.points);
    if (points.length === 0) return;

    ctx.moveTo(points[0][0], points[0][1]);
    for (const [x, y] of points.slice(1)) {
      ctx.lineTo(x, y);
    }
    if (node.tag === "polygon") {
      ctx.closePath();
    }
    ctx.stroke();
    return;
  }

  if (node.tag === "circle") {
    ctx.arc(node.cx, node.cy, node.r, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  if (node.tag === "ellipse") {
    ctx.ellipse(node.cx, node.cy, node.rx, node.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  if (node.tag === "rect") {
    const rx = node.rx ?? 0;
    if (rx > 0 && "roundRect" in ctx) {
      ctx.roundRect(node.x, node.y, node.width, node.height, rx);
    } else {
      ctx.rect(node.x, node.y, node.width, node.height);
    }
    ctx.stroke();
  }
}

function createFilledMarkerPath(symbolId: DroMapMarkerBuiltinSymbol) {
  const path = new Path2D();

  if (symbolId === "circle") {
    path.arc(12, 12, 9, 0, Math.PI * 2);
    return path;
  }

  if (symbolId === "square") {
    path.rect(3, 3, 18, 18);
    return path;
  }

  if (symbolId === "square-rounded") {
    return new Path2D(
      "M12 3c7.2 0 9 1.8 9 9c0 7.2 -1.8 9 -9 9c-7.2 0 -9 -1.8 -9 -9c0 -7.2 1.8 -9 9 -9",
    );
  }

  if (symbolId === "diamond") {
    path.moveTo(12, 3);
    path.lineTo(21, 12);
    path.lineTo(12, 21);
    path.lineTo(3, 12);
    path.closePath();
    return path;
  }

  if (symbolId === "triangle") {
    return new Path2D(
      "M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0",
    );
  }

  if (symbolId === "triangle-inverted") {
    return new Path2D(
      "M10.363 20.405l-8.106 -13.534a1.914 1.914 0 0 1 1.636 -2.871h16.214a1.914 1.914 0 0 1 1.636 2.871l-8.106 13.534a1.914 1.914 0 0 1 -3.274 0",
    );
  }

  if (symbolId === "star") {
    return new Path2D(
      "M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245",
    );
  }

  if (symbolId === "navigation") {
    return new Path2D("M12 2l8 20l-8 -3l-8 3l8 -20");
  }

  if (symbolId === "hexagon-marker") {
    return new Path2D(
      "M19.875 6.27a2.225 2.225 0 0 1 1.125 1.948v7.284c0 .809 -.443 1.555 -1.158 1.948l-6.75 4.27a2.269 2.269 0 0 1 -2.184 0l-6.75 -4.27a2.225 2.225 0 0 1 -1.158 -1.948v-7.285c0 -.809 .443 -1.554 1.158 -1.947l6.75 -3.98a2.33 2.33 0 0 1 2.25 0l6.75 3.98h-.033",
    );
  }

  if (symbolId === "pentagon-marker") {
    return new Path2D(
      "M13.163 2.168l8.021 5.828c.694 .504 .984 1.397 .719 2.212l-3.064 9.43a1.978 1.978 0 0 1 -1.881 1.367h-9.916a1.978 1.978 0 0 1 -1.881 -1.367l-3.064 -9.43a1.978 1.978 0 0 1 .719 -2.212l8.021 -5.828a1.978 1.978 0 0 1 2.326 0",
    );
  }

  if (symbolId === "octagon-marker") {
    return new Path2D(
      "M12.802 2.165l5.575 2.389c.48 .206 .863 .589 1.07 1.07l2.388 5.574c.22 .512 .22 1.092 0 1.604l-2.389 5.575c-.206 .48 -.589 .863 -1.07 1.07l-5.574 2.388c-.512 .22 -1.092 .22 -1.604 0l-5.575 -2.389a2.036 2.036 0 0 1 -1.07 -1.07l-2.388 -5.574a2.036 2.036 0 0 1 0 -1.604l2.389 -5.575c.206 -.48 .589 -.863 1.07 -1.07l5.574 -2.388a2.036 2.036 0 0 1 1.604 0",
    );
  }

  return null;
}

export function drawMarkerSymbolOnCanvas(
  ctx: CanvasRenderingContext2D,
  feature: FeatureWithMarkerSymbol,
  centerX: number,
  centerY: number,
  size: number,
  options?: DrawMarkerSymbolOptions,
) {
  const symbol = getFeatureMarkerSymbol(feature);
  const color = options?.strokeColor ?? getMarkerColor(feature);
  const opacity = getMarkerOpacity(feature);
  const strokeWidth = getTablerStrokeWidth(feature);
  const filled = getMarkerFilled(feature);
  const safeSize = clamp(size, 6, 4096);
  const scale = safeSize / 24;

  if (symbol.type !== "builtin") {
    const customMarker = getCustomMarkerById(symbol.id);
    const image = customMarker
      ? getCustomMarkerCanvasImage(customMarker)
      : null;

    if (image?.complete && image.naturalWidth > 0) {
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.translate(centerX, centerY);
      ctx.rotate((getFeatureMarkerRotation(feature) * Math.PI) / 180);
      if (options?.shadow !== false) {
        ctx.shadowColor = "rgba(0, 0, 0, 0.30)";
        ctx.shadowBlur = Math.max(2, safeSize * 0.08);
        ctx.shadowOffsetY = Math.max(1, safeSize * 0.035);
      }
      ctx.drawImage(image, -safeSize / 2, -safeSize / 2, safeSize, safeSize);
      ctx.restore();
      return;
    }

    drawMarkerSymbolOnCanvas(
      ctx,
      {
        properties: {
          style: feature.properties?.style,
          symbol: DEFAULT_MARKER_SYMBOL,
        },
      },
      centerX,
      centerY,
      safeSize,
      options,
    );
    return;
  }

  const nodes = getBuiltinMarkerNodes(symbol.id);

  if (!nodes) {
    return;
  }

  ctx.save();
  ctx.translate(centerX - safeSize / 2, centerY - safeSize / 2);
  ctx.scale(scale, scale);

  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (options?.shadow !== false) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.30)";
    ctx.shadowBlur = 7 / scale;
    ctx.shadowOffsetY = 3 / scale;
  }

  if (filled) {
    const filledPath = createFilledMarkerPath(symbol.id);

    if (filledPath) {
      ctx.fill(filledPath);
    }
  }

  for (const node of nodes) {
    drawNode(ctx, node);
  }

  ctx.restore();
}
