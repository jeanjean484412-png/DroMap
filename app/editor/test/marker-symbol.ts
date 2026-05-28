"use client";

import type {
  DroMapMarkerBuiltinSymbol,
  DroMapMarkerSymbol,
} from "@/lib/dromap/feature";
import { getFeatureMarkerSize } from "./feature-style";

type FeatureWithMarkerSymbol = {
  properties?: {
    style?: {
      color?: string;
      opacity?: number;
      markerSize?: number;
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

type LeafletLike = {
  divIcon: (options: {
    className?: string;
    iconSize?: [number, number];
    iconAnchor?: [number, number];
    html?: string;
  }) => unknown;
};

export const DEFAULT_MARKER_SYMBOL: DroMapMarkerSymbol = {
  type: "builtin",
  id: "circle",
};

export const DROMAP_BUILTIN_MARKER_SYMBOLS: {
  id: DroMapMarkerBuiltinSymbol;
  label: string;
}[] = [
  { id: "circle", label: "Cercle" },
  { id: "square", label: "Carré" },
  { id: "diamond", label: "Losange" },
  { id: "triangle", label: "Triangle" },
  { id: "star", label: "Étoile" },
  { id: "pin", label: "Épingle" },
];

const BUILTIN_MARKER_SYMBOL_IDS = new Set<DroMapMarkerBuiltinSymbol>(
  DROMAP_BUILTIN_MARKER_SYMBOLS.map((symbol) => symbol.id),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function safeColor(value: unknown, fallback = "#e63946") {
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

  if (BUILTIN_MARKER_SYMBOL_IDS.has(value as DroMapMarkerBuiltinSymbol)) {
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

export function getMarkerSymbolLabel(feature: FeatureWithMarkerSymbol) {
  const symbol = getFeatureMarkerSymbol(feature);

  if (symbol.type !== "builtin") {
    if (symbol.type === "custom-svg") return "Symbole importé";
    if (symbol.type === "custom-image") return "Image importée";
    if (symbol.type === "ai-generated") return "Symbole IA";
    if (symbol.type === "drawn") return "Symbole dessiné";

    return "Symbole personnalisé";
  }

  return (
    DROMAP_BUILTIN_MARKER_SYMBOLS.find((option) => option.id === symbol.id)
      ?.label ?? "Cercle"
  );
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
  const rawSize = options?.size ?? getFeatureMarkerSize(feature);

  return clamp(Math.round(rawSize), 8, 96);
}

function getBuiltinSvgShape(symbolId: DroMapMarkerBuiltinSymbol, color: string) {
  switch (symbolId) {
    case "square":
      return `<rect x="20" y="20" width="60" height="60" rx="8" fill="${color}" stroke="#ffffff" stroke-width="10" />`;
    case "diamond":
      return `<path d="M50 10 L90 50 L50 90 L10 50 Z" fill="${color}" stroke="#ffffff" stroke-width="10" stroke-linejoin="round" />`;
    case "triangle":
      return `<path d="M50 10 L90 84 L10 84 Z" fill="${color}" stroke="#ffffff" stroke-width="10" stroke-linejoin="round" />`;
    case "star":
      return `<path d="M50 8 L61.8 35.2 L91.4 38.1 L69.1 57.8 L75.6 86.9 L50 71.8 L24.4 86.9 L30.9 57.8 L8.6 38.1 L38.2 35.2 Z" fill="${color}" stroke="#ffffff" stroke-width="8" stroke-linejoin="round" />`;
    case "pin":
      return `<path d="M50 7 C32 7 18 21 18 39 C18 63 50 93 50 93 C50 93 82 63 82 39 C82 21 68 7 50 7 Z" fill="${color}" stroke="#ffffff" stroke-width="8" stroke-linejoin="round" /><circle cx="50" cy="39" r="12" fill="#ffffff" opacity="0.92" />`;
    case "circle":
    default:
      return `<circle cx="50" cy="50" r="35" fill="${color}" stroke="#ffffff" stroke-width="10" />`;
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

  if (symbol.type !== "builtin") {
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
        viewBox="0 0 100 100"
        width="${size}"
        height="${size}"
        style="display:block;overflow:visible;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.35));"
      >
        ${getBuiltinSvgShape(symbol.id, color)}
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

function beginBuiltinMarkerCanvasPath(
  ctx: CanvasRenderingContext2D,
  symbolId: DroMapMarkerBuiltinSymbol,
) {
  ctx.beginPath();

  switch (symbolId) {
    case "square":
      ctx.roundRect(20, 20, 60, 60, 8);
      break;
    case "diamond":
      ctx.moveTo(50, 10);
      ctx.lineTo(90, 50);
      ctx.lineTo(50, 90);
      ctx.lineTo(10, 50);
      ctx.closePath();
      break;
    case "triangle":
      ctx.moveTo(50, 10);
      ctx.lineTo(90, 84);
      ctx.lineTo(10, 84);
      ctx.closePath();
      break;
    case "star": {
      const points = [
        [50, 8],
        [61.8, 35.2],
        [91.4, 38.1],
        [69.1, 57.8],
        [75.6, 86.9],
        [50, 71.8],
        [24.4, 86.9],
        [30.9, 57.8],
        [8.6, 38.1],
        [38.2, 35.2],
      ];

      ctx.moveTo(points[0][0], points[0][1]);

      for (const point of points.slice(1)) {
        ctx.lineTo(point[0], point[1]);
      }

      ctx.closePath();
      break;
    }
    case "pin":
      ctx.moveTo(50, 7);
      ctx.bezierCurveTo(32, 7, 18, 21, 18, 39);
      ctx.bezierCurveTo(18, 63, 50, 93, 50, 93);
      ctx.bezierCurveTo(50, 93, 82, 63, 82, 39);
      ctx.bezierCurveTo(82, 21, 68, 7, 50, 7);
      ctx.closePath();
      break;
    case "circle":
    default:
      ctx.arc(50, 50, 35, 0, Math.PI * 2);
      break;
  }
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
  const color = getMarkerColor(feature);
  const opacity = getMarkerOpacity(feature);
  const safeSize = clamp(size, 6, 160);
  const scale = safeSize / 100;

  if (symbol.type !== "builtin") {
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

  ctx.save();
  ctx.translate(centerX - safeSize / 2, centerY - safeSize / 2);
  ctx.scale(scale, scale);

  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.strokeStyle = options?.strokeColor ?? "#ffffff";
  ctx.lineWidth = symbol.id === "star" ? 8 : 10;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (options?.shadow !== false) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = 7;
    ctx.shadowOffsetY = 3;
  }

  beginBuiltinMarkerCanvasPath(ctx, symbol.id);
  ctx.fill();
  ctx.stroke();

  if (symbol.id === "pin") {
    ctx.shadowColor = "transparent";
    ctx.globalAlpha = opacity * 0.92;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(50, 39, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}