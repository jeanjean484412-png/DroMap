import { AI_CAPABILITIES, AI_COMMAND_TYPES } from "./dromap-ai-capabilities";

type JsonSchema = Record<string, unknown>;

const string: JsonSchema = { type: "string" };
const nonBlankString: JsonSchema = { type: "string", pattern: "\\S" };
const nullableString: JsonSchema = { type: ["string", "null"] };
const nullableHex: JsonSchema = { type: ["string", "null"], pattern: "^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$" };
const nullableNumber: JsonSchema = { type: ["number", "null"] };
const nullableBoolean: JsonSchema = { type: ["boolean", "null"] };

function object(properties: Record<string, JsonSchema>): JsonSchema {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

function nullableObject(properties: Record<string, JsonSchema>): JsonSchema {
  return { ...object(properties), type: ["object", "null"] };
}

function array(items: JsonSchema): JsonSchema {
  return { type: "array", items };
}

function choice(values: readonly string[]): JsonSchema {
  return { type: ["string", "null"], enum: [...values, null] };
}

const coordinateItem = object({ lng: { type: "number", minimum: -180, maximum: 180 }, lat: { type: "number", minimum: -90, maximum: 90 } });
const coordinate = { ...coordinateItem, type: ["object", "null"] };
const position = nullableObject({ x: { type: "number" }, y: { type: "number" } });
const bounds = nullableObject({
  south: { type: "number" }, west: { type: "number" },
  north: { type: "number" }, east: { type: "number" },
});

const selector = nullableObject({
  featureIds: array(string), labelContains: nullableString,
  legendLabelContains: nullableString, layerName: nullableString,
  featureType: choice(["marker", "line", "zone", "text"]),
  sourceType: choice(["geojson"]), all: { type: "boolean" },
});

const style = nullableObject({
  color: nullableHex, weight: nullableNumber, opacity: nullableNumber,
  fillColor: nullableHex, fillOpacity: nullableNumber,
  dashStyle: choice(["solid", "dashed", "dotted"]),
  zoneStrokeEnabled: nullableBoolean, zoneFillEnabled: nullableBoolean,
  zoneHatchingStyle: choice(["none", "diagonal-right", "diagonal-left", "horizontal", "vertical", "dots"]),
  zoneHatchingColor: nullableHex, zoneHatchingWeight: nullableNumber,
  zoneHatchingSpacing: nullableNumber, zoneDotsEnabled: nullableBoolean,
  zoneDotsColor: nullableHex, zoneDotsRadius: nullableNumber,
  zoneDotsSpacing: nullableNumber, zoneShapeWidth: nullableNumber,
  zoneShapeHeight: nullableNumber, zoneShapeRotation: nullableNumber,
  markerSize: nullableNumber, markerFilled: nullableBoolean,
  markerRotation: nullableNumber, fontSize: nullableNumber,
  textRotation: nullableNumber, textBackgroundEnabled: nullableBoolean,
  textBackgroundColor: nullableHex, textBackgroundOpacity: nullableNumber,
  textBorderEnabled: nullableBoolean, textBorderColor: nullableHex,
  textBorderWidth: nullableNumber, arrowStart: nullableBoolean,
  arrowEnd: nullableBoolean, freehandSmoothing: nullableNumber,
});

const geoJsonStyle = nullableObject({
  strokeColor: nullableHex, strokeWeight: nullableNumber,
  strokeOpacity: nullableNumber, fillColor: nullableHex,
  fillOpacity: nullableNumber, markerSize: nullableNumber,
  dashStyle: choice(["solid", "dashed", "dotted"]),
});

const seriesItem = object({
  id: string, label: string, place: nullableString, coordinate,
  fromPlace: nullableString, toPlace: nullableString,
  fromCoordinate: coordinate, toCoordinate: coordinate,
  value: { type: "number" }, unit: nullableString, date: nullableString,
  category: nullableString, color: nullableString, symbolId: nullableString,
  sourceTitle: nullableString, sourceUrl: nullableString,
});

const choroplethClass = object({
  min: nullableNumber, max: nullableNumber, label: string,
  fillColor: string, fillOpacity: { type: "number" },
});
const choroplethValue = object({
  key: string, label: nullableString, value: { type: "number" },
  unit: nullableString, sourceTitle: nullableString, sourceUrl: nullableString,
});

const FIELDS: Record<string, JsonSchema> = {
  place: nullableString, places: array(string), coordinate,
  coordinates: array(coordinateItem), rings: array(array(coordinateItem)),
  bounds, paddingRatio: nullableNumber, zoom: nullableNumber,
  basemapId: nullableString, layerRef: nullableString,
  layerName: nullableString, layerDirection: choice(["up", "down"]),
  selector, label: nullableString, legendLabel: nullableString,
  symbolId: nullableString, customMarkerRef: nullableString,
  customMarkerSvg: nullableString, style,
  mapLabelVisibility: choice(["inherit", "show", "hide"]),
  lineVariant: choice(["straight", "freehand", "traced", "curved"]),
  zoneVariant: choice(["polygon", "freehand", "shape", "boundary-fill"]),
  shapeKind: choice(["rectangle", "circle", "ellipse"]),
  geometryLocked: nullableBoolean, visible: nullableBoolean,
  locked: nullableBoolean, opacity: nullableNumber, active: nullableBoolean,
  geoJsonCatalogId: nullableString, geoJsonUrl: nullableString,
  // Les GeoJSON sont une chaîne JSON, contrôlée puis convertie côté serveur.
  geoJsonData: nullableString, geoJsonLayerRef: nullableString,
  geoJsonPrecision: choice(["original", "intermediate", "light"]),
  geoJsonStyle, geoJsonPropertyName: nullableString,
  geoJsonJoinProperties: array(string),
  buildingMode: choice(["geojson", "dromap"]),
  buildingSelectionMode: choice(["all", "named"]),
  buildingQueries: array(string),
  roadCategories: array({ type: "string", enum: ["motorways", "main", "secondary", "local"] }),
  roadSelectionMode: choice(["all", "named"]), roadQueries: array(string),
  maxFeatures: nullableNumber, seriesItems: array(seriesItem),
  proportionalMethod: choice(["area", "diameter", "width"]),
  minSize: nullableNumber, maxSize: nullableNumber,
  classes: array(choroplethClass), choroplethValues: array(choroplethValue),
  legendTitle: nullableString,
  legendPosition: choice(["right", "left", "bottom", "map"]),
  legendMapPosition: position, legendMapTitlePosition: position,
  exportFormat: choice(["auto", "16-9", "4-3", "a4-landscape", "a4-portrait", "square"]),
  legendBackgroundColor: nullableHex, legendSideWidth: nullableNumber,
  legendBottomHeight: nullableNumber, legendTitleFontSize: nullableNumber,
  legendItemFontSize: nullableNumber, legendSectionTitleFontSize: nullableNumber,
  legendSymbolSize: nullableNumber, legendItemGap: nullableNumber,
  legendLabelGap: nullableNumber, legendLabelLineHeight: nullableNumber,
  legendSectionGap: nullableNumber, legendMapBorderEnabled: nullableBoolean,
  legendMapBorderColor: nullableString, legendMapBorderWidth: nullableNumber,
  legendMapBorderRadius: nullableNumber, legendMapPadding: nullableNumber,
  mapTitle: nullableString, mapTitlePosition: position,
  mapTitleFontSize: nullableNumber, mapTitleColor: nullableHex,
  showBasemapLabels: nullableBoolean, basemapDetailDelta: nullableNumber,
  section: nullableString, manualLegendEntryId: nullableString,
  manualLegendSymbol: choice(["marker", "line", "arrow", "zone", "text"]),
  legendGroupKey: nullableString, hidden: nullableBoolean,
  orderRefs: array(string), scaleStyle: choice(["bar", "alternating", "line", "boxed"]),
  scalePosition: choice(["top-left", "top-right", "bottom-left", "bottom-right"]),
  scaleMapPosition: position,
  northStyle: choice(["classic", "simple", "compass", "needle"]),
  northPosition: choice(["top-left", "top-right", "bottom-left", "bottom-right"]),
  northMapPosition: position, mapLabelsEnabled: nullableBoolean,
  allMapLabelsEnabled: nullableBoolean,
  geoJsonMapLabelsEnabled: nullableBoolean, mapLabelScale: nullableNumber,
};

function commandSchema(type: (typeof AI_COMMAND_TYPES)[number], overrides: Record<string, JsonSchema> = {}): JsonSchema {
  const capability = AI_CAPABILITIES[type];
  const properties: Record<string, JsonSchema> = {
    id: string,
    type: { type: "string", enum: [type] },
    explanation: string,
  };
  for (const field of capability.fields) {
    const schema = FIELDS[field];
    if (!schema) throw new Error(`Schéma IA manquant : ${type}.${field}`);
    properties[field] = overrides[field] ?? schema;
  }
  return object(properties);
}

function commandSchemas(type: (typeof AI_COMMAND_TYPES)[number]): JsonSchema[] {
  if (["create_marker", "create_text", "fill_boundary", "create_shape"].includes(type)) {
    return [
      commandSchema(type, { place: nonBlankString }),
      commandSchema(type, { coordinate: coordinateItem }),
    ];
  }
  if (type === "create_line") return [
    commandSchema(type, { coordinates: { ...array(coordinateItem), minItems: 2 } }),
    commandSchema(type, { places: { ...array(nonBlankString), minItems: 2 } }),
  ];
  if (type === "create_zone") return [
    commandSchema(type, { rings: { ...array({ ...array(coordinateItem), minItems: 3 }), minItems: 1 } }),
    commandSchema(type, { coordinates: { ...array(coordinateItem), minItems: 3 } }),
    commandSchema(type, { places: { ...array(nonBlankString), minItems: 3 } }),
  ];
  return [commandSchema(type)];
}

const question = object({
  id: string, label: string, multiple: { type: "boolean" },
  options: array(object({ id: string, label: string })),
});
const fact = object({
  subject: string, metric: string, value: { type: ["number", "string", "null"] },
  unit: nullableString, date: nullableString, location: nullableString,
  sourceTitle: nullableString, sourceUrl: nullableString, note: nullableString,
});
const source = object({
  title: string, url: string, publisher: nullableString,
  accessedAt: nullableString, note: nullableString,
});

export const AI_INTERACTION_SCHEMA = object({
  assistantMessage: string,
  questions: array(question),
  summary: string,
  warnings: array(string),
  facts: array(fact),
  sources: array(source),
  commands: array({ anyOf: AI_COMMAND_TYPES.flatMap(commandSchemas) }),
});

export const AI_RESEARCH_SCHEMA = object({
  summary: string,
  facts: array(fact),
  sources: array(source),
});

export const AI_STEP_REVISION_SCHEMA = object({
  message: string,
  command: { anyOf: AI_COMMAND_TYPES.flatMap(commandSchemas) },
});
