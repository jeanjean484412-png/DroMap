"use client";

import type { OvertureWorkerMessage, OvertureWorkerRequest, OvertureWorkerResult } from "./overture-buildings-protocol";
import type * as Runtime from "./overture-buildings-runtime";

type WorkerOptions = { signal?: AbortSignal; onProgress?: (message: string) => void };

class OvertureWorkerUnavailable extends Error {}
let idleWorker: Worker | null = null;
let idleWorkerTimer: number | undefined;

function takeWorker() {
  if (idleWorker) {
    const worker = idleWorker;
    idleWorker = null;
    window.clearTimeout(idleWorkerTimer);
    return worker;
  }
  return new Worker(new URL("./overture-buildings.worker.ts", import.meta.url), {
    type: "module",
    name: "dromap-overture-buildings",
  });
}

function releaseWorker(worker: Worker) {
  if (idleWorker) {
    worker.terminate();
    return;
  }
  // Buildings are often followed by a Places lookup; reuse the loaded catalog
  // and WASM for that request without keeping the worker for the entire session.
  idleWorker = worker;
  idleWorkerTimer = window.setTimeout(() => {
    idleWorker = null;
    worker.terminate();
  }, 60_000);
}

function abortError() {
  return new DOMException("Import annulé", "AbortError");
}

function runOvertureWorker(request: OvertureWorkerRequest, { signal, onProgress }: WorkerOptions) {
  return new Promise<OvertureWorkerResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    let worker: Worker;
    try {
      worker = takeWorker();
    } catch {
      reject(new OvertureWorkerUnavailable());
      return;
    }

    const cleanup = (reusable = false) => {
      window.clearTimeout(startupTimeout);
      signal?.removeEventListener("abort", abort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      if (reusable) releaseWorker(worker);
      else worker.terminate();
    };
    const abort = () => {
      cleanup();
      reject(abortError());
    };
    const fail = () => {
      cleanup();
      reject(new OvertureWorkerUnavailable());
    };
    const startupTimeout = window.setTimeout(fail, 15_000);
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = fail;
    worker.onmessageerror = fail;
    worker.onmessage = ({ data }: MessageEvent<OvertureWorkerMessage>) => {
      window.clearTimeout(startupTimeout);
      if (data.kind === "progress") {
        onProgress?.(data.message);
        return;
      }
      if (data.kind === "success") {
        cleanup(true);
        resolve(data.result);
      } else if (data.code && data.code !== "UNAVAILABLE") {
        cleanup(true);
        const { code, message } = data;
        void import("./overture-buildings-runtime").then(
          ({ OvertureBuildingsError }) => reject(new OvertureBuildingsError(code, message)),
          reject,
        );
      } else {
        fail();
      }
    };
    try {
      worker.postMessage(request);
    } catch {
      fail();
    }
  });
}

async function runWithFallback<T extends OvertureWorkerResult>(
  request: OvertureWorkerRequest,
  options: WorkerOptions,
  fallback: () => Promise<T>,
): Promise<T> {
  if (options.signal?.aborted) throw abortError();
  if (typeof Worker === "function") {
    try {
      return await runOvertureWorker(request, options) as T;
    } catch (error) {
      if (!(error instanceof OvertureWorkerUnavailable)) throw error;
    }
  }
  if (options.signal?.aborted) throw abortError();
  return fallback();
}

export const downloadOvertureBuildings: typeof Runtime.downloadOvertureBuildings = (bounds, options) =>
  runWithFallback({ kind: "buildings", bounds, maxFeatures: options.maxFeatures }, options,
    async () => (await import("./overture-buildings-runtime")).downloadOvertureBuildings(bounds, options));

export const enrichBuildingNamesFromOverturePlaces: typeof Runtime.enrichBuildingNamesFromOverturePlaces = (features, bounds, options = {}) =>
  runWithFallback({ kind: "names", bounds, features, maxPlaces: options.maxPlaces }, options,
    async () => (await import("./overture-buildings-runtime")).enrichBuildingNamesFromOverturePlaces(features, bounds, options));
