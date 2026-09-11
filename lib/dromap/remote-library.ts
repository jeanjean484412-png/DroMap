import type { DroMapCustomMarkerDefinition } from "@/stores/editor-custom-markers";
import type { DroMapSavedLayer } from "@/stores/editor-layers";
import type { DromapSavedGeoJsonLayer } from "@/stores/editor-geojson-layers";

const REMOTE_CHUNK_CHARACTERS = 2_400_000;
const MAX_PARALLEL_CHUNKS = 2;

export type DromapLibraryTombstones = {
  customMarkers: Record<string, string>;
  savedLayers: Record<string, string>;
  savedGeoJsonLayers: Record<string, string>;
};

export type DromapPersonalLibraryPayload = {
  schemaVersion: 1;
  updatedAt: string;
  customMarkers: DroMapCustomMarkerDefinition[];
  savedLayers: DroMapSavedLayer[];
  savedGeoJsonLayers: DromapSavedGeoJsonLayer[];
  tombstones: DromapLibraryTombstones;
};

export type RemoteLibraryManifest = {
  revision: string;
  chunkCount: number;
  encoding: "gzip-base64" | "base64";
  updatedAt: string;
  payloadSizeBytes: number;
};

export class RemoteLibraryConflictError extends Error {
  readonly current: RemoteLibraryManifest | null;

  constructor(message: string, current: RemoteLibraryManifest | null) {
    super(message);
    this.name = "RemoteLibraryConflictError";
    this.current = current;
  }
}

async function fetchWithSessionRefresh(input: RequestInfo | URL, init: RequestInit = {}) {
  let response = await fetch(input, { ...init, credentials: "same-origin" });
  if (response.status !== 401) return response;
  try {
    const refreshed = await fetch("/api/dromap/auth/session", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (refreshed.ok) response = await fetch(input, { ...init, credentials: "same-origin" });
  } catch {
    // Repli sur la première réponse.
  }
  return response;
}

async function readError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.trim()) return payload.error.trim();
  } catch {
    // Message par défaut.
  }
  return fallback;
}

function normalizeManifest(value: unknown): RemoteLibraryManifest | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.revision !== "string" ||
    typeof record.chunkCount !== "number" ||
    !Number.isInteger(record.chunkCount) ||
    record.chunkCount < 1 ||
    (record.encoding !== "gzip-base64" && record.encoding !== "base64")
  ) return null;
  return {
    revision: record.revision,
    chunkCount: record.chunkCount,
    encoding: record.encoding,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
    payloadSizeBytes:
      typeof record.payloadSizeBytes === "number" && Number.isFinite(record.payloadSizeBytes)
        ? record.payloadSizeBytes
        : 0,
  };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function streamToBytes(stream: ReadableStream<Uint8Array>) {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function encodePayload(payload: DromapPersonalLibraryPayload) {
  const sourceBytes = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream !== "undefined") {
    try {
      const compressed = await streamToBytes(
        new Blob([sourceBytes]).stream().pipeThrough(new CompressionStream("gzip")),
      );
      return {
        encoded: bytesToBase64(compressed),
        encoding: "gzip-base64" as const,
        payloadSizeBytes: sourceBytes.byteLength,
      };
    } catch {
      // Repli sans compression.
    }
  }
  return {
    encoded: bytesToBase64(sourceBytes),
    encoding: "base64" as const,
    payloadSizeBytes: sourceBytes.byteLength,
  };
}

async function decodePayload(encoded: string, encoding: RemoteLibraryManifest["encoding"]) {
  let bytes = base64ToBytes(encoded);
  if (encoding === "gzip-base64") {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Ce navigateur ne peut pas ouvrir la bibliothèque synchronisée.");
    }
    bytes = await streamToBytes(
      new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
    );
  }
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("La bibliothèque en ligne est invalide.");
  }
  return parsed as DromapPersonalLibraryPayload;
}

function splitPayload(value: string) {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += REMOTE_CHUNK_CHARACTERS) {
    chunks.push(value.slice(index, index + REMOTE_CHUNK_CHARACTERS));
  }
  return chunks.length ? chunks : [""];
}

async function runWithConcurrency<T>(items: T[], concurrency: number, task: (item: T, index: number) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, items.length), concurrency) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await task(items[index], index);
    }
  });
  await Promise.all(workers);
}

export async function fetchRemoteLibraryManifest(): Promise<RemoteLibraryManifest | null> {
  const response = await fetchWithSessionRefresh("/api/dromap/library", { method: "GET", cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await readError(response, "La bibliothèque en ligne n’a pas pu être vérifiée."));
  const payload = (await response.json()) as { manifest?: unknown };
  return normalizeManifest(payload.manifest);
}

async function fetchChunk(manifest: RemoteLibraryManifest, chunkIndex: number) {
  const response = await fetchWithSessionRefresh(
    `/api/dromap/library/chunks/${chunkIndex}?revision=${encodeURIComponent(manifest.revision)}`,
    { method: "GET", cache: "no-store" },
  );
  if (!response.ok) throw new Error(await readError(response, "Une partie de la bibliothèque n’a pas pu être chargée."));
  const payload = (await response.json()) as { chunk?: unknown };
  if (typeof payload.chunk !== "string") throw new Error("La bibliothèque en ligne est incomplète.");
  return payload.chunk;
}

export async function fetchRemotePersonalLibrary(
  manifest?: RemoteLibraryManifest | null,
): Promise<{ manifest: RemoteLibraryManifest; payload: DromapPersonalLibraryPayload } | null> {
  const activeManifest = manifest ?? await fetchRemoteLibraryManifest();
  if (!activeManifest) return null;
  const indexes = Array.from({ length: activeManifest.chunkCount }, (_, index) => index);
  const chunks = new Array<string>(activeManifest.chunkCount);
  await runWithConcurrency(indexes, MAX_PARALLEL_CHUNKS, async (chunkIndex) => {
    chunks[chunkIndex] = await fetchChunk(activeManifest, chunkIndex);
  });
  return { manifest: activeManifest, payload: await decodePayload(chunks.join(""), activeManifest.encoding) };
}

export async function putRemotePersonalLibrary(
  payload: DromapPersonalLibraryPayload,
  expectedRevision: string | null,
): Promise<RemoteLibraryManifest> {
  const encodedPayload = await encodePayload(payload);
  const chunks = splitPayload(encodedPayload.encoded);
  const revision = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await runWithConcurrency(chunks, MAX_PARALLEL_CHUNKS, async (chunk, index) => {
    const response = await fetchWithSessionRefresh(`/api/dromap/library/chunks/${index}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision, chunk }),
    });
    if (!response.ok) throw new Error(await readError(response, "La bibliothèque n’a pas pu être enregistrée en ligne."));
  });

  const response = await fetchWithSessionRefresh("/api/dromap/library", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      revision,
      expectedRevision,
      chunkCount: chunks.length,
      encoding: encodedPayload.encoding,
      payloadSizeBytes: encodedPayload.payloadSizeBytes,
      updatedAt: payload.updatedAt,
    }),
  });
  if (response.status === 409) {
    let current: RemoteLibraryManifest | null = null;
    let message = "Ta bibliothèque a été modifiée sur un autre appareil.";
    try {
      const body = (await response.json()) as { current?: unknown; error?: unknown };
      current = normalizeManifest(body.current);
      if (typeof body.error === "string" && body.error.trim()) message = body.error.trim();
    } catch {
      // Valeurs par défaut.
    }
    throw new RemoteLibraryConflictError(message, current);
  }
  if (!response.ok) throw new Error(await readError(response, "La bibliothèque n’a pas pu être synchronisée."));
  const result = (await response.json()) as { manifest?: unknown };
  const manifest = normalizeManifest(result.manifest);
  if (!manifest) throw new Error("La réponse de synchronisation de la bibliothèque est incomplète.");
  return manifest;
}
