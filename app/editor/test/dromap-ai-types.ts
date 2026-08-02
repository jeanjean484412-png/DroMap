import type {
  DroMapFeatureDashStyle,
  DroMapFeatureMapLabelVisibility,
  DroMapFeatureType,
  DroMapLineVariant,
  DroMapZoneHatchingStyle,
  DroMapZoneShapeKind,
  DroMapZoneVariant,
} from "@/lib/dromap/feature";
import type {
  DromapGeoJsonLayerDashStyle,
  DromapGeoJsonPrecisionMode,
} from "@/stores/editor-test-geojson-layers";
import type {
  ExportFormat,
  ExportLegendCustomSymbol,
  ExportLegendPosition,
  ExportMapElementPosition,
  ExportNorthArrowStyle,
  ExportScaleBarStyle,
} from "@/stores/editor-test-export";

export type DroMapAiWorkspaceMode = "manual" | "automatic";

export type DroMapAiCommandType =
  | "set_workspace_by_place"
  | "set_workspace_bounds"
  | "select_world"
  | "fit_view"
  | "set_basemap"
  | "set_country_neighbors"
  | "create_layer"
  | "set_active_layer"
  | "configure_layer"
  | "reorder_layer"
  | "delete_layer"
  | "import_geojson_catalog"
  | "import_geojson_url"
  | "create_geojson_layer"
  | "configure_geojson_layer"
  | "reorder_geojson_layer"
  | "delete_geojson_layer"
  | "convert_geojson_to_dromap"
  | "convert_dromap_to_geojson"
  | "import_buildings"
  | "create_custom_marker_svg"
  | "delete_custom_marker"
  | "create_marker"
  | "create_text"
  | "create_line"
  | "create_zone"
  | "create_shape"
  | "fill_boundary"
  | "create_proportional_markers"
  | "create_proportional_flows"
  | "create_choropleth"
  | "update_features"
  | "duplicate_features"
  | "reorder_features"
  | "delete_features"
  | "configure_legend"
  | "add_manual_legend_entry"
  | "update_manual_legend_entry"
  | "delete_manual_legend_entry"
  | "configure_legend_group"
  | "configure_feature_legend"
  | "configure_scale"
  | "configure_north_arrow"
  | "configure_map_labels"
  | "select_feature"
  | "clear_selection"
  | "open_export_preview";

export type DroMapAiCoordinate = {
  lng: number;
  lat: number;
};

export type DroMapAiBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type DroMapAiSource = {
  title: string;
  url: string;
  publisher: string | null;
  accessedAt: string | null;
  note: string | null;
};

export type DroMapAiFact = {
  subject: string;
  metric: string;
  value: number | string | null;
  unit: string | null;
  date: string | null;
  location: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  note: string | null;
};

export type DroMapAiFeatureSelector = {
  featureIds: string[];
  labelContains: string | null;
  legendLabelContains: string | null;
  layerName: string | null;
  featureType: DroMapFeatureType | null;
  sourceType: "geojson" | null;
  all: boolean;
};

export type DroMapAiStylePatch = {
  color: string | null;
  weight: number | null;
  opacity: number | null;
  fillColor: string | null;
  fillOpacity: number | null;
  dashStyle: DroMapFeatureDashStyle | null;
  zoneStrokeEnabled: boolean | null;
  zoneFillEnabled: boolean | null;
  zoneHatchingStyle: DroMapZoneHatchingStyle | "dots" | null;
  zoneHatchingColor: string | null;
  zoneHatchingWeight: number | null;
  zoneHatchingSpacing: number | null;
  zoneDotsEnabled: boolean | null;
  zoneDotsColor: string | null;
  zoneDotsRadius: number | null;
  zoneDotsSpacing: number | null;
  zoneShapeWidth: number | null;
  zoneShapeHeight: number | null;
  zoneShapeRotation: number | null;
  markerSize: number | null;
  markerFilled: boolean | null;
  markerRotation: number | null;
  fontSize: number | null;
  textRotation: number | null;
  textBackgroundEnabled: boolean | null;
  textBackgroundColor: string | null;
  textBackgroundOpacity: number | null;
  textBorderEnabled: boolean | null;
  textBorderColor: string | null;
  textBorderWidth: number | null;
  arrowStart: boolean | null;
  arrowEnd: boolean | null;
  freehandSmoothing: number | null;
};

export type DroMapAiGeoJsonStylePatch = {
  strokeColor: string | null;
  strokeWeight: number | null;
  strokeOpacity: number | null;
  fillColor: string | null;
  fillOpacity: number | null;
  markerSize: number | null;
  dashStyle: DromapGeoJsonLayerDashStyle | null;
};

export type DroMapAiSeriesItem = {
  id: string;
  label: string;
  place: string | null;
  coordinate: DroMapAiCoordinate | null;
  fromPlace: string | null;
  toPlace: string | null;
  fromCoordinate: DroMapAiCoordinate | null;
  toCoordinate: DroMapAiCoordinate | null;
  value: number;
  unit: string | null;
  date: string | null;
  category: string | null;
  color: string | null;
  symbolId: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
};

export type DroMapAiChoroplethClass = {
  min: number | null;
  max: number | null;
  label: string;
  fillColor: string;
  fillOpacity: number;
};

export type DroMapAiChoroplethValue = {
  key: string;
  label: string | null;
  value: number;
  unit: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
};

export type DroMapAiCommand = {
  id: string;
  type: DroMapAiCommandType;
  explanation: string;

  place: string | null;
  places: string[];
  coordinate: DroMapAiCoordinate | null;
  coordinates: DroMapAiCoordinate[];
  rings: DroMapAiCoordinate[][];
  bounds: DroMapAiBounds | null;
  paddingRatio: number | null;
  zoom: number | null;

  basemapId: string | null;
  layerRef: string | null;
  layerName: string | null;
  layerDirection: "up" | "down" | null;
  selector: DroMapAiFeatureSelector;

  label: string | null;
  legendLabel: string | null;
  symbolId: string | null;
  customMarkerRef: string | null;
  customMarkerSvg: string | null;
  style: DroMapAiStylePatch;
  mapLabelVisibility: DroMapFeatureMapLabelVisibility | null;
  lineVariant: DroMapLineVariant | null;
  zoneVariant: DroMapZoneVariant | null;
  shapeKind: DroMapZoneShapeKind | null;
  geometryLocked: boolean | null;

  visible: boolean | null;
  locked: boolean | null;
  opacity: number | null;
  active: boolean | null;

  geoJsonCatalogId: string | null;
  geoJsonUrl: string | null;
  geoJsonData: Record<string, unknown> | null;
  geoJsonLayerRef: string | null;
  geoJsonPrecision: DromapGeoJsonPrecisionMode | null;
  geoJsonStyle: DroMapAiGeoJsonStylePatch;
  geoJsonPropertyName: string | null;
  geoJsonJoinProperties: string[];

  buildingMode: "geojson" | "dromap" | null;
  buildingSelectionMode: "all" | "named" | null;
  buildingQueries: string[];
  maxFeatures: number | null;

  seriesItems: DroMapAiSeriesItem[];
  proportionalMethod: "area" | "diameter" | "width" | null;
  minSize: number | null;
  maxSize: number | null;
  classes: DroMapAiChoroplethClass[];
  choroplethValues: DroMapAiChoroplethValue[];

  legendTitle: string | null;
  legendPosition: ExportLegendPosition | null;
  exportFormat: ExportFormat | null;
  legendBackgroundColor: string | null;
  legendSideWidth: number | null;
  legendBottomHeight: number | null;
  legendTitleFontSize: number | null;
  legendItemFontSize: number | null;
  legendSectionTitleFontSize: number | null;
  legendSymbolSize: number | null;
  legendItemGap: number | null;
  legendLabelGap: number | null;
  legendSectionGap: number | null;
  legendMapBorderEnabled: boolean | null;
  legendMapBorderColor: string | null;
  legendMapBorderWidth: number | null;
  legendMapBorderRadius: number | null;
  legendMapPadding: number | null;
  section: string | null;
  manualLegendEntryId: string | null;
  manualLegendSymbol: ExportLegendCustomSymbol | null;
  legendGroupKey: string | null;
  hidden: boolean | null;
  orderRefs: string[];

  scaleStyle: ExportScaleBarStyle | null;
  scalePosition: ExportMapElementPosition | null;
  northStyle: ExportNorthArrowStyle | null;
  northPosition: ExportMapElementPosition | null;

  mapLabelsEnabled: boolean | null;
  allMapLabelsEnabled: boolean | null;
  geoJsonMapLabelsEnabled: boolean | null;
  mapLabelScale: number | null;
};

export type DroMapAiPlan = {
  summary: string;
  warnings: string[];
  facts: DroMapAiFact[];
  sources: DroMapAiSource[];
  commands: DroMapAiCommand[];
};

export type DroMapAiProjectContext = {
  basemapId: string;
  workspaceBounds: DroMapAiBounds | null;
  workspaceValidated: boolean;
  currentZoom: number | null;
  activeLayerId: string;
  layers: Array<{
    id: string;
    name: string;
    visible: boolean;
    opacity: number;
    locked: boolean;
    order: number;
  }>;
  geoJsonLayers: Array<{
    id: string;
    name: string;
    visible: boolean;
    opacity: number;
    locked: boolean;
    order: number;
    featureCount: number;
    precisionMode: DromapGeoJsonPrecisionMode;
    catalogDatasetId: string | null;
    style: Record<string, unknown>;
  }>;
  customMarkers: Array<{
    id: string;
    name: string;
    kind: "drawn" | "image";
  }>;
  features: Array<{
    id: string;
    type: DroMapFeatureType;
    label: string;
    legendLabel: string | null;
    layerId: string | null;
    geometryType: "Point" | "LineString" | "Polygon";
    coordinates: unknown;
    style: Record<string, unknown>;
    symbol: Record<string, unknown> | null;
    mapLabelVisibility: DroMapFeatureMapLabelVisibility | null;
    locked: boolean;
    geometryLocked: boolean;
    sourceType: string | null;
  }>;
  featureCount: number;
  catalog: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    geography: string;
    sourceLabel: string;
    sizeLabel: string;
    keywords: string[];
    heavy: boolean;
  }>;
  mapLabels: {
    showAllFeatureLabels: boolean;
    showAllGeoJsonFeatureLabels: boolean;
    scale: number;
  };
  legend: {
    title: string;
    position: ExportLegendPosition;
    exportFormat: ExportFormat;
    scaleBarEnabled: boolean;
    northArrowEnabled: boolean;
    customEntryCount: number;
    hiddenFeatureCount: number;
    hiddenGroupCount: number;
  };
};

export type DroMapAiStepRevisionRequest = {
  plan: DroMapAiPlan;
  commandId: string;
  commandIndex: number;
  instruction: string;
};

export type DroMapAiApiRequest = {
  prompt: string;
  context: DroMapAiProjectContext;
  workspaceMode: DroMapAiWorkspaceMode;
  stepRevision?: DroMapAiStepRevisionRequest;
};

export type DroMapAiApiResponse = {
  plan: DroMapAiPlan;
  model: string;
  grounded: boolean;
  revisedCommandId?: string;
};
