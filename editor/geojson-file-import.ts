"use client";

import { getWorkspaceObjectLoadingBounds } from "@/lib/dromap/workspace-object-loading";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import {
  createDromapGeoJsonLayerFromFeatures,
  parseGeoJsonTextToDromapGeoJsonLayer,
  type DromapGeoJsonLayer,
  type DromapGeoJsonPrecisionMode,
} from "@/stores/editor-geojson-layers";
import type {
  GeoJsonWorkerErrorCode,
  GeoJsonWorkerResponse,
} from "./geojson-file-import-types";

export const GEOJSON_PROGRESSIVE_IMPORT_THRESHOLD_BYTES = 4 * 1024 * 1024;
export const GEOJSON_AUTOMATIC_LIGHT_THRESHOLD_BYTES = 25 * 1024 * 1024;
export const GEOJSON_SERVER_PROCESSING_CANDIDATE_BYTES = 100 * 1024 * 1024;

const DEFAULT_WORKER_LIMITS = {
  maxRetainedFeatures: 25_000,
  maxRetainedCoordinates: 750_000,
  maxRetainedSourceBytes: 48 * 1024 * 1024,
  maxSingleFeatureBytes: 16 * 1024 * 1024,
};

export type GeoJsonFileImportProgress = {
  percent: number;
  bytesRead: number;
  totalBytes: number;
  parsedFeatures: number;
  retainedFeatures: number;
};

export type GeoJsonFileImportSummary = {
  progressive: boolean;
  automaticallyOptimized: boolean;
  serverProcessingCandidate: boolean;
  parsedFeatures: number;
  retainedFeatures: number;
  outsideWorkspaceFeatures: number;
  skippedGeometries: number;
};

export type GeoJsonFileImportResult = {
  layer: DromapGeoJsonLayer;
  summary: GeoJsonFileImportSummary;
};

export class GeoJsonFileImportError extends Error {
  constructor(
    readonly code: GeoJsonWorkerErrorCode | "workspace-required" | "cancelled",
    message: string,
  ) {
    super(message);
  }
}

type ImportGeoJsonFileOptions = {
  workspaceBounds: WorkspaceBounds | null | undefined;
  existingLayerCount?: number;
  precisionMode: DromapGeoJsonPrecisionMode;
  signal?: AbortSignal;
  onProgress?: (progress: GeoJsonFileImportProgress) => void;
};

export async function importGeoJsonFileAutomatically(
  file: File,
  options: ImportGeoJsonFileOptions,
): Promise<GeoJsonFileImportResult> {
  const progressive = file.size >= GEOJSON_PROGRESSIVE_IMPORT_THRESHOLD_BYTES;
  const automaticallyOptimized =
    file.size >= GEOJSON_AUTOMATIC_LIGHT_THRESHOLD_BYTES;
  const effectivePrecision = automaticallyOptimized
    ? "light"
    : options.precisionMode;

  if (!progressive) {
    const layer = parseGeoJsonTextToDromapGeoJsonLayer(await file.text(), {
      sourceName: file.name,
      layerName: file.name.replace(/\.(geojson|json)$/i, ""),
      existingLayerCount: options.existingLayerCount,
      precisionMode: effectivePrecision,
    });
    return {
      layer,
      summary: {
        progressive: false,
        automaticallyOptimized,
        serverProcessingCandidate: false,
        parsedFeatures: layer.featureCount,
        retainedFeatures: layer.featureCount,
        outsideWorkspaceFeatures: 0,
        skippedGeometries: layer.skippedGeometries,
      },
    };
  }

  const loadingBounds = getWorkspaceObjectLoadingBounds(options.workspaceBounds);
  if (automaticallyOptimized && !loadingBounds) {
    throw new GeoJsonFileImportError(
      "workspace-required",
      "Ce GeoJSON est très volumineux. Définis d’abord une zone de travail : DroMap pourra alors le lire progressivement sans charger toute la France en mémoire.",
    );
  }

  return new Promise<GeoJsonFileImportResult>((resolve, reject) => {
    const worker = new Worker(new URL("./geojson-file-import.worker.ts", import.meta.url), {
      type: "module",
      name: "dromap-geojson-import",
    });
    let settled = false;

    const cleanup = () => {
      worker.terminate();
      options.signal?.removeEventListener("abort", handleAbort);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const handleAbort = () => {
      fail(new GeoJsonFileImportError("cancelled", "Import GeoJSON annulé."));
    };

    if (options.signal?.aborted) {
      handleAbort();
      return;
    }
    options.signal?.addEventListener("abort", handleAbort, { once: true });

    worker.addEventListener("error", () => {
      fail(
        new GeoJsonFileImportError(
          "read-error",
          "Le module de lecture progressive du GeoJSON n’a pas pu démarrer.",
        ),
      );
    });

    worker.addEventListener("message", (event: MessageEvent<GeoJsonWorkerResponse>) => {
      const message = event.data;
      if (message.type === "progress") {
        options.onProgress?.({
          percent:
            message.totalBytes > 0
              ? Math.min(100, Math.round((message.bytesRead / message.totalBytes) * 100))
              : 0,
          bytesRead: message.bytesRead,
          totalBytes: message.totalBytes,
          parsedFeatures: message.parsedFeatures,
          retainedFeatures: message.retainedFeatures,
        });
        return;
      }
      if (message.type === "error") {
        fail(new GeoJsonFileImportError(message.code, message.message));
        return;
      }
      if (settled) return;

      try {
        const layer = createDromapGeoJsonLayerFromFeatures(message.features, {
          sourceName: file.name,
          layerName: file.name.replace(/\.(geojson|json)$/i, ""),
          existingLayerCount: options.existingLayerCount,
          precisionMode: effectivePrecision,
          skippedGeometries: message.skippedGeometries,
          coordinateCount: message.retainedCoordinates,
          bounds: message.bounds,
        });
        settled = true;
        cleanup();
        resolve({
          layer,
          summary: {
            progressive: true,
            automaticallyOptimized,
            serverProcessingCandidate:
              file.size >= GEOJSON_SERVER_PROCESSING_CANDIDATE_BYTES,
            parsedFeatures: message.parsedFeatures,
            retainedFeatures: message.retainedFeatures,
            outsideWorkspaceFeatures: message.outsideWorkspaceFeatures,
            skippedGeometries: message.skippedGeometries,
          },
        });
      } catch (error) {
        fail(
          error instanceof Error
            ? error
            : new GeoJsonFileImportError("read-error", "L’import GeoJSON a échoué."),
        );
      }
    });

    worker.postMessage({
      type: "parse",
      file,
      loadingBounds,
      precisionMode: effectivePrecision,
      limits: DEFAULT_WORKER_LIMITS,
    });
  });
}
