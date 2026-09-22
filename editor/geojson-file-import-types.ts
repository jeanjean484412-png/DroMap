import type { DromapLoadingBounds } from "@/lib/dromap/workspace-object-loading";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import type {
  DromapGeoJsonFeature,
  DromapGeoJsonPrecisionMode,
} from "@/stores/editor-geojson-layers";

export type GeoJsonWorkerLimits = {
  maxRetainedFeatures: number;
  maxRetainedCoordinates: number;
  maxRetainedSourceBytes: number;
  maxSingleFeatureBytes: number;
};

export type GeoJsonWorkerParseRequest = {
  type: "parse";
  file: File;
  loadingBounds: DromapLoadingBounds | null;
  precisionMode: DromapGeoJsonPrecisionMode;
  limits: GeoJsonWorkerLimits;
};

export type GeoJsonWorkerProgressMessage = {
  type: "progress";
  bytesRead: number;
  totalBytes: number;
  parsedFeatures: number;
  retainedFeatures: number;
};

export type GeoJsonWorkerCompleteMessage = {
  type: "complete";
  features: DromapGeoJsonFeature[];
  parsedFeatures: number;
  retainedFeatures: number;
  retainedCoordinates: number;
  bounds: WorkspaceBounds | null;
  outsideWorkspaceFeatures: number;
  skippedGeometries: number;
};

export type GeoJsonWorkerErrorCode =
  | "invalid-geojson"
  | "retained-limit"
  | "single-feature-limit"
  | "read-error";

export type GeoJsonWorkerErrorMessage = {
  type: "error";
  code: GeoJsonWorkerErrorCode;
  message: string;
};

export type GeoJsonWorkerResponse =
  | GeoJsonWorkerProgressMessage
  | GeoJsonWorkerCompleteMessage
  | GeoJsonWorkerErrorMessage;
