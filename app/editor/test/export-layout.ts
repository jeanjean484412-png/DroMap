import type { DroMapFeature } from "@/lib/dromap/feature";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import type {
  ExportFormat,
  ExportLegendMapPosition,
  ExportLegendPosition,
} from "@/stores/editor-test-export";

import {
  measureExportTextWidth,
  wrapExportTextLines,
  type ExportTextFontWeight,
} from "./export-text-metrics";

export type ExportLatLngPoint = {
  lat: number;
  lng: number;
};

export type ExportCanvasRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ExportLegendAppearance = {
  backgroundColor: string;
  sideWidth: number;
  bottomHeight: number;
  titleFontSize: number;
  itemFontSize: number;
  sectionTitleFontSize: number;
  symbolSize: number;
  itemGap: number;
  labelGap: number;
  labelLineHeight: number;
  sectionGap: number;
  mapBorderEnabled: boolean;
  mapBorderColor: string;
  mapBorderWidth: number;
  mapBorderRadius: number;
  mapPadding: number;
};

export type ExportLegendMapContent = {
  entryLabels: string[];
  sectionLabels: string[];
  entrySymbolSizes?: number[];
  entrySymbolBoxWidths?: number[];
  items?: Array<{
    type: "entry" | "section";
    label: string;
    symbolSize?: number;
    symbolBoxWidth?: number;
    symbolVisualHeight?: number;
  }>;
};

export type ExportLayout = {
  canvasWidth: number;
  canvasHeight: number;
  contentRect: ExportCanvasRect;
  mapAreaRect: ExportCanvasRect;
  mapRect: ExportCanvasRect;
  legendRect: ExportCanvasRect;

  logicalMapSize: {
    width: number;
    height: number;
  };

  mapRenderScale: number;
};

type WorkspaceBoundsPoints = {
  southWest: ExportLatLngPoint;
  northEast: ExportLatLngPoint;
};

type CreateExportLayoutInput = {
  workspaceBounds: WorkspaceBounds;
  legendPosition: ExportLegendPosition;
  legendMapPosition?: ExportLegendMapPosition;
  exportFormat: ExportFormat;
  legendFeaturesCount: number;
  appearance: ExportLegendAppearance;
  mapLegendContent?: ExportLegendMapContent;
};

type OrderLegendFeaturesInput = {
  features: DroMapFeature[];
  hiddenLegendFeatureIds: string[];
  legendFeatureOrder: string[];
};

type ProjectedPoint = {
  x: number;
  y: number;
};

const TILE_SIZE = 256;

export const EXPORT_PAGE_PADDING = 36;
export const EXPORT_LAYOUT_GAP = 32;

export const DEFAULT_LEGEND_BACKGROUND_COLOR = "#ffffff";
export const DEFAULT_LEGEND_SIDE_WIDTH = 420;
export const DEFAULT_LEGEND_BOTTOM_HEIGHT = 0;
export const DEFAULT_LEGEND_TITLE_FONT_SIZE = 32;
export const DEFAULT_LEGEND_ITEM_FONT_SIZE = 24;
export const DEFAULT_LEGEND_SECTION_TITLE_FONT_SIZE = 20;
export const DEFAULT_LEGEND_SYMBOL_SIZE = 48;
export const DEFAULT_LEGEND_ITEM_GAP = 16;
export const DEFAULT_LEGEND_LABEL_GAP = 18;
export const DEFAULT_LEGEND_LABEL_LINE_HEIGHT = 1.2;
export const DEFAULT_LEGEND_SECTION_GAP = 16;
export const DEFAULT_LEGEND_MAP_BORDER_COLOR = "#ffffff";
export const DEFAULT_LEGEND_MAP_BORDER_WIDTH = 1;
export const DEFAULT_LEGEND_MAP_BORDER_RADIUS = 12;
export const DEFAULT_LEGEND_MAP_PADDING = 10;

export const MIN_LEGEND_SIDE_WIDTH = 280;
export const MAX_LEGEND_SIDE_WIDTH = 1600;
export const MIN_LEGEND_BOTTOM_HEIGHT = 220;
export const MAX_LEGEND_BOTTOM_HEIGHT = 1600;
export const MIN_LEGEND_TITLE_FONT_SIZE = 20;
export const MAX_LEGEND_TITLE_FONT_SIZE = 52;
export const MIN_LEGEND_ITEM_FONT_SIZE = 14;
export const MAX_LEGEND_ITEM_FONT_SIZE = 34;
export const MIN_LEGEND_SECTION_TITLE_FONT_SIZE = 12;
export const MAX_LEGEND_SECTION_TITLE_FONT_SIZE = 34;

export const DEFAULT_LEGEND_MAP_POSITION: ExportLegendMapPosition = {
  x: 0,
  y: 0.84,
};
export const DEFAULT_LEGEND_MAP_TITLE_POSITION: ExportLegendMapPosition = {
  x: 0.5,
  y: 0,
};
export const MAP_LEGEND_MARGIN = 0;

const MAP_MAX_WIDTH_WITH_SIDE_LEGEND = 2200;
const MAP_MAX_WIDTH_WITH_BOTTOM_LEGEND = 2450;
const MAP_MAX_HEIGHT = 1300;

export const EXPORT_LOGICAL_MAP_MAX_WIDTH = 1180;
export const EXPORT_LOGICAL_MAP_MAX_HEIGHT = 760;

/**
 * Limite du niveau de détail des tuiles pour la preview et le PNG.
 * Plus la valeur est basse, moins il y a de noms de villes/routes.
 * Commencer à 8. Si c’est encore trop détaillé, passer à 7.
 */
export const EXPORT_BASEMAP_MAX_NATIVE_ZOOM = 8;

const FIXED_EXPORT_SIZES: Record<
  Exclude<ExportFormat, "auto">,
  { width: number; height: number }
> = {
  "16-9": { width: 2400, height: 1350 },
  "4-3": { width: 2200, height: 1650 },
  "a4-landscape": { width: 2400, height: 1697 },
  "a4-portrait": { width: 1697, height: 2400 },
  square: { width: 1800, height: 1800 },
};

export function clampExportNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

export function normalizeExportHexColor(value: string, fallback = "#ffffff") {
  const trimmedValue = value.trim();

  if (/^#[0-9a-fA-F]{6}$/.test(trimmedValue)) {
    return trimmedValue;
  }

  return fallback;
}

export function normalizeLegendAppearance(
  appearance: Partial<ExportLegendAppearance>,
): ExportLegendAppearance {
  return {
    backgroundColor: normalizeExportHexColor(
      appearance.backgroundColor ?? DEFAULT_LEGEND_BACKGROUND_COLOR,
      DEFAULT_LEGEND_BACKGROUND_COLOR,
    ),
    sideWidth: clampExportNumber(
      Number(appearance.sideWidth ?? DEFAULT_LEGEND_SIDE_WIDTH),
      MIN_LEGEND_SIDE_WIDTH,
      MAX_LEGEND_SIDE_WIDTH,
    ),
    bottomHeight:
      Number(appearance.bottomHeight ?? DEFAULT_LEGEND_BOTTOM_HEIGHT) === 0
        ? 0
        : clampExportNumber(
            Number(appearance.bottomHeight ?? DEFAULT_LEGEND_BOTTOM_HEIGHT),
            MIN_LEGEND_BOTTOM_HEIGHT,
            MAX_LEGEND_BOTTOM_HEIGHT,
          ),
    titleFontSize: clampExportNumber(
      Number(appearance.titleFontSize ?? DEFAULT_LEGEND_TITLE_FONT_SIZE),
      MIN_LEGEND_TITLE_FONT_SIZE,
      MAX_LEGEND_TITLE_FONT_SIZE,
    ),
    itemFontSize: clampExportNumber(
      Number(appearance.itemFontSize ?? DEFAULT_LEGEND_ITEM_FONT_SIZE),
      MIN_LEGEND_ITEM_FONT_SIZE,
      MAX_LEGEND_ITEM_FONT_SIZE,
    ),
    sectionTitleFontSize: clampExportNumber(
      Number(
        appearance.sectionTitleFontSize ??
          DEFAULT_LEGEND_SECTION_TITLE_FONT_SIZE,
      ),
      MIN_LEGEND_SECTION_TITLE_FONT_SIZE,
      MAX_LEGEND_SECTION_TITLE_FONT_SIZE,
    ),
    symbolSize: clampExportNumber(
      Number(appearance.symbolSize ?? DEFAULT_LEGEND_SYMBOL_SIZE),
      24,
      144,
    ),
    itemGap: clampExportNumber(
      Number(appearance.itemGap ?? DEFAULT_LEGEND_ITEM_GAP),
      0,
      40,
    ),
    labelGap: clampExportNumber(
      Number(appearance.labelGap ?? DEFAULT_LEGEND_LABEL_GAP),
      0,
      48,
    ),
    labelLineHeight: clampExportNumber(
      Number(appearance.labelLineHeight ?? DEFAULT_LEGEND_LABEL_LINE_HEIGHT),
      0.8,
      1.8,
    ),
    sectionGap: clampExportNumber(
      Number(appearance.sectionGap ?? DEFAULT_LEGEND_SECTION_GAP),
      0,
      48,
    ),
    mapBorderEnabled: appearance.mapBorderEnabled !== false,
    mapBorderColor: normalizeExportHexColor(
      appearance.mapBorderColor ?? DEFAULT_LEGEND_MAP_BORDER_COLOR,
      DEFAULT_LEGEND_MAP_BORDER_COLOR,
    ),
    mapBorderWidth: clampExportNumber(
      Number(appearance.mapBorderWidth ?? DEFAULT_LEGEND_MAP_BORDER_WIDTH),
      1,
      12,
    ),
    mapBorderRadius: clampExportNumber(
      Number(appearance.mapBorderRadius ?? DEFAULT_LEGEND_MAP_BORDER_RADIUS),
      0,
      40,
    ),
    mapPadding: clampExportNumber(
      Number(appearance.mapPadding ?? DEFAULT_LEGEND_MAP_PADDING),
      0,
      48,
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readLatLngPoint(value: unknown): ExportLatLngPoint | null {
  if (!isRecord(value)) {
    return null;
  }

  const lat = value.lat;
  const lng = value.lng;

  if (typeof lat !== "number" || typeof lng !== "number") {
    return null;
  }

  return { lat, lng };
}

export function getWorkspaceBoundsPoints(
  workspaceBounds: WorkspaceBounds | null,
): WorkspaceBoundsPoints | null {
  if (!workspaceBounds || !isRecord(workspaceBounds)) {
    return null;
  }

  const southWest =
    readLatLngPoint(workspaceBounds.southWest) ??
    readLatLngPoint(workspaceBounds.sw) ??
    readLatLngPoint(workspaceBounds._southWest);

  const northEast =
    readLatLngPoint(workspaceBounds.northEast) ??
    readLatLngPoint(workspaceBounds.ne) ??
    readLatLngPoint(workspaceBounds._northEast);

  if (southWest && northEast) {
    return { southWest, northEast };
  }

  const south = workspaceBounds.south;
  const west = workspaceBounds.west;
  const north = workspaceBounds.north;
  const east = workspaceBounds.east;

  if (
    typeof south === "number" &&
    typeof west === "number" &&
    typeof north === "number" &&
    typeof east === "number"
  ) {
    return {
      southWest: { lat: south, lng: west },
      northEast: { lat: north, lng: east },
    };
  }

  return null;
}

function clampLatitude(lat: number) {
  return Math.max(-85.05112878, Math.min(85.05112878, lat));
}

export function projectLatLng(
  lat: number,
  lng: number,
  zoom: number,
): ProjectedPoint {
  const clampedLat = clampLatitude(lat);
  const sin = Math.sin((clampedLat * Math.PI) / 180);
  const scale = TILE_SIZE * 2 ** zoom;

  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

export function getProjectedBounds(
  points: WorkspaceBoundsPoints,
  zoom: number,
) {
  const northWest = projectLatLng(
    points.northEast.lat,
    points.southWest.lng,
    zoom,
  );

  const southEast = projectLatLng(
    points.southWest.lat,
    points.northEast.lng,
    zoom,
  );

  return {
    northWest,
    southEast,
    width: Math.abs(southEast.x - northWest.x),
    height: Math.abs(southEast.y - northWest.y),
  };
}

function getProjectedAspectRatio(points: WorkspaceBoundsPoints) {
  const projectedBounds = getProjectedBounds(points, 0);

  if (projectedBounds.width === 0 || projectedBounds.height === 0) {
    return 4 / 3;
  }

  return projectedBounds.width / projectedBounds.height;
}

/**
 * Niveau de zoom visuel réellement utilisé pour faire tenir la zone de
 * travail dans le rectangle de carte. Leaflet et le moteur canvas suivent le
 * même principe : la taille des objets liés au zoom doit donc être calculée à
 * partir de cette valeur, et non à partir du zoom de détail du fond.
 */
export function getExportMapVisualZoom(
  workspaceBounds: WorkspaceBounds | null,
  mapRect: ExportCanvasRect,
) {
  const points = getWorkspaceBoundsPoints(workspaceBounds);

  if (!points || mapRect.width <= 0 || mapRect.height <= 0) {
    return null;
  }

  const projectedBounds = getProjectedBounds(points, 0);

  if (projectedBounds.width <= 0 || projectedBounds.height <= 0) {
    return null;
  }

  const fitScale = Math.min(
    mapRect.width / projectedBounds.width,
    mapRect.height / projectedBounds.height,
  );

  if (!Number.isFinite(fitScale) || fitScale <= 0) {
    return null;
  }

  return Math.log2(fitScale);
}

function fitSizeToAspectRatio(
  aspectRatio: number,
  maxWidth: number,
  maxHeight: number,
) {
  if (aspectRatio >= maxWidth / maxHeight) {
    return {
      width: maxWidth,
      height: Math.round(maxWidth / aspectRatio),
    };
  }

  return {
    width: Math.round(maxHeight * aspectRatio),
    height: maxHeight,
  };
}

function centerSizeInRect(
  size: { width: number; height: number },
  rect: ExportCanvasRect,
): ExportCanvasRect {
  return {
    x: Math.round(rect.x + (rect.width - size.width) / 2),
    y: Math.round(rect.y + (rect.height - size.height) / 2),
    width: size.width,
    height: size.height,
  };
}

function getLogicalMapSize(mapRect: ExportCanvasRect, aspectRatio: number) {
  const maxLogicalWidth = Math.min(mapRect.width, EXPORT_LOGICAL_MAP_MAX_WIDTH);
  const maxLogicalHeight = Math.min(
    mapRect.height,
    EXPORT_LOGICAL_MAP_MAX_HEIGHT,
  );

  return fitSizeToAspectRatio(aspectRatio, maxLogicalWidth, maxLogicalHeight);
}

function withMapRenderScale(
  layout: Omit<ExportLayout, "logicalMapSize" | "mapRenderScale">,
  points: WorkspaceBoundsPoints,
): ExportLayout {
  const aspectRatio = getProjectedAspectRatio(points);
  const logicalMapSize = getLogicalMapSize(layout.mapRect, aspectRatio);

  const mapRenderScale =
    logicalMapSize.width > 0
      ? Math.max(1, layout.mapRect.width / logicalMapSize.width)
      : 1;

  return {
    ...layout,
    logicalMapSize,
    mapRenderScale,
  };
}

export function getEstimatedLegendItemHeight(
  appearance: ExportLegendAppearance,
) {
  const typeFontSize = clampExportNumber(
    Math.round(appearance.itemFontSize * 0.78),
    12,
    26,
  );
  const symbolSize = clampExportNumber(appearance.symbolSize, 24, 144);

  return Math.max(symbolSize + 10, appearance.itemFontSize + typeFontSize + 14);
}

export function getEstimatedLegendHeight(
  featuresCount: number,
  appearance: ExportLegendAppearance,
) {
  const padding = clampExportNumber(
    Math.round(appearance.itemFontSize * 1.35),
    22,
    42,
  );
  const itemGap = appearance.itemGap;
  const itemHeight = getEstimatedLegendItemHeight(appearance);

  return Math.max(
    260,
    padding * 2 +
      appearance.titleFontSize +
      itemGap +
      Math.max(1, featuresCount) * (itemHeight + itemGap),
  );
}

function estimateLegendTextWidth(
  text: string,
  fontSize: number,
  fontWeight: ExportTextFontWeight = 400,
) {
  return Math.max(
    0,
    ...text
      .split(/\r?\n/)
      .map((line) => measureExportTextWidth(line, fontSize, fontWeight)),
  );
}

function estimateWrappedLineCount(
  text: string,
  maxWidth: number,
  fontSize: number,
  fontWeight: ExportTextFontWeight = 400,
) {
  return Math.max(
    1,
    wrapExportTextLines(text, maxWidth, fontSize, fontWeight).length,
  );
}

export function createMapLegendTitleRect(
  mapRect: ExportCanvasRect,
  appearance: ExportLegendAppearance,
  position: ExportLegendMapPosition = DEFAULT_LEGEND_MAP_TITLE_POSITION,
  title = "Légende",
): ExportCanvasRect {
  const safePosition = {
    x: clampExportNumber(position.x, 0, 1),
    y: clampExportNumber(position.y, 0, 1),
  };
  const availableWidth = Math.max(1, mapRect.width - MAP_LEGEND_MARGIN * 2);
  const availableHeight = Math.max(1, mapRect.height - MAP_LEGEND_MARGIN * 2);
  const titlePadding = Math.max(2, appearance.mapPadding);
  const preferredWidth = Math.max(
    120,
    Math.round(
      estimateLegendTextWidth(title, appearance.titleFontSize, 700) +
        titlePadding * 2 +
        12,
    ),
  );
  const width = Math.min(availableWidth, preferredWidth);
  const lineCount = estimateWrappedLineCount(
    title,
    Math.max(1, width - titlePadding * 2),
    appearance.titleFontSize,
    700,
  );
  const height = Math.min(
    availableHeight,
    Math.max(
      appearance.titleFontSize + titlePadding * 2,
      Math.round(
        lineCount * appearance.titleFontSize * 1.2 + titlePadding * 2 + 8,
      ),
    ),
  );
  const edgeBleed = titlePadding;
  const availableX = Math.max(0, availableWidth - width + edgeBleed * 2);
  const availableY = Math.max(0, availableHeight - height + edgeBleed * 2);

  return {
    x: mapRect.x + MAP_LEGEND_MARGIN - edgeBleed + availableX * safePosition.x,
    y: mapRect.y + MAP_LEGEND_MARGIN - edgeBleed + availableY * safePosition.y,
    width,
    height,
  };
}

function getEstimatedMarkerSymbolBoxWidth(symbolSize: number) {
  const safeSymbolSize = clampExportNumber(symbolSize, 12, 300);

  // Les marqueurs sont maintenant rendus à leur taille visuelle exacte dans
  // la preview et dans l'export. La colonne de légende doit donc réserver leur
  // diamètre réel, même lorsqu'il dépasse largement les anciennes limites.
  return clampExportNumber(Math.ceil(safeSymbolSize) + 2, 18, 302);
}

function getEstimatedMapLegendLabelOffset(
  appearance: ExportLegendAppearance,
  symbolSizes: number[] | undefined,
  symbolBoxWidths: number[] | undefined,
) {
  const baseSymbolBoxWidth = getEstimatedMarkerSymbolBoxWidth(
    appearance.symbolSize,
  );
  const fallbackWidths = (symbolSizes ?? []).map((symbolSize) =>
    getEstimatedMarkerSymbolBoxWidth(symbolSize),
  );
  const maxSymbolBoxWidth = Math.max(
    baseSymbolBoxWidth,
    ...fallbackWidths,
    ...(symbolBoxWidths ?? []).filter(Number.isFinite),
  );

  // Même règle que createExportLegendLayout : aucune marge supplémentaire
  // tant que le figuré tient dans la colonne normale. En cas de dépassement,
  // la colonne est décalée uniquement de ce qui est strictement nécessaire.
  const overflowShift = Math.max(
    0,
    (maxSymbolBoxWidth - baseSymbolBoxWidth) / 2,
  );
  const symbolAnchor = baseSymbolBoxWidth / 2 + overflowShift;
  const symbolColumnRight = symbolAnchor + maxSymbolBoxWidth / 2;

  return symbolColumnRight + appearance.labelGap;
}

function getEstimatedMapLegendHeight(
  content: ExportLegendMapContent | undefined,
  width: number,
  appearance: ExportLegendAppearance,
) {
  const borderInset = appearance.mapBorderEnabled
    ? appearance.mapBorderWidth
    : 0;
  const contentInset = appearance.mapPadding + borderInset;
  const innerWidth = Math.max(1, width - contentInset * 2);
  const labelOffset = getEstimatedMapLegendLabelOffset(
    appearance,
    content?.entrySymbolSizes,
    content?.entrySymbolBoxWidths ??
      content?.items
        ?.filter((item) => item.type === "entry")
        .map((item) => Number(item.symbolBoxWidth))
        .filter(Number.isFinite),
  );
  const labelWidth = Math.max(1, innerWidth - labelOffset);
  const lineHeight = Math.max(
    1,
    Math.round(appearance.itemFontSize * appearance.labelLineHeight),
  );
  const orderedItems: NonNullable<ExportLegendMapContent["items"]> =
    content?.items ?? [
      ...(content?.sectionLabels ?? []).map((label) => ({
        type: "section" as const,
        label,
      })),
      ...(content?.entryLabels ?? []).map((label) => ({
        type: "entry" as const,
        label,
      })),
    ];

  const contentHeight = orderedItems.reduce((total, item, index) => {
    const gap =
      index === 0
        ? 0
        : item.type === "section"
          ? appearance.sectionGap
          : appearance.itemGap;

    if (item.type === "section") {
      const lines = estimateWrappedLineCount(
        item.label,
        innerWidth,
        appearance.sectionTitleFontSize,
        700,
      );
      const height = Math.max(
        appearance.sectionTitleFontSize + 4,
        Math.ceil(lines * appearance.sectionTitleFontSize * 1.2 + 8),
      );

      return total + gap + height;
    }

    const lines = estimateWrappedLineCount(
      item.label || "Sans nom",
      labelWidth,
      appearance.itemFontSize,
    );
    const symbolVisualHeight = clampExportNumber(
      Number(
        item.symbolVisualHeight ?? item.symbolSize ?? appearance.symbolSize,
      ),
      1,
      300,
    );
    const height = Math.max(symbolVisualHeight, Math.ceil(lines * lineHeight));

    return total + gap + height;
  }, 0);

  return Math.max(1, Math.ceil(contentInset * 2 + contentHeight));
}

function normalizeLegendMapPosition(
  position: ExportLegendMapPosition | undefined,
): ExportLegendMapPosition {
  return {
    x: clampExportNumber(position?.x ?? DEFAULT_LEGEND_MAP_POSITION.x, 0, 1),
    y: clampExportNumber(position?.y ?? DEFAULT_LEGEND_MAP_POSITION.y, 0, 1),
  };
}

function createMapOverlayLegendRect(
  mapRect: ExportCanvasRect,
  legendFeaturesCount: number,
  appearance: ExportLegendAppearance,
  position: ExportLegendMapPosition | undefined,
  content?: ExportLegendMapContent,
): ExportCanvasRect {
  const safePosition = normalizeLegendMapPosition(position);
  const maxWidth = Math.max(1, mapRect.width - MAP_LEGEND_MARGIN * 2);
  const availableMapHeight = Math.max(
    1,
    mapRect.height - MAP_LEGEND_MARGIN * 2,
  );
  const borderInset = appearance.mapBorderEnabled
    ? appearance.mapBorderWidth
    : 0;
  const horizontalInset = appearance.mapPadding + borderInset;
  const entryLabels =
    content?.items
      ?.filter((item) => item.type === "entry")
      .map((item) => item.label) ??
    content?.entryLabels ??
    [];
  const sectionLabels =
    content?.items
      ?.filter((item) => item.type === "section")
      .map((item) => item.label) ??
    content?.sectionLabels ??
    [];
  const longestEntryWidth = Math.max(
    0,
    ...entryLabels.map((label) =>
      estimateLegendTextWidth(label || "Sans nom", appearance.itemFontSize),
    ),
  );
  const longestSectionWidth = Math.max(
    0,
    ...sectionLabels.map((label) =>
      estimateLegendTextWidth(label, appearance.sectionTitleFontSize, 700),
    ),
  );
  const labelOffset = getEstimatedMapLegendLabelOffset(
    appearance,
    content?.entrySymbolSizes,
    content?.entrySymbolBoxWidths ??
      content?.items
        ?.filter((item) => item.type === "entry")
        .map((item) => Number(item.symbolBoxWidth))
        .filter(Number.isFinite),
  );
  const preferredWidth = Math.ceil(
    horizontalInset * 2 +
      Math.max(longestSectionWidth, labelOffset + longestEntryWidth) +
      16,
  );
  const fallbackWidth = Math.min(maxWidth, Math.max(160, appearance.sideWidth));
  const width = clampExportNumber(
    Number.isFinite(preferredWidth) && preferredWidth > horizontalInset * 2
      ? preferredWidth
      : fallbackWidth,
    Math.min(96, maxWidth),
    maxWidth,
  );
  const estimatedHeight = getEstimatedMapLegendHeight(
    content ?? {
      entryLabels: Array.from(
        { length: legendFeaturesCount },
        () => "Élément de légende",
      ),
      sectionLabels: [],
    },
    width,
    appearance,
  );
  const height = clampExportNumber(
    estimatedHeight,
    Math.min(48, availableMapHeight),
    availableMapHeight,
  );
  const edgeBleed = appearance.mapBorderEnabled
    ? 0
    : Math.max(0, appearance.mapPadding);
  const availableX = Math.max(0, maxWidth - width + edgeBleed * 2);
  const availableY = Math.max(0, availableMapHeight - height + edgeBleed * 2);

  return {
    x: mapRect.x + MAP_LEGEND_MARGIN - edgeBleed + availableX * safePosition.x,
    y: mapRect.y + MAP_LEGEND_MARGIN - edgeBleed + availableY * safePosition.y,
    width,
    height,
  };
}

function getRequiredSideLegendWidth(
  appearance: ExportLegendAppearance,
  content?: ExportLegendMapContent,
) {
  const padding = clampExportNumber(
    Math.round(appearance.itemFontSize * 1.35),
    22,
    42,
  );
  const entryItems =
    content?.items?.filter((item) => item.type === "entry") ??
    (content?.entryLabels ?? []).map((label, index) => ({
      type: "entry" as const,
      label,
      symbolSize: content?.entrySymbolSizes?.[index],
      symbolBoxWidth: content?.entrySymbolBoxWidths?.[index],
    }));
  const maxSymbolWidth = Math.max(
    getEstimatedMarkerSymbolBoxWidth(appearance.symbolSize),
    ...entryItems.map((item) =>
      Number.isFinite(Number(item.symbolBoxWidth))
        ? Number(item.symbolBoxWidth)
        : getEstimatedMarkerSymbolBoxWidth(
            Number(item.symbolSize ?? appearance.symbolSize),
          ),
    ),
  );
  const maxLabelWidth = Math.max(
    120,
    ...entryItems.map((item) =>
      estimateLegendTextWidth(
        item.label || "Sans nom",
        appearance.itemFontSize,
      ),
    ),
    ...(content?.sectionLabels ?? []).map((label) =>
      estimateLegendTextWidth(label, appearance.sectionTitleFontSize, 700),
    ),
  );

  return Math.ceil(
    padding * 2 +
      maxSymbolWidth +
      appearance.labelGap +
      Math.min(maxLabelWidth, 520) +
      18,
  );
}

function getRequiredBottomLegendHeight(
  appearance: ExportLegendAppearance,
  content?: ExportLegendMapContent,
) {
  const padding = clampExportNumber(
    Math.round(appearance.itemFontSize * 1.35),
    22,
    42,
  );
  const entryItems =
    content?.items?.filter((item) => item.type === "entry") ?? [];
  const maxVisualHeight = Math.max(
    appearance.symbolSize,
    ...entryItems.map((item) =>
      Number(
        item.symbolVisualHeight ?? item.symbolSize ?? appearance.symbolSize,
      ),
    ),
  );

  return Math.ceil(
    padding * 2 +
      appearance.titleFontSize +
      Math.max(14, appearance.itemGap) +
      maxVisualHeight +
      12,
  );
}

function createAutoExportLayout(
  points: WorkspaceBoundsPoints,
  legendPosition: ExportLegendPosition,
  legendMapPosition: ExportLegendMapPosition | undefined,
  legendFeaturesCount: number,
  appearance: ExportLegendAppearance,
  mapLegendContent?: ExportLegendMapContent,
): ExportLayout {
  const aspectRatio = getProjectedAspectRatio(points);

  const maxMapWidth =
    legendPosition === "bottom"
      ? MAP_MAX_WIDTH_WITH_BOTTOM_LEGEND
      : MAP_MAX_WIDTH_WITH_SIDE_LEGEND;

  const mapSize = fitSizeToAspectRatio(
    aspectRatio,
    maxMapWidth,
    MAP_MAX_HEIGHT,
  );

  if (legendPosition === "map") {
    const mapRect = {
      x: EXPORT_PAGE_PADDING,
      y: EXPORT_PAGE_PADDING,
      width: mapSize.width,
      height: mapSize.height,
    };

    return withMapRenderScale(
      {
        canvasWidth: EXPORT_PAGE_PADDING * 2 + mapSize.width,
        canvasHeight: EXPORT_PAGE_PADDING * 2 + mapSize.height,
        contentRect: mapRect,
        mapAreaRect: mapRect,
        mapRect,
        legendRect: createMapOverlayLegendRect(
          mapRect,
          legendFeaturesCount,
          appearance,
          legendMapPosition,
          mapLegendContent,
        ),
      },
      points,
    );
  }

  if (legendPosition === "bottom") {
    const autoLegendHeight = Math.max(
      getEstimatedLegendHeight(legendFeaturesCount, appearance),
      getRequiredBottomLegendHeight(appearance, mapLegendContent),
    );
    const legendHeight =
      appearance.bottomHeight === 0
        ? autoLegendHeight
        : Math.max(
            appearance.bottomHeight,
            getRequiredBottomLegendHeight(appearance, mapLegendContent),
          );

    const canvasWidth = EXPORT_PAGE_PADDING * 2 + mapSize.width;
    const canvasHeight =
      EXPORT_PAGE_PADDING * 2 +
      mapSize.height +
      EXPORT_LAYOUT_GAP +
      legendHeight;

    const mapRect = {
      x: EXPORT_PAGE_PADDING,
      y: EXPORT_PAGE_PADDING,
      width: mapSize.width,
      height: mapSize.height,
    };

    return withMapRenderScale(
      {
        canvasWidth,
        canvasHeight,
        contentRect: {
          x: EXPORT_PAGE_PADDING,
          y: EXPORT_PAGE_PADDING,
          width: mapSize.width,
          height: mapSize.height + EXPORT_LAYOUT_GAP + legendHeight,
        },
        mapAreaRect: mapRect,
        mapRect,
        legendRect: {
          x: EXPORT_PAGE_PADDING,
          y: EXPORT_PAGE_PADDING + mapSize.height + EXPORT_LAYOUT_GAP,
          width: mapSize.width,
          height: legendHeight,
        },
      },
      points,
    );
  }

  const effectiveSideWidth = clampExportNumber(
    Math.max(
      appearance.sideWidth,
      getRequiredSideLegendWidth(appearance, mapLegendContent),
    ),
    MIN_LEGEND_SIDE_WIDTH,
    MAX_LEGEND_SIDE_WIDTH,
  );
  const canvasWidth =
    EXPORT_PAGE_PADDING * 2 +
    mapSize.width +
    EXPORT_LAYOUT_GAP +
    effectiveSideWidth;
  const canvasHeight = EXPORT_PAGE_PADDING * 2 + mapSize.height;

  if (legendPosition === "left") {
    const mapRect = {
      x: EXPORT_PAGE_PADDING + effectiveSideWidth + EXPORT_LAYOUT_GAP,
      y: EXPORT_PAGE_PADDING,
      width: mapSize.width,
      height: mapSize.height,
    };

    return withMapRenderScale(
      {
        canvasWidth,
        canvasHeight,
        contentRect: {
          x: EXPORT_PAGE_PADDING,
          y: EXPORT_PAGE_PADDING,
          width: effectiveSideWidth + EXPORT_LAYOUT_GAP + mapSize.width,
          height: mapSize.height,
        },
        mapAreaRect: mapRect,
        mapRect,
        legendRect: {
          x: EXPORT_PAGE_PADDING,
          y: EXPORT_PAGE_PADDING,
          width: effectiveSideWidth,
          height: mapSize.height,
        },
      },
      points,
    );
  }

  const mapRect = {
    x: EXPORT_PAGE_PADDING,
    y: EXPORT_PAGE_PADDING,
    width: mapSize.width,
    height: mapSize.height,
  };

  return withMapRenderScale(
    {
      canvasWidth,
      canvasHeight,
      contentRect: {
        x: EXPORT_PAGE_PADDING,
        y: EXPORT_PAGE_PADDING,
        width: mapSize.width + EXPORT_LAYOUT_GAP + effectiveSideWidth,
        height: mapSize.height,
      },
      mapAreaRect: mapRect,
      mapRect,
      legendRect: {
        x: EXPORT_PAGE_PADDING + mapSize.width + EXPORT_LAYOUT_GAP,
        y: EXPORT_PAGE_PADDING,
        width: effectiveSideWidth,
        height: mapSize.height,
      },
    },
    points,
  );
}

function createFixedExportLayout(
  points: WorkspaceBoundsPoints,
  legendPosition: ExportLegendPosition,
  legendMapPosition: ExportLegendMapPosition | undefined,
  legendFeaturesCount: number,
  exportFormat: Exclude<ExportFormat, "auto">,
  appearance: ExportLegendAppearance,
  mapLegendContent?: ExportLegendMapContent,
): ExportLayout {
  const { width: canvasWidth, height: canvasHeight } =
    FIXED_EXPORT_SIZES[exportFormat];

  const aspectRatio = getProjectedAspectRatio(points);
  const contentRect: ExportCanvasRect = {
    x: EXPORT_PAGE_PADDING,
    y: EXPORT_PAGE_PADDING,
    width: canvasWidth - EXPORT_PAGE_PADDING * 2,
    height: canvasHeight - EXPORT_PAGE_PADDING * 2,
  };

  if (legendPosition === "map") {
    const mapSize = fitSizeToAspectRatio(
      aspectRatio,
      contentRect.width,
      contentRect.height,
    );
    const mapRect = centerSizeInRect(mapSize, contentRect);

    return withMapRenderScale(
      {
        canvasWidth,
        canvasHeight,
        contentRect,
        mapAreaRect: contentRect,
        mapRect,
        legendRect: createMapOverlayLegendRect(
          mapRect,
          legendFeaturesCount,
          appearance,
          legendMapPosition,
          mapLegendContent,
        ),
      },
      points,
    );
  }

  if (legendPosition === "bottom") {
    const autoLegendHeight = Math.max(
      getEstimatedLegendHeight(legendFeaturesCount, appearance),
      getRequiredBottomLegendHeight(appearance, mapLegendContent),
    );

    const maxBottomHeight = Math.max(
      220,
      Math.round(contentRect.height * 0.72),
    );
    const requiredBottomHeight = getRequiredBottomLegendHeight(
      appearance,
      mapLegendContent,
    );
    const legendHeight =
      appearance.bottomHeight === 0
        ? clampExportNumber(autoLegendHeight, 220, maxBottomHeight)
        : clampExportNumber(
            Math.max(appearance.bottomHeight, requiredBottomHeight),
            220,
            maxBottomHeight,
          );

    const mapAreaRect: ExportCanvasRect = {
      x: contentRect.x,
      y: contentRect.y,
      width: contentRect.width,
      height: Math.max(
        220,
        contentRect.height - EXPORT_LAYOUT_GAP - legendHeight,
      ),
    };

    const mapSize = fitSizeToAspectRatio(
      aspectRatio,
      mapAreaRect.width,
      mapAreaRect.height,
    );
    const mapRect = centerSizeInRect(mapSize, mapAreaRect);

    return withMapRenderScale(
      {
        canvasWidth,
        canvasHeight,
        contentRect,
        mapAreaRect,
        mapRect,
        legendRect: {
          x: contentRect.x,
          y: canvasHeight - EXPORT_PAGE_PADDING - legendHeight,
          width: contentRect.width,
          height: legendHeight,
        },
      },
      points,
    );
  }

  const maxSideWidth = Math.min(
    MAX_LEGEND_SIDE_WIDTH,
    Math.max(
      MIN_LEGEND_SIDE_WIDTH,
      contentRect.width - EXPORT_LAYOUT_GAP - 360,
    ),
  );
  const legendWidth = clampExportNumber(
    Math.max(
      appearance.sideWidth,
      getRequiredSideLegendWidth(appearance, mapLegendContent),
    ),
    MIN_LEGEND_SIDE_WIDTH,
    maxSideWidth,
  );
  const mapAreaWidth = Math.max(
    360,
    contentRect.width - EXPORT_LAYOUT_GAP - legendWidth,
  );

  const mapAreaRect: ExportCanvasRect = {
    x:
      legendPosition === "left"
        ? contentRect.x + legendWidth + EXPORT_LAYOUT_GAP
        : contentRect.x,
    y: contentRect.y,
    width: mapAreaWidth,
    height: contentRect.height,
  };

  const mapSize = fitSizeToAspectRatio(
    aspectRatio,
    mapAreaRect.width,
    mapAreaRect.height,
  );
  const mapRect = centerSizeInRect(mapSize, mapAreaRect);

  if (legendPosition === "left") {
    return withMapRenderScale(
      {
        canvasWidth,
        canvasHeight,
        contentRect,
        mapAreaRect,
        mapRect,
        legendRect: {
          x: contentRect.x,
          y: contentRect.y,
          width: legendWidth,
          height: contentRect.height,
        },
      },
      points,
    );
  }

  return withMapRenderScale(
    {
      canvasWidth,
      canvasHeight,
      contentRect,
      mapAreaRect,
      mapRect,
      legendRect: {
        x: contentRect.x + mapAreaWidth + EXPORT_LAYOUT_GAP,
        y: contentRect.y,
        width: legendWidth,
        height: contentRect.height,
      },
    },
    points,
  );
}

export function createExportLayout(
  input: CreateExportLayoutInput,
): ExportLayout | null {
  const points = getWorkspaceBoundsPoints(input.workspaceBounds);

  if (!points) {
    return null;
  }

  const appearance = normalizeLegendAppearance(input.appearance);

  if (input.exportFormat === "auto") {
    return createAutoExportLayout(
      points,
      input.legendPosition,
      input.legendMapPosition,
      input.legendFeaturesCount,
      appearance,
      input.mapLegendContent,
    );
  }

  return createFixedExportLayout(
    points,
    input.legendPosition,
    input.legendMapPosition,
    input.legendFeaturesCount,
    input.exportFormat,
    appearance,
    input.mapLegendContent,
  );
}

export function getOrderedLegendFeatures(
  features: DroMapFeature[],
  legendFeatureOrder: string[],
) {
  const featureById = new Map(features.map((feature) => [feature.id, feature]));

  const orderedFeatures = legendFeatureOrder
    .map((featureId) => featureById.get(featureId))
    .filter((feature): feature is DroMapFeature => feature !== undefined);

  const orderedFeatureIds = new Set(
    orderedFeatures.map((feature) => feature.id),
  );

  const missingFeatures = features.filter(
    (feature) => !orderedFeatureIds.has(feature.id),
  );

  return [...orderedFeatures, ...missingFeatures];
}

export function getVisibleLegendFeatures(input: OrderLegendFeaturesInput) {
  const hiddenFeatureIds = new Set(input.hiddenLegendFeatureIds);

  return getOrderedLegendFeatures(
    input.features,
    input.legendFeatureOrder,
  ).filter((feature) => !hiddenFeatureIds.has(feature.id));
}

export function getExportFormatLabel(format: ExportFormat) {
  if (format === "16-9") return "16:9 paysage";
  if (format === "4-3") return "4:3 paysage";
  if (format === "a4-landscape") return "A4 paysage";
  if (format === "a4-portrait") return "A4 portrait";
  if (format === "square") return "Carré";

  return "Automatique";
}

export function getSafeLegendTitle(title: string) {
  return title.trim();
}
