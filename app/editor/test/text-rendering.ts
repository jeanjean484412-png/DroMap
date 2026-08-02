import type { DroMapFeature } from "@/lib/dromap/feature";

export const DEFAULT_TEXT_CONTENT = "Texte";
export const MIN_TEXT_FONT_SIZE = 1;
export const MAX_TEXT_FONT_SIZE = 72;
export const DEFAULT_TEXT_FONT_SIZE = 22;
export const TEXT_LINE_HEIGHT_RATIO = 1.15;
export const TEXT_HORIZONTAL_PADDING = 24;
export const TEXT_VERTICAL_PADDING = 14;
export const MIN_TEXT_ROTATION = -180;
export const MAX_TEXT_ROTATION = 180;
export const DEFAULT_TEXT_BACKGROUND_COLOR = "#ffffff";
export const DEFAULT_TEXT_BACKGROUND_OPACITY = 0.85;
export const DEFAULT_TEXT_BORDER_COLOR = "#111827";
export const DEFAULT_TEXT_BORDER_WIDTH = 2;
export const MIN_TEXT_BORDER_WIDTH = 1;
export const MAX_TEXT_BORDER_WIDTH = 8;
export const DEFAULT_TEXT_OUTLINE_COLOR = "#ffffff";
export const DEFAULT_TEXT_OUTLINE_WIDTH = 1.5;
export const MIN_TEXT_OUTLINE_WIDTH = 0;
export const MAX_TEXT_OUTLINE_WIDTH = 6;

export const MIN_TEXT_MAP_SCALE = 0.125;
export const MAX_TEXT_MAP_SCALE = 8;

/**
 * Convertit un ecart de zoom Leaflet en facteur graphique.
 * Un niveau de zoom en plus double la taille geographique du texte,
 * comme pour les autres elements attaches a la carte.
 */
export function getTextMapZoomScale(
  currentZoom: number,
  referenceZoom: number,
) {
  if (!Number.isFinite(currentZoom) || !Number.isFinite(referenceZoom)) {
    return 1;
  }

  return clampTextNumber(
    2 ** (currentZoom - referenceZoom),
    MIN_TEXT_MAP_SCALE,
    MAX_TEXT_MAP_SCALE,
  );
}

const legacyTextReferenceZoomById = new Map<string, number>();

export function getTextFeatureReferenceZoom(
  feature: DroMapFeature,
  fallbackZoom: number,
) {
  const rawValue = Number(feature.properties?.style?.textReferenceZoom);

  if (Number.isFinite(rawValue)) {
    legacyTextReferenceZoomById.set(feature.id, rawValue);
    return rawValue;
  }

  const cachedZoom = legacyTextReferenceZoomById.get(feature.id);
  if (Number.isFinite(cachedZoom)) {
    return cachedZoom as number;
  }

  const safeFallback = Number.isFinite(fallbackZoom) ? fallbackZoom : 0;
  legacyTextReferenceZoomById.set(feature.id, safeFallback);
  return safeFallback;
}

const TEXT_WIDTH_CHARACTER_RATIO = 0.76;
const TEXT_MAX_SAFETY_WIDTH = 4096;

export type TextBlockMetrics = {
  text: string;
  lines: string[];
  fontSize: number;
  lineHeight: number;
  width: number;
  height: number;
};

export type TextDivIconRender = {
  html: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  metrics: TextBlockMetrics;
};

export function clampTextNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function normalizeTextContent(value: unknown, fallback = DEFAULT_TEXT_CONTENT) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  if (normalized.trim().length === 0) {
    return fallback;
  }

  return normalized;
}

export function getTextFeatureContent(feature: DroMapFeature) {
  return normalizeTextContent(feature.properties?.label, DEFAULT_TEXT_CONTENT);
}

export function getTextFeatureFontSize(feature: DroMapFeature) {
  const rawValue = Number(feature.properties?.style?.fontSize);

  if (!Number.isFinite(rawValue)) {
    return DEFAULT_TEXT_FONT_SIZE;
  }

  return clampTextNumber(rawValue, MIN_TEXT_FONT_SIZE, MAX_TEXT_FONT_SIZE);
}

export function getTextFeatureBold(feature: DroMapFeature) {
  return feature.properties?.style?.textBold === true;
}

export function getTextFeatureItalic(feature: DroMapFeature) {
  return feature.properties?.style?.textItalic === true;
}

export function getTextFeatureRotation(feature: DroMapFeature) {
  const rawValue = Number(feature.properties?.style?.textRotation ?? 0);

  if (!Number.isFinite(rawValue)) {
    return 0;
  }

  return clampTextNumber(rawValue, MIN_TEXT_ROTATION, MAX_TEXT_ROTATION);
}

export function getTextBackgroundEnabled(feature: DroMapFeature) {
  return feature.properties?.style?.textBackgroundEnabled === true;
}

export function getTextBackgroundColor(feature: DroMapFeature) {
  const color = feature.properties?.style?.textBackgroundColor;

  if (typeof color === "string" && isHexColor(color)) {
    return color;
  }

  return DEFAULT_TEXT_BACKGROUND_COLOR;
}

export function getTextBackgroundOpacity(feature: DroMapFeature) {
  const rawValue = Number(feature.properties?.style?.textBackgroundOpacity);

  if (!Number.isFinite(rawValue)) {
    return DEFAULT_TEXT_BACKGROUND_OPACITY;
  }

  return clampTextNumber(rawValue, 0, 1);
}

export function getTextBorderEnabled(feature: DroMapFeature) {
  return feature.properties?.style?.textBorderEnabled === true;
}

export function getTextBorderColor(feature: DroMapFeature) {
  const color = feature.properties?.style?.textBorderColor;

  if (typeof color === "string" && isHexColor(color)) {
    return color;
  }

  return feature.properties?.style?.color ?? DEFAULT_TEXT_BORDER_COLOR;
}

export function getTextBorderWidth(feature: DroMapFeature) {
  const rawValue = Number(feature.properties?.style?.textBorderWidth);

  if (!Number.isFinite(rawValue)) {
    return DEFAULT_TEXT_BORDER_WIDTH;
  }

  return clampTextNumber(rawValue, MIN_TEXT_BORDER_WIDTH, MAX_TEXT_BORDER_WIDTH);
}

export function getTextOutlineEnabled(feature: DroMapFeature) {
  // Les anciens projets ne possèdent pas encore ce champ : le contour blanc
  // est donc activé par défaut, conformément au rendu actuel de DroMap.
  return feature.properties?.style?.textOutlineEnabled !== false;
}

export function getTextOutlineColor(feature: DroMapFeature) {
  const color = feature.properties?.style?.textOutlineColor;

  return typeof color === "string" && isHexColor(color)
    ? color
    : DEFAULT_TEXT_OUTLINE_COLOR;
}

export function getTextOutlineWidth(feature: DroMapFeature) {
  const rawValue = Number(feature.properties?.style?.textOutlineWidth);

  if (!Number.isFinite(rawValue)) {
    return DEFAULT_TEXT_OUTLINE_WIDTH;
  }

  return clampTextNumber(rawValue, MIN_TEXT_OUTLINE_WIDTH, MAX_TEXT_OUTLINE_WIDTH);
}

export function splitTextLines(value: unknown, fallback = DEFAULT_TEXT_CONTENT) {
  return normalizeTextContent(value, fallback).split("\n");
}

function getVisualTextLength(line: string) {
  // Les espaces comptent réellement en rendu `white-space: pre`, donc on ne les supprime pas.
  // Les lignes vides doivent quand même garder une hauteur visible.
  return Math.max(1, line.length);
}

export function measureTextBlock(
  value: unknown,
  fontSize: number,
  options: { minWidth?: number; maxWidth?: number } = {},
): TextBlockMetrics {
  const text = normalizeTextContent(value, DEFAULT_TEXT_CONTENT);
  const lines = text.split("\n");
  const safeFontSize = clampTextNumber(
    fontSize,
    MIN_TEXT_FONT_SIZE,
    Math.max(MAX_TEXT_FONT_SIZE, fontSize),
  );
  const lineHeight = Math.round(safeFontSize * TEXT_LINE_HEIGHT_RATIO);
  const longestLineLength = Math.max(
    1,
    ...lines.map((line) => getVisualTextLength(line)),
  );
  const minWidth = options.minWidth ?? 56;

  // Important : on ne force plus le texte à rentrer dans un maxWidth faible.
  // Le format utilisateur doit être conservé : une ligne tapée sur une ligne reste sur une ligne,
  // même si la taille de police augmente. Les retours à la ligne ne viennent que des \n du texte.
  const estimatedWidth = Math.round(
    longestLineLength * safeFontSize * TEXT_WIDTH_CHARACTER_RATIO +
      TEXT_HORIZONTAL_PADDING,
  );
  const requestedMaxWidth = options.maxWidth ?? TEXT_MAX_SAFETY_WIDTH;
  const safeMaxWidth = Math.max(requestedMaxWidth, estimatedWidth, minWidth);
  const width = clampTextNumber(estimatedWidth, minWidth, safeMaxWidth);
  const height = Math.round(
    lines.length * lineHeight + TEXT_VERTICAL_PADDING,
  );

  return {
    text,
    lines,
    fontSize: safeFontSize,
    lineHeight,
    width,
    height,
  };
}

export function renderTextLinesAsHtml(lines: string[]) {
  return lines
    .map((line) => {
      const content = line.length > 0 ? escapeHtml(line) : "&nbsp;";

      return `<span style="display:block;width:max-content;max-width:none;margin:0 auto;min-height:1em;white-space:pre;overflow:visible;">${content}</span>`;
    })
    .join("");
}

export function getRotatedBoxSize(width: number, height: number, rotation: number) {
  const radians = (Math.abs(rotation) * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));

  return {
    width: Math.ceil(width * cos + height * sin + 8),
    height: Math.ceil(width * sin + height * cos + 8),
  };
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

export function hexToRgba(color: string, opacity = 1) {
  const safeOpacity = clampTextNumber(opacity, 0, 1);
  const fallback = `rgba(17, 24, 39, ${safeOpacity})`;

  if (!isHexColor(color)) {
    return fallback;
  }

  const raw = color.slice(1);
  const normalized =
    raw.length === 3
      ? raw
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : raw;

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  if (![red, green, blue].every(Number.isFinite)) {
    return fallback;
  }

  return `rgba(${red}, ${green}, ${blue}, ${safeOpacity})`;
}

export function createTextDivIconRender(
  feature: DroMapFeature,
  options: { minWidth?: number; maxWidth?: number; scale?: number } = {},
): TextDivIconRender {
  const text = getTextFeatureContent(feature);
  const color = feature.properties.style.color ?? "#111827";
  const opacity = clampTextNumber(feature.properties.style.opacity ?? 1, 0, 1);
  const scale = clampTextNumber(options.scale ?? 1, MIN_TEXT_MAP_SCALE, MAX_TEXT_MAP_SCALE);
  const fontSize = getTextFeatureFontSize(feature) * scale;
  const rotation = getTextFeatureRotation(feature);
  const isBold = getTextFeatureBold(feature);
  const isItalic = getTextFeatureItalic(feature);
  const measuredMetrics = measureTextBlock(text, fontSize, {
    minWidth: options.minWidth ?? 56,
    maxWidth: options.maxWidth ?? 520,
  });
  const widthSafetyFactor = (isBold ? 1.06 : 1) * (isItalic ? 1.04 : 1);
  const metrics = {
    ...measuredMetrics,
    width: Math.ceil(measuredMetrics.width * widthSafetyFactor),
  };
  const rotatedSize = getRotatedBoxSize(metrics.width, metrics.height, rotation);
  const hasBackground = getTextBackgroundEnabled(feature);
  const hasBorder = getTextBorderEnabled(feature);
  const backgroundColor = getTextBackgroundColor(feature);
  const backgroundOpacity = getTextBackgroundOpacity(feature);
  const borderColor = getTextBorderColor(feature);
  const borderWidth = getTextBorderWidth(feature) * scale;
  const hasOutline = getTextOutlineEnabled(feature);
  const outlineColor = getTextOutlineColor(feature);
  const outlineWidth = getTextOutlineWidth(feature) * scale;
  const boxBackground = hasBackground
    ? hexToRgba(backgroundColor, backgroundOpacity)
    : "transparent";
  const boxBorder = hasBorder
    ? `${borderWidth}px solid ${borderColor}`
    : "0 solid transparent";
  const textShadow = hasOutline
    ? "none"
    : hasBackground || hasBorder
      ? "none"
      : "0 1px 3px rgba(255,255,255,0.95), 0 1px 5px rgba(0,0,0,0.25)";
  const textStroke = hasOutline && outlineWidth > 0
    ? `${outlineWidth}px ${outlineColor}`
    : "0 transparent";

  return {
    width: rotatedSize.width,
    height: rotatedSize.height,
    anchorX: rotatedSize.width / 2,
    anchorY: rotatedSize.height / 2,
    metrics,
    html: `
      <span
        style="
          display:block;
          position:relative;
          box-sizing:border-box;
          width:${rotatedSize.width}px;
          min-width:${rotatedSize.width}px;
          height:${rotatedSize.height}px;
          overflow:visible;
          pointer-events:none;
        "
      >
        <span
          class="dromap-text-frame"
          data-dromap-text-frame="true"
          style="
            position:absolute;
            left:50%;
            top:50%;
            display:flex;
            align-items:center;
            justify-content:center;
            box-sizing:border-box;
            width:${metrics.width}px;
            min-width:${metrics.width}px;
            height:${metrics.height}px;
            transform:translate(-50%, -50%) rotate(${rotation}deg);
            transform-origin:center center;
            border-radius:${6 * scale}px;
            background:${boxBackground};
            border:${boxBorder};
            color:${hexToRgba(color, opacity)};
            font-size:${metrics.fontSize}px;
            font-weight:${isBold ? 700 : 400};
            font-style:${isItalic ? "italic" : "normal"};
            line-height:${metrics.lineHeight}px;
            white-space:normal;
            text-align:center;
            -webkit-text-stroke:${textStroke};
            paint-order:stroke fill;
            text-shadow:${textShadow};
            pointer-events:none;
          "
        >
          <span
            data-dromap-text-click-target="true"
            style="display:block;width:max-content;max-width:none;margin:0 auto;pointer-events:auto;"
          >
            ${renderTextLinesAsHtml(metrics.lines)}
          </span>
        </span>
      </span>
    `,
  };
}
