import type { DroMapFeature } from "@/lib/dromap/feature";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import type {
  ExportFormat,
  ExportLegendPosition,
} from "@/stores/editor-test-export";

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
  exportFormat: ExportFormat;
  legendFeaturesCount: number;
  appearance: ExportLegendAppearance;
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

export const MIN_LEGEND_SIDE_WIDTH = 280;
export const MAX_LEGEND_SIDE_WIDTH = 720;
export const MIN_LEGEND_BOTTOM_HEIGHT = 220;
export const MAX_LEGEND_BOTTOM_HEIGHT = 820;
export const MIN_LEGEND_TITLE_FONT_SIZE = 20;
export const MAX_LEGEND_TITLE_FONT_SIZE = 52;
export const MIN_LEGEND_ITEM_FONT_SIZE = 14;
export const MAX_LEGEND_ITEM_FONT_SIZE = 34;
export const MIN_LEGEND_SECTION_TITLE_FONT_SIZE = 12;
export const MAX_LEGEND_SECTION_TITLE_FONT_SIZE = 34;

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
      Number(appearance.sectionTitleFontSize ?? DEFAULT_LEGEND_SECTION_TITLE_FONT_SIZE),
      MIN_LEGEND_SECTION_TITLE_FONT_SIZE,
      MAX_LEGEND_SECTION_TITLE_FONT_SIZE,
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

export function getProjectedBounds(points: WorkspaceBoundsPoints, zoom: number) {
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

  return fitSizeToAspectRatio(
    aspectRatio,
    maxLogicalWidth,
    maxLogicalHeight,
  );
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
  const symbolSize = clampExportNumber(
    Math.round(appearance.itemFontSize * 1.55),
    30,
    56,
  );

  return Math.max(
    symbolSize + 8,
    appearance.itemFontSize + typeFontSize + 14,
  );
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
  const itemGap = clampExportNumber(
    Math.round(appearance.itemFontSize * 0.95),
    18,
    38,
  );
  const itemHeight = getEstimatedLegendItemHeight(appearance);

  return Math.max(
    260,
    padding * 2 +
      appearance.titleFontSize +
      itemGap +
      Math.max(1, featuresCount) * (itemHeight + itemGap),
  );
}

function createAutoExportLayout(
  points: WorkspaceBoundsPoints,
  legendPosition: ExportLegendPosition,
  legendFeaturesCount: number,
  appearance: ExportLegendAppearance,
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

  if (legendPosition === "bottom") {
    const autoLegendHeight = getEstimatedLegendHeight(
      legendFeaturesCount,
      appearance,
    );
    const legendHeight =
      appearance.bottomHeight === 0 ? autoLegendHeight : appearance.bottomHeight;

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

  const canvasWidth =
    EXPORT_PAGE_PADDING * 2 +
    mapSize.width +
    EXPORT_LAYOUT_GAP +
    appearance.sideWidth;
  const canvasHeight = EXPORT_PAGE_PADDING * 2 + mapSize.height;

  if (legendPosition === "left") {
    const mapRect = {
      x: EXPORT_PAGE_PADDING + appearance.sideWidth + EXPORT_LAYOUT_GAP,
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
          width: appearance.sideWidth + EXPORT_LAYOUT_GAP + mapSize.width,
          height: mapSize.height,
        },
        mapAreaRect: mapRect,
        mapRect,
        legendRect: {
          x: EXPORT_PAGE_PADDING,
          y: EXPORT_PAGE_PADDING,
          width: appearance.sideWidth,
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
        width: mapSize.width + EXPORT_LAYOUT_GAP + appearance.sideWidth,
        height: mapSize.height,
      },
      mapAreaRect: mapRect,
      mapRect,
      legendRect: {
        x: EXPORT_PAGE_PADDING + mapSize.width + EXPORT_LAYOUT_GAP,
        y: EXPORT_PAGE_PADDING,
        width: appearance.sideWidth,
        height: mapSize.height,
      },
    },
    points,
  );
}

function createFixedExportLayout(
  points: WorkspaceBoundsPoints,
  legendPosition: ExportLegendPosition,
  legendFeaturesCount: number,
  exportFormat: Exclude<ExportFormat, "auto">,
  appearance: ExportLegendAppearance,
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

  if (legendPosition === "bottom") {
    const autoLegendHeight = getEstimatedLegendHeight(
      legendFeaturesCount,
      appearance,
    );

    const maxBottomHeight = Math.max(
      220,
      Math.round(contentRect.height * 0.58),
    );
    const legendHeight =
      appearance.bottomHeight === 0
        ? clampExportNumber(
            autoLegendHeight,
            220,
            Math.round(contentRect.height * 0.42),
          )
        : clampExportNumber(appearance.bottomHeight, 220, maxBottomHeight);

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
    appearance.sideWidth,
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
      input.legendFeaturesCount,
      appearance,
    );
  }

  return createFixedExportLayout(
    points,
    input.legendPosition,
    input.legendFeaturesCount,
    input.exportFormat,
    appearance,
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
