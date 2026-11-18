import { readCurveHandleIndices } from "@/lib/dromap/curved-line";
import type { DroMapFeature } from "@/lib/dromap/feature";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import type { ExportFormat, ExportLegendMapPosition, ExportLegendPosition, ExportLegendCustomEntry, ExportLegendSymbolStyle, ExportMapElementPosition, ExportNorthArrowStyle, ExportScaleBarStyle } from "@/stores/editor-export";
import type { DroMapLayer } from "@/stores/editor-layers";
import { normalizeCustomMarkerDefinitions, type DroMapCustomMarkerDefinition } from "@/stores/editor-custom-markers";
import { normalizeDromapGeoJsonLayers, type DromapGeoJsonLayer } from "@/stores/editor-geojson-layers";
import { DEFAULT_DROMAP_BASEMAP_ID, getDromapBasemapConfig, type DromapBasemapId } from "@/lib/dromap/basemap";
import { normalizeLegendSymbolStyle } from "./export-custom-legend";

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

export function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export type ImportedDromapProject = {
  workspaceBounds: WorkspaceBounds;
  workspaceBasemapZoom: number | null;
  workspaceBasemapBaseZoom: number | null;
  basemapId: DromapBasemapId;
  showCountryNeighborContext: boolean;
  showAllFeatureLabels: boolean;
  showAllGeoJsonFeatureLabels: boolean;
  featureMapLabelScale: number;
  featureMapLabelOutlineWidth: number;
  showBasemapLabels: boolean;
  mapTitle: string;
  mapTitlePosition: ExportLegendMapPosition;
  mapTitleFontSize: number;
  mapTitleColor: string;
  guestWatermarkMapPosition: ExportLegendMapPosition;
  exportFormat: ExportFormat;
  legendPosition: ExportLegendPosition;
  legendMapPosition: ExportLegendMapPosition;
  legendMapTitlePosition: ExportLegendMapPosition;
  legendBackgroundColor: string;
  legendSideWidth: number;
  legendBottomHeight: number;
  legendTitleFontSize: number;
  legendItemFontSize: number;
  legendSectionTitleFontSize: number;
  legendSymbolSize: number;
  legendItemGap: number;
  legendLabelGap: number;
  legendLabelLineHeight: number;
  legendSectionGap: number;
  legendMapBorderEnabled: boolean;
  legendMapBorderColor: string;
  legendMapBorderWidth: number;
  legendMapBorderRadius: number;
  legendMapPadding: number;
  customLegendEntries: ExportLegendCustomEntry[];
  legendSymbolOverrides: Record<string, ExportLegendSymbolStyle>;
  scaleBarEnabled: boolean;
  scaleBarStyle: ExportScaleBarStyle;
  scaleBarPosition: ExportMapElementPosition;
  scaleBarMapPosition: ExportLegendMapPosition | null;
  scaleBarSize: number;
  northArrowEnabled: boolean;
  northArrowStyle: ExportNorthArrowStyle;
  northArrowPosition: ExportMapElementPosition;
  northArrowMapPosition: ExportLegendMapPosition | null;
  northArrowSize: number;
  legendTitle: string;
  hiddenLegendFeatureIds: string[];
  hiddenLegendGroupKeys: string[];
  legendFeatureOrder: string[];
  legendGroupOrder: string[];
  legendSectionOrder: string[];
  legendGroupLabels: Record<string, string>;
  legendGroupSections: Record<string, string>;
  customMarkers: DroMapCustomMarkerDefinition[];
  layers: DroMapLayer[];
  geoJsonLayers: DromapGeoJsonLayer[];
  features: DroMapFeature[];
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getRecordValue(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key)
    ? record[key]
    : undefined;
}

function parseFiniteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseNullableZoom(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(20, Math.round(value * 4) / 4));
}

function parseString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(value.filter((item): item is string => typeof item === "string")),
  );
}

function parseStringRecord(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function parseExportFormat(value: unknown): ExportFormat {
  switch (value) {
    case "16-9":
    case "4-3":
    case "a4-landscape":
    case "a4-portrait":
    case "square":
    case "auto":
      return value;
    default:
      return "auto";
  }
}

function parseLegendPosition(value: unknown): ExportLegendPosition {
  switch (value) {
    case "left":
    case "top":
    case "bottom":
    case "right":
    case "map":
      return value;
    default:
      return "right";
  }
}

function parseLegendMapPosition(
  value: unknown,
  fallback: ExportLegendMapPosition = { x: 0, y: 0.84 },
): ExportLegendMapPosition {
  if (!isRecord(value)) {
    return { ...fallback };
  }

  return {
    x: clamp(parseFiniteNumber(getRecordValue(value, "x"), fallback.x), 0, 1),
    y: clamp(parseFiniteNumber(getRecordValue(value, "y"), fallback.y), 0, 1),
  };
}

function parseOptionalMapElementPosition(
  value: unknown,
): ExportLegendMapPosition | null {
  if (!isRecord(value)) return null;
  return parseLegendMapPosition(value, { x: 0.5, y: 0.5 });
}

function parseScaleBarStyle(value: unknown): ExportScaleBarStyle {
  switch (value) {
    case "bar":
    case "line":
    case "boxed":
    case "alternating":
      return value;
    default:
      return "alternating";
  }
}

function parseNorthArrowStyle(value: unknown): ExportNorthArrowStyle {
  switch (value) {
    case "classic":
    case "simple":
    case "compass":
    case "needle":
      return value;
    default:
      return "classic";
  }
}

function parseMapElementPosition(
  value: unknown,
  fallback: ExportMapElementPosition,
): ExportMapElementPosition {
  switch (value) {
    case "top-left":
    case "top-right":
    case "bottom-left":
    case "bottom-right":
      return value;
    default:
      return fallback;
  }
}

export function parseWorkspaceBounds(value: unknown): WorkspaceBounds | null {
  if (!isRecord(value)) {
    return null;
  }

  const southWest = getRecordValue(value, "southWest");
  const northEast = getRecordValue(value, "northEast");

  if (!isRecord(southWest) || !isRecord(northEast)) {
    return null;
  }

  const south = getRecordValue(southWest, "lat");
  const west = getRecordValue(southWest, "lng");
  const north = getRecordValue(northEast, "lat");
  const east = getRecordValue(northEast, "lng");

  if (
    typeof south !== "number" ||
    typeof west !== "number" ||
    typeof north !== "number" ||
    typeof east !== "number" ||
    !Number.isFinite(south) ||
    !Number.isFinite(west) ||
    !Number.isFinite(north) ||
    !Number.isFinite(east)
  ) {
    return null;
  }

  const safeSouth = clamp(Math.min(south, north), -85.05112878, 85.05112878);
  const safeNorth = clamp(Math.max(south, north), -85.05112878, 85.05112878);
  const safeWest = clamp(Math.min(west, east), -360, 360);
  const safeEast = clamp(Math.max(west, east), -360, 360);

  if (safeNorth - safeSouth < 0.000001 || safeEast - safeWest < 0.000001) {
    return null;
  }

  return {
    southWest: { lat: safeSouth, lng: safeWest },
    northEast: { lat: safeNorth, lng: safeEast },
  };
}

export function parseCoordinatePosition(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }

  const lng = value[0];
  const lat = value[1];

  if (
    typeof lng !== "number" ||
    typeof lat !== "number" ||
    !Number.isFinite(lng) ||
    !Number.isFinite(lat)
  ) {
    return null;
  }

  return [clamp(lng, -360, 360), clamp(lat, -85.05112878, 85.05112878)];
}

export function parseLineCoordinates(value: unknown): [number, number][] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const coordinates = value
    .map(parseCoordinatePosition)
    .filter((position): position is [number, number] => position !== null);

  return coordinates.length >= 2 ? coordinates : null;
}

function parsePolygonCoordinates(value: unknown): [number, number][][] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const rings = value
    .map((ring) => {
      if (!Array.isArray(ring)) {
        return [];
      }

      return ring
        .map(parseCoordinatePosition)
        .filter((position): position is [number, number] => position !== null);
    })
    .filter((ring) => ring.length >= 4);

  return rings.length > 0 ? rings : null;
}

export function parseDromapMarkerSymbol(
  value: unknown,
): DroMapFeature["properties"]["symbol"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const type = getRecordValue(value, "type");
  const id = getRecordValue(value, "id");

  if (typeof type !== "string" || typeof id !== "string") {
    return null;
  }

  return cloneJsonValue(value) as DroMapFeature["properties"]["symbol"];
}

function parseDromapFeatureSource(
  value: unknown,
): DroMapFeature["properties"]["source"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const type = getRecordValue(value, "type");
  const importId = getRecordValue(value, "importId");

  if (type !== "geojson" || typeof importId !== "string" || !importId.trim()) {
    return undefined;
  }

  const sourceName = getRecordValue(value, "sourceName");
  const sourceLabel = getRecordValue(value, "sourceLabel");
  const sourceUrl = getRecordValue(value, "sourceUrl");
  const sourceLicense = getRecordValue(value, "sourceLicense");
  const sourceAttribution = getRecordValue(value, "sourceAttribution");
  const sourceVersion = getRecordValue(value, "sourceVersion");
  const originalProperties = getRecordValue(value, "originalProperties");
  const originalFeatureId = getRecordValue(value, "originalFeatureId");
  const originalGeometryType = getRecordValue(value, "originalGeometryType");
  const originalPartIndex = getRecordValue(value, "originalPartIndex");

  return {
    type: "geojson",
    importId,
    ...(typeof sourceName === "string" ? { sourceName } : {}),
    ...(sourceName === null ? { sourceName: null } : {}),
    ...(typeof sourceLabel === "string" ? { sourceLabel } : {}),
    ...(typeof sourceUrl === "string" ? { sourceUrl } : {}),
    ...(typeof sourceLicense === "string" ? { sourceLicense } : {}),
    ...(typeof sourceAttribution === "string" ? { sourceAttribution } : {}),
    ...(typeof sourceVersion === "string" ? { sourceVersion } : {}),
    ...(isRecord(originalProperties)
      ? {
          originalProperties: cloneJsonValue(originalProperties) as Record<
            string,
            unknown
          >,
        }
      : {}),
    ...(typeof originalFeatureId === "string" ||
    typeof originalFeatureId === "number"
      ? { originalFeatureId }
      : {}),
    ...(typeof originalGeometryType === "string"
      ? { originalGeometryType }
      : {}),
    ...(typeof originalPartIndex === "number" &&
    Number.isFinite(originalPartIndex)
      ? { originalPartIndex }
      : {}),
  };
}

function parseDromapFeature(value: unknown): DroMapFeature | null {
  if (!isRecord(value)) {
    return null;
  }

  const geometry = getRecordValue(value, "geometry");
  const properties = getRecordValue(value, "properties");

  if (!isRecord(geometry) || !isRecord(properties)) {
    return null;
  }

  const featureType = getRecordValue(properties, "type");

  if (
    featureType !== "marker" &&
    featureType !== "line" &&
    featureType !== "zone" &&
    featureType !== "text"
  ) {
    return null;
  }

  const geometryType = getRecordValue(geometry, "type");
  const rawCoordinates = getRecordValue(geometry, "coordinates");
  let safeGeometry: DroMapFeature["geometry"] | null = null;

  if (
    (featureType === "marker" || featureType === "text") &&
    geometryType === "Point"
  ) {
    const point = parseCoordinatePosition(rawCoordinates);
    safeGeometry = point ? { type: "Point", coordinates: point } : null;
  }

  if (featureType === "line" && geometryType === "LineString") {
    const line = parseLineCoordinates(rawCoordinates);
    safeGeometry = line ? { type: "LineString", coordinates: line } : null;
  }

  if (featureType === "zone" && geometryType === "Polygon") {
    const polygon = parsePolygonCoordinates(rawCoordinates);
    safeGeometry = polygon ? { type: "Polygon", coordinates: polygon } : null;
  }

  if (!safeGeometry) {
    return null;
  }

  const featureId = parseString(
    getRecordValue(value, "id"),
    `imported-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  const rawStyle = getRecordValue(properties, "style");
  const rawSymbol = getRecordValue(properties, "symbol");
  const rawSource = getRecordValue(properties, "source");
  const rawMapLabelOffset = getRecordValue(properties, "mapLabelOffset");
  const rawMapLabelScale = getRecordValue(properties, "mapLabelScale");
  const safeMapLabelOffset =
    isRecord(rawMapLabelOffset) &&
    typeof getRecordValue(rawMapLabelOffset, "x") === "number" &&
    Number.isFinite(getRecordValue(rawMapLabelOffset, "x")) &&
    typeof getRecordValue(rawMapLabelOffset, "y") === "number" &&
    Number.isFinite(getRecordValue(rawMapLabelOffset, "y")) &&
    typeof getRecordValue(rawMapLabelOffset, "referenceZoom") === "number" &&
    Number.isFinite(getRecordValue(rawMapLabelOffset, "referenceZoom"))
      ? {
          x: getRecordValue(rawMapLabelOffset, "x") as number,
          y: getRecordValue(rawMapLabelOffset, "y") as number,
          referenceZoom: getRecordValue(
            rawMapLabelOffset,
            "referenceZoom",
          ) as number,
        }
      : null;
  const safeStyle = isRecord(rawStyle)
    ? (cloneJsonValue(rawStyle) as DroMapFeature["properties"]["style"])
    : {};
  const safeSymbol = parseDromapMarkerSymbol(rawSymbol);
  const safeSource = parseDromapFeatureSource(rawSource);
  const belowBasemapLabels = getRecordValue(properties, "belowBasemapLabels");

  return {
    type: "Feature",
    id: featureId,
    geometry: safeGeometry,
    properties: {
      type: featureType,
      style: safeStyle,
      label: parseString(getRecordValue(properties, "label"), featureType),
      ...(typeof getRecordValue(properties, "legendLabel") === "string"
        ? { legendLabel: getRecordValue(properties, "legendLabel") as string }
        : {}),
      ...(["inherit", "show", "hide"].includes(
        String(getRecordValue(properties, "mapLabelVisibility")),
      )
        ? {
            mapLabelVisibility: getRecordValue(
              properties,
              "mapLabelVisibility",
            ) as DroMapFeature["properties"]["mapLabelVisibility"],
          }
        : {}),
      ...(safeMapLabelOffset ? { mapLabelOffset: safeMapLabelOffset } : {}),
      ...(typeof belowBasemapLabels === "boolean" ? { belowBasemapLabels } : {}),
      ...(typeof rawMapLabelScale === "number" && Number.isFinite(rawMapLabelScale)
        ? { mapLabelScale: clamp(rawMapLabelScale, 0.5, 2.5) }
        : {}),
      ...(safeSymbol ? { symbol: safeSymbol } : {}),
      curveHandleIndices: readCurveHandleIndices(getRecordValue(properties, "curveHandleIndices")),
      ...(typeof getRecordValue(properties, "lineVariant") === "string"
        ? {
            lineVariant: getRecordValue(
              properties,
              "lineVariant",
            ) as DroMapFeature["properties"]["lineVariant"],
          }
        : {}),
      ...(typeof getRecordValue(properties, "zoneVariant") === "string"
        ? {
            zoneVariant: getRecordValue(
              properties,
              "zoneVariant",
            ) as DroMapFeature["properties"]["zoneVariant"],
          }
        : {}),
      ...(typeof getRecordValue(properties, "zoneShapeKind") === "string"
        ? {
            zoneShapeKind: getRecordValue(
              properties,
              "zoneShapeKind",
            ) as DroMapFeature["properties"]["zoneShapeKind"],
          }
        : {}),
      ...(typeof getRecordValue(properties, "order") === "number" &&
      Number.isFinite(getRecordValue(properties, "order"))
        ? { order: getRecordValue(properties, "order") as number }
        : {}),
      ...(getRecordValue(properties, "locked") === true
        ? { locked: true }
        : {}),
      ...(getRecordValue(properties, "lockOverride") === "locked" ||
      getRecordValue(properties, "lockOverride") === "unlocked"
        ? {
            lockOverride: getRecordValue(properties, "lockOverride") as
              "locked" | "unlocked",
          }
        : {}),
      ...(typeof getRecordValue(properties, "layerId") === "string"
        ? { layerId: getRecordValue(properties, "layerId") as string }
        : {}),
      ...(safeSource ? { source: safeSource } : {}),
      meta: { version: 1 },
    },
  };
}

function parseProjectLayers(value: unknown): DroMapLayer[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Partial<DroMapLayer> => isRecord(item))
    .map((item, index) => {
      const fallbackOrder = (index + 1) * 1000;
      const id = parseString(
        getRecordValue(item, "id"),
        `dromap-layer-imported-${index + 1}`,
      );
      const name = parseString(
        getRecordValue(item, "name"),
        `Calque ${index + 1}`,
      );
      const opacity = clamp(
        parseFiniteNumber(getRecordValue(item, "opacity"), 1),
        0,
        1,
      );
      const order = parseFiniteNumber(
        getRecordValue(item, "order"),
        fallbackOrder,
      );
      const createdAt = parseString(
        getRecordValue(item, "createdAt"),
        new Date().toISOString(),
      );
      const updatedAt = parseString(
        getRecordValue(item, "updatedAt"),
        createdAt,
      );

      return {
        id,
        name,
        visible: getRecordValue(item, "visible") !== false,
        opacity,
        locked: getRecordValue(item, "locked") === true,
        order,
        createdAt,
        updatedAt,
      };
    });
}

function parseProjectFeatures(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(parseDromapFeature)
    .filter((feature): feature is DroMapFeature => feature !== null);
}

function parseCustomLegendEntries(value: unknown): ExportLegendCustomEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    if (!isRecord(item)) return [];

    const symbolValue = getRecordValue(item, "symbol");
    const symbol =
      symbolValue === "line" ||
      symbolValue === "arrow" ||
      symbolValue === "zone" ||
      symbolValue === "text" ||
      symbolValue === "marker"
        ? symbolValue
        : "marker";
    const dashValue = getRecordValue(item, "dashStyle");
    const dashStyle =
      dashValue === "dashed" || dashValue === "dotted" || dashValue === "solid"
        ? dashValue
        : "solid";

    return [
      {
        id: parseString(getRecordValue(item, "id"), `custom-${index + 1}`),
        label: parseString(getRecordValue(item, "label"), "Nouvel élément"),
        section: parseString(getRecordValue(item, "section"), "Général"),
        symbol,
        color: parseString(getRecordValue(item, "color"), "#111827"),
        fillColor: parseString(getRecordValue(item, "fillColor"), "#ffffff"),
        dashStyle,
        symbolStyle: isRecord(getRecordValue(item, "symbolStyle"))
          ? normalizeLegendSymbolStyle(
              getRecordValue(item, "symbolStyle") as Record<string, unknown>,
              symbol,
            )
          : undefined,
      },
    ];
  });
}

function parseLegendSymbolOverrides(
  value: unknown,
): Record<string, ExportLegendSymbolStyle> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([groupKey, style]) =>
      isRecord(style) ? [[groupKey, normalizeLegendSymbolStyle(style)]] : [],
    ),
  );
}

export function parseDromapProjectJson(
  jsonText: string,
): ImportedDromapProject {
  const parsed = JSON.parse(jsonText) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("Fichier projet invalide.");
  }

  const schema = getRecordValue(parsed, "schema");

  if (schema !== "dromap.project") {
    throw new Error("Ce fichier JSON n’est pas un export projet DroMap.");
  }

  const workspace = getRecordValue(parsed, "workspace");
  const exportSettings = getRecordValue(parsed, "export");
  const legend = getRecordValue(parsed, "legend");

  if (!isRecord(workspace) || !isRecord(exportSettings) || !isRecord(legend)) {
    throw new Error("Le fichier projet DroMap est incomplet.");
  }

  const workspaceBounds = parseWorkspaceBounds(
    getRecordValue(workspace, "bounds"),
  );

  if (!workspaceBounds) {
    throw new Error("La zone de travail du projet importé est invalide.");
  }

  const rawBasemapId = getRecordValue(workspace, "basemapId");
  const basemapId =
    typeof rawBasemapId === "string" ? rawBasemapId : DEFAULT_DROMAP_BASEMAP_ID;
  const legendAppearance = getRecordValue(exportSettings, "legendAppearance");
  const safeAppearance = isRecord(legendAppearance) ? legendAppearance : {};
  const scaleBar = getRecordValue(exportSettings, "scaleBar");
  const safeScaleBar = isRecord(scaleBar) ? scaleBar : {};
  const northArrow = getRecordValue(exportSettings, "northArrow");
  const safeNorthArrow = isRecord(northArrow) ? northArrow : {};
  const mapTitle = getRecordValue(exportSettings, "mapTitle");
  const safeMapTitle = isRecord(mapTitle) ? mapTitle : {};
  const safeBasemapId = getDromapBasemapConfig(basemapId).id;

  return {
    workspaceBounds,
    workspaceBasemapZoom: parseNullableZoom(
      getRecordValue(workspace, "basemapZoom"),
    ),
    workspaceBasemapBaseZoom: parseNullableZoom(
      getRecordValue(workspace, "basemapBaseZoom"),
    ),
    basemapId: safeBasemapId,
    showCountryNeighborContext:
      getRecordValue(workspace, "showCountryNeighborContext") !== false,
    showAllFeatureLabels:
      getRecordValue(workspace, "showAllFeatureLabels") === true,
    showAllGeoJsonFeatureLabels:
      getRecordValue(workspace, "showAllGeoJsonFeatureLabels") === true,
    featureMapLabelScale: clamp(
      parseFiniteNumber(getRecordValue(workspace, "featureMapLabelScale"), 1),
      0.5,
      2.5,
    ),
    featureMapLabelOutlineWidth: clamp(
      parseFiniteNumber(
        getRecordValue(workspace, "featureMapLabelOutlineWidth"),
        1.5,
      ),
      0,
      6,
    ),
    showBasemapLabels:
      getRecordValue(exportSettings, "showBasemapLabels") !== false,
    mapTitle: parseString(getRecordValue(safeMapTitle, "text"), "").slice(0, 240),
    mapTitlePosition: parseLegendMapPosition(
      getRecordValue(safeMapTitle, "position"),
      { x: 0.5, y: 0.08 },
    ),
    mapTitleFontSize: clamp(
      parseFiniteNumber(getRecordValue(safeMapTitle, "fontSize"), 44),
      12,
      120,
    ),
    mapTitleColor: parseString(
      getRecordValue(safeMapTitle, "color"),
      "#0f172a",
    ),
    guestWatermarkMapPosition: parseLegendMapPosition(
      getRecordValue(exportSettings, "guestWatermarkMapPosition"),
      { x: 0.5, y: 0.95 },
    ),
    exportFormat: parseExportFormat(getRecordValue(exportSettings, "format")),
    legendPosition: parseLegendPosition(
      getRecordValue(exportSettings, "legendPosition"),
    ),
    legendMapPosition: parseLegendMapPosition(
      getRecordValue(exportSettings, "legendMapPosition"),
      { x: 0, y: 0.84 },
    ),
    legendMapTitlePosition: parseLegendMapPosition(
      getRecordValue(exportSettings, "legendMapTitlePosition"),
      { x: 0.5, y: 0 },
    ),
    legendBackgroundColor: parseString(
      getRecordValue(safeAppearance, "backgroundColor"),
      "#ffffff",
    ),
    legendSideWidth: clamp(
      parseFiniteNumber(getRecordValue(safeAppearance, "sideWidth"), 420),
      240,
      900,
    ),
    legendBottomHeight: clamp(
      parseFiniteNumber(getRecordValue(safeAppearance, "bottomHeight"), 0),
      0,
      900,
    ),
    legendTitleFontSize: clamp(
      parseFiniteNumber(getRecordValue(safeAppearance, "titleFontSize"), 32),
      12,
      72,
    ),
    legendItemFontSize: clamp(
      parseFiniteNumber(getRecordValue(safeAppearance, "itemFontSize"), 24),
      10,
      56,
    ),
    legendSectionTitleFontSize: clamp(
      parseFiniteNumber(
        getRecordValue(safeAppearance, "sectionTitleFontSize"),
        20,
      ),
      10,
      56,
    ),
    legendSymbolSize: clamp(
      parseFiniteNumber(getRecordValue(safeAppearance, "symbolSize"), 48),
      24,
      144,
    ),
    legendItemGap: clamp(
      parseFiniteNumber(getRecordValue(safeAppearance, "itemGap"), 16),
      0,
      40,
    ),
    legendLabelGap: clamp(
      parseFiniteNumber(getRecordValue(safeAppearance, "labelGap"), 18),
      0,
      48,
    ),
    legendLabelLineHeight: clamp(
      parseFiniteNumber(getRecordValue(safeAppearance, "labelLineHeight"), 1.2),
      0.8,
      1.8,
    ),
    legendSectionGap: clamp(
      parseFiniteNumber(getRecordValue(safeAppearance, "sectionGap"), 16),
      0,
      48,
    ),
    legendMapBorderEnabled:
      getRecordValue(safeAppearance, "mapBorderEnabled") !== false,
    legendMapBorderColor: parseString(
      getRecordValue(safeAppearance, "mapBorderColor"),
      "#ffffff",
    ),
    legendMapBorderWidth: clamp(
      parseFiniteNumber(getRecordValue(safeAppearance, "mapBorderWidth"), 1),
      1,
      12,
    ),
    legendMapBorderRadius: clamp(
      parseFiniteNumber(getRecordValue(safeAppearance, "mapBorderRadius"), 12),
      0,
      40,
    ),
    legendMapPadding: clamp(
      parseFiniteNumber(getRecordValue(safeAppearance, "mapPadding"), 10),
      0,
      48,
    ),
    scaleBarEnabled: getRecordValue(safeScaleBar, "enabled") !== false,
    scaleBarStyle: parseScaleBarStyle(getRecordValue(safeScaleBar, "style")),
    scaleBarPosition: parseMapElementPosition(
      getRecordValue(safeScaleBar, "position"),
      "bottom-left",
    ),
    scaleBarMapPosition: parseOptionalMapElementPosition(
      getRecordValue(safeScaleBar, "mapPosition"),
    ),
    scaleBarSize: clamp(
      parseFiniteNumber(getRecordValue(safeScaleBar, "size"), 1),
      0.5,
      2,
    ),
    northArrowEnabled: getRecordValue(safeNorthArrow, "enabled") !== false,
    northArrowStyle: parseNorthArrowStyle(
      getRecordValue(safeNorthArrow, "style"),
    ),
    northArrowPosition: parseMapElementPosition(
      getRecordValue(safeNorthArrow, "position"),
      "top-right",
    ),
    northArrowMapPosition: parseOptionalMapElementPosition(
      getRecordValue(safeNorthArrow, "mapPosition"),
    ),
    northArrowSize: clamp(
      parseFiniteNumber(getRecordValue(safeNorthArrow, "size"), 1),
      0.5,
      2,
    ),
    legendTitle: parseString(getRecordValue(legend, "title"), "Légende"),
    hiddenLegendFeatureIds: parseStringArray(
      getRecordValue(legend, "hiddenFeatureIds"),
    ),
    hiddenLegendGroupKeys: parseStringArray(
      getRecordValue(legend, "hiddenGroupKeys"),
    ),
    legendFeatureOrder: parseStringArray(
      getRecordValue(legend, "featureOrder"),
    ),
    legendGroupOrder: parseStringArray(getRecordValue(legend, "groupOrder")),
    legendSectionOrder: parseStringArray(
      getRecordValue(legend, "sectionOrder"),
    ),
    legendGroupLabels: parseStringRecord(getRecordValue(legend, "groupLabels")),
    legendGroupSections: parseStringRecord(
      getRecordValue(legend, "groupSections"),
    ),
    customLegendEntries: parseCustomLegendEntries(
      getRecordValue(legend, "customEntries"),
    ),
    legendSymbolOverrides: parseLegendSymbolOverrides(
      getRecordValue(legend, "symbolOverrides"),
    ),
    customMarkers: normalizeCustomMarkerDefinitions(
      getRecordValue(parsed, "customMarkers"),
    ),
    layers: parseProjectLayers(getRecordValue(parsed, "layers")),
    geoJsonLayers: normalizeDromapGeoJsonLayers(
      getRecordValue(parsed, "geoJsonLayers"),
    ),
    features: parseProjectFeatures(getRecordValue(parsed, "features")),
  };
}
