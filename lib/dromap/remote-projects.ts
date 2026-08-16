import {
  createDefaultProjectSetup,
  type DromapProject,
  type DromapProjectSetup,
  type DromapProjectStatus,
} from "@/lib/dromap/product";
import { DEFAULT_DROMAP_BASEMAP_ID } from "@/lib/dromap/basemap";

const REMOTE_CHUNK_CHARACTERS = 2_400_000;
const MAX_PARALLEL_CHUNKS = 2;

export type RemoteProjectManifest = {
  projectId: string;
  revision: string;
  chunkCount: number;
  encoding: "gzip-base64" | "base64";
  updatedAt: string;
  deletedAt: string | null;
  payloadSizeBytes: number;
  metadata?: Record<string, unknown>;
};

export class RemoteProjectConflictError extends Error {
  readonly current: RemoteProjectManifest | null;

  constructor(message: string, current: RemoteProjectManifest | null) {
    super(message);
    this.name = "RemoteProjectConflictError";
    this.current = current;
  }
}

async function readError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as {
      error?: unknown;
      current?: unknown;
    };
    if (typeof payload?.error === "string" && payload.error.trim()) return payload.error.trim();
  } catch {
    // Le message par défaut reste utilisé.
  }
  return fallback;
}

async function readConflict(response: Response) {
  try {
    const payload = (await response.json()) as { error?: unknown; current?: unknown };
    const current = normalizeManifest(payload.current);
    return {
      message:
        typeof payload.error === "string" && payload.error.trim()
          ? payload.error.trim()
          : "Ce projet a été modifié sur un autre appareil.",
      current,
    };
  } catch {
    return { message: "Ce projet a été modifié sur un autre appareil.", current: null };
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
    if (refreshed.ok) {
      response = await fetch(input, { ...init, credentials: "same-origin" });
    }
  } catch {
    // Le second appel n'est pas tenté si la session ne peut pas être renouvelée.
  }
  return response;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    const slice = bytes.subarray(index, Math.min(index + step, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function streamToBytes(stream: ReadableStream<Uint8Array>) {
  const response = new Response(stream);
  return new Uint8Array(await response.arrayBuffer());
}

function stripRuntimeFields(project: DromapProject): DromapProject {
  const {
    remoteRevision: _remoteRevision,
    remoteChunkCount: _remoteChunkCount,
    remoteEncoding: _remoteEncoding,
    remotePayloadSizeBytes: _remotePayloadSizeBytes,
    remoteUpdatedAt: _remoteUpdatedAt,
    contentLoaded: _contentLoaded,
    ...serializable
  } = project;
  return serializable as DromapProject;
}

async function encodeProject(project: DromapProject) {
  const json = JSON.stringify(stripRuntimeFields(project));
  const sourceBytes = new TextEncoder().encode(json);

  if (typeof CompressionStream !== "undefined") {
    try {
      const compressedStream = new Blob([sourceBytes])
        .stream()
        .pipeThrough(new CompressionStream("gzip"));
      const compressedBytes = await streamToBytes(compressedStream);
      return {
        encoded: bytesToBase64(compressedBytes),
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

async function decodeProject(
  encoded: string,
  encoding: RemoteProjectManifest["encoding"],
): Promise<DromapProject> {
  let bytes = base64ToBytes(encoded);
  if (encoding === "gzip-base64") {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Ce navigateur ne peut pas ouvrir ce projet compressé.");
    }
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    bytes = await streamToBytes(stream);
  }
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as DromapProject;
}

function splitEncodedPayload(value: string) {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += REMOTE_CHUNK_CHARACTERS) {
    chunks.push(value.slice(index, index + REMOTE_CHUNK_CHARACTERS));
  }
  return chunks.length > 0 ? chunks : [""];
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<void>,
) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await task(items[index], index);
    }
  });
  await Promise.all(workers);
}

function normalizeStatus(value: unknown, setupComplete: boolean): DromapProjectStatus {
  if (
    value === "setup-incomplete" ||
    value === "editing" ||
    value === "unsaved" ||
    value === "saving" ||
    value === "saved" ||
    value === "sync-pending" ||
    value === "trashed"
  ) {
    return value;
  }
  return setupComplete ? "saved" : "setup-incomplete";
}

function normalizeManifest(value: unknown): RemoteProjectManifest | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.projectId !== "string" ||
    typeof record.revision !== "string" ||
    typeof record.chunkCount !== "number" ||
    !Number.isInteger(record.chunkCount) ||
    record.chunkCount < 1 ||
    (record.encoding !== "gzip-base64" && record.encoding !== "base64")
  ) {
    return null;
  }
  return {
    projectId: record.projectId,
    revision: record.revision,
    chunkCount: record.chunkCount,
    encoding: record.encoding,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
    deletedAt: typeof record.deletedAt === "string" ? record.deletedAt : null,
    payloadSizeBytes:
      typeof record.payloadSizeBytes === "number" && Number.isFinite(record.payloadSizeBytes)
        ? record.payloadSizeBytes
        : 0,
    metadata:
      record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
        ? (record.metadata as Record<string, unknown>)
        : undefined,
  };
}

function lightweightSetup(metadata: Record<string, unknown> | undefined): DromapProjectSetup {
  const fallback = createDefaultProjectSetup(DEFAULT_DROMAP_BASEMAP_ID);
  const setup = metadata?.setup;
  if (!setup || typeof setup !== "object" || Array.isArray(setup)) return fallback;
  const record = setup as Record<string, unknown>;
  const currentStep = record.currentStep === 2 || record.currentStep === 3 || record.currentStep === 4
    ? record.currentStep
    : 1;
  const completedSteps = Array.isArray(record.completedSteps)
    ? record.completedSteps.filter((value): value is 1 | 2 | 3 | 4 =>
        value === 1 || value === 2 || value === 3 || value === 4,
      )
    : [];
  return {
    ...fallback,
    currentStep,
    completedSteps,
    basemapId:
      typeof record.basemapId === "string"
        ? (record.basemapId as DromapProjectSetup["basemapId"])
        : fallback.basemapId,
    workspaceBounds:
      record.workspaceBounds && typeof record.workspaceBounds === "object"
        ? (record.workspaceBounds as typeof fallback.workspaceBounds)
        : null,
    workspaceView:
      record.workspaceView && typeof record.workspaceView === "object"
        ? (record.workspaceView as typeof fallback.workspaceView)
        : null,
    // Le choix complet peut contenir des milliers d'objets. Il reste dans le contenu chargé à l'ouverture.
    layerChoice: null,
  };
}

export function createRemoteProjectMetadata(project: DromapProject) {
  return {
    name: project.name,
    creatorName: project.creatorName,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    lastSavedAt: project.lastSavedAt,
    status: project.status,
    setupComplete: project.setupComplete,
    setup: {
      currentStep: project.setup.currentStep,
      completedSteps: project.setup.completedSteps,
      basemapId: project.setup.basemapId,
      workspaceBounds: project.setup.workspaceBounds,
      workspaceView: project.setup.workspaceView,
    },
    pendingChanges: project.pendingChanges,
    thumbnailDataUrl: project.thumbnailDataUrl,
    importedFileName: project.importedFileName,
  };
}

export function manifestToProjectSummary(manifest: RemoteProjectManifest): DromapProject {
  const metadata = manifest.metadata;
  const setupComplete = metadata?.setupComplete === true;
  const name = typeof metadata?.name === "string" && metadata.name.trim()
    ? metadata.name.trim()
    : "Projet DroMap";
  const creatorName = typeof metadata?.creatorName === "string" && metadata.creatorName.trim()
    ? metadata.creatorName.trim()
    : "Utilisateur DroMap";
  const createdAt = typeof metadata?.createdAt === "string" && metadata.createdAt
    ? metadata.createdAt
    : manifest.updatedAt || new Date().toISOString();
  return {
    id: manifest.projectId,
    name,
    creatorName,
    createdAt,
    updatedAt:
      typeof metadata?.updatedAt === "string" && metadata.updatedAt
        ? metadata.updatedAt
        : manifest.updatedAt || createdAt,
    lastSavedAt: typeof metadata?.lastSavedAt === "string" ? metadata.lastSavedAt : null,
    deletedAt: manifest.deletedAt,
    status: manifest.deletedAt
      ? "trashed"
      : normalizeStatus(metadata?.status, setupComplete),
    setupComplete,
    setup: lightweightSetup(metadata),
    editorSnapshot: null,
    pendingChanges:
      typeof metadata?.pendingChanges === "number" && Number.isFinite(metadata.pendingChanges)
        ? Math.max(0, Math.floor(metadata.pendingChanges))
        : 0,
    thumbnailDataUrl:
      typeof metadata?.thumbnailDataUrl === "string" ? metadata.thumbnailDataUrl : null,
    importedFileName:
      typeof metadata?.importedFileName === "string" ? metadata.importedFileName : null,
    remoteRevision: manifest.revision,
    remoteChunkCount: manifest.chunkCount,
    remoteEncoding: manifest.encoding,
    remotePayloadSizeBytes: manifest.payloadSizeBytes,
    remoteUpdatedAt: manifest.updatedAt,
    contentLoaded: false,
  };
}

function projectManifestFromProject(project: DromapProject): RemoteProjectManifest | null {
  if (
    typeof project.remoteRevision !== "string" ||
    typeof project.remoteChunkCount !== "number" ||
    !Number.isInteger(project.remoteChunkCount) ||
    project.remoteChunkCount < 1 ||
    (project.remoteEncoding !== "gzip-base64" && project.remoteEncoding !== "base64")
  ) {
    return null;
  }
  return {
    projectId: project.id,
    revision: project.remoteRevision,
    chunkCount: project.remoteChunkCount,
    encoding: project.remoteEncoding,
    updatedAt: project.remoteUpdatedAt ?? project.updatedAt,
    deletedAt: project.deletedAt,
    payloadSizeBytes: project.remotePayloadSizeBytes ?? 0,
  };
}

async function uploadChunk(projectId: string, revision: string, chunk: string, chunkIndex: number) {
  const response = await fetchWithSessionRefresh(
    `/api/dromap/projects/${encodeURIComponent(projectId)}/chunks/${chunkIndex}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision, chunk }),
    },
  );
  if (!response.ok) {
    throw new Error(await readError(response, "Une partie du projet n’a pas pu être enregistrée en ligne."));
  }
}

async function fetchChunk(projectId: string, revision: string, chunkIndex: number) {
  const response = await fetchWithSessionRefresh(
    `/api/dromap/projects/${encodeURIComponent(projectId)}/chunks/${chunkIndex}?revision=${encodeURIComponent(revision)}`,
    { method: "GET", cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(await readError(response, "Une partie du projet n’a pas pu être chargée."));
  }
  const payload = (await response.json()) as { chunk?: unknown };
  if (typeof payload.chunk !== "string") throw new Error("Le projet en ligne est incomplet.");
  return payload.chunk;
}

export async function putRemoteProject(
  project: DromapProject,
  expectedRevision: string | null,
  expectedUpdatedAt: string | null = project.remoteUpdatedAt ?? null,
): Promise<RemoteProjectManifest> {
  const { encoded, encoding, payloadSizeBytes } = await encodeProject(project);
  const chunks = splitEncodedPayload(encoded);
  const revision = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await runWithConcurrency(chunks, MAX_PARALLEL_CHUNKS, async (chunk, index) => {
    await uploadChunk(project.id, revision, chunk, index);
  });

  const response = await fetchWithSessionRefresh(
    `/api/dromap/projects/${encodeURIComponent(project.id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        revision,
        expectedRevision,
        expectedUpdatedAt,
        chunkCount: chunks.length,
        encoding,
        payloadSizeBytes,
        updatedAt: project.updatedAt,
        deletedAt: project.deletedAt,
        metadata: createRemoteProjectMetadata(project),
      }),
    },
  );
  if (response.status === 409) {
    const conflict = await readConflict(response);
    throw new RemoteProjectConflictError(conflict.message, conflict.current);
  }
  if (!response.ok) {
    throw new Error(await readError(response, "Le projet n’a pas pu être enregistré en ligne."));
  }
  const payload = (await response.json()) as { manifest?: unknown };
  return normalizeManifest(payload.manifest) ?? {
    projectId: project.id,
    revision,
    chunkCount: chunks.length,
    encoding,
    updatedAt: new Date().toISOString(),
    deletedAt: project.deletedAt,
    payloadSizeBytes,
    metadata: createRemoteProjectMetadata(project),
  };
}

export async function patchRemoteProjectMetadata(
  project: DromapProject,
  expectedRevision: string,
  expectedUpdatedAt: string | null = project.remoteUpdatedAt ?? null,
): Promise<RemoteProjectManifest> {
  const response = await fetchWithSessionRefresh(
    `/api/dromap/projects/${encodeURIComponent(project.id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedRevision,
        expectedUpdatedAt,
        updatedAt: project.updatedAt,
        deletedAt: project.deletedAt,
        metadata: createRemoteProjectMetadata(project),
      }),
    },
  );
  if (response.status === 409) {
    const conflict = await readConflict(response);
    throw new RemoteProjectConflictError(conflict.message, conflict.current);
  }
  if (!response.ok) {
    throw new Error(await readError(response, "Les informations du projet n’ont pas pu être synchronisées."));
  }
  const payload = (await response.json()) as { manifest?: unknown };
  const manifest = normalizeManifest(payload.manifest);
  if (!manifest) throw new Error("La réponse de synchronisation du projet est incomplète.");
  return manifest;
}

export async function fetchRemoteProjectSummaries(): Promise<DromapProject[]> {
  const response = await fetchWithSessionRefresh("/api/dromap/projects", {
    method: "GET",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await readError(response, "Les projets en ligne n’ont pas pu être chargés."));
  }

  const payload = (await response.json()) as { manifests?: unknown };
  if (!Array.isArray(payload.manifests)) return [];
  return payload.manifests
    .map(normalizeManifest)
    .filter((manifest): manifest is RemoteProjectManifest => Boolean(manifest))
    .map(manifestToProjectSummary);
}

export async function fetchRemoteProjectManifest(projectId: string): Promise<RemoteProjectManifest | null> {
  const response = await fetchWithSessionRefresh(
    `/api/dromap/projects/${encodeURIComponent(projectId)}`,
    { method: "GET", cache: "no-store" },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(await readError(response, "Le projet en ligne n’a pas pu être vérifié."));
  }
  const payload = (await response.json()) as { manifest?: unknown };
  return normalizeManifest(payload.manifest);
}

export async function fetchRemoteProject(
  source: DromapProject | RemoteProjectManifest,
): Promise<DromapProject> {
  const manifest = "projectId" in source ? source : projectManifestFromProject(source);
  if (!manifest) throw new Error("Les informations nécessaires au chargement en ligne sont absentes.");

  const indexes = Array.from({ length: manifest.chunkCount }, (_, index) => index);
  const chunks = new Array<string>(manifest.chunkCount);
  await runWithConcurrency(indexes, MAX_PARALLEL_CHUNKS, async (chunkIndex) => {
    chunks[chunkIndex] = await fetchChunk(manifest.projectId, manifest.revision, chunkIndex);
  });
  const decoded = await decodeProject(chunks.join(""), manifest.encoding);
  const metadata = manifest.metadata ?? {};
  const sourceProject = "projectId" in source ? null : source;

  // Les changements légers (nom, miniature, corbeille, nom du créateur) ne
  // réécrivent volontairement pas les gros chunks. Au chargement, le manifeste
  // et ses métadonnées restent donc prioritaires pour ces champs de projet.
  const metadataName = typeof metadata.name === "string" && metadata.name.trim() ? metadata.name.trim() : null;
  const metadataCreator =
    typeof metadata.creatorName === "string" && metadata.creatorName.trim()
      ? metadata.creatorName.trim()
      : null;
  const metadataUpdatedAt =
    typeof metadata.updatedAt === "string" && metadata.updatedAt ? metadata.updatedAt : null;
  const metadataLastSavedAt =
    typeof metadata.lastSavedAt === "string" ? metadata.lastSavedAt : undefined;
  const metadataThumbnail = Object.prototype.hasOwnProperty.call(metadata, "thumbnailDataUrl")
    ? typeof metadata.thumbnailDataUrl === "string"
      ? metadata.thumbnailDataUrl
      : null
    : undefined;
  const metadataImportedFile = Object.prototype.hasOwnProperty.call(metadata, "importedFileName")
    ? typeof metadata.importedFileName === "string"
      ? metadata.importedFileName
      : null
    : undefined;
  const metadataSetupComplete =
    typeof metadata.setupComplete === "boolean" ? metadata.setupComplete : undefined;
  const metadataStatus = metadata.status;

  const setupComplete =
    sourceProject?.setupComplete ?? metadataSetupComplete ?? decoded.setupComplete;
  const normalizedRemoteStatus = manifest.deletedAt
    ? "trashed"
    : sourceProject?.status ??
      (metadataStatus !== undefined
        ? normalizeStatus(metadataStatus, setupComplete)
        : decoded.status);

  return {
    ...decoded,
    name: sourceProject?.name ?? metadataName ?? decoded.name,
    creatorName: sourceProject?.creatorName ?? metadataCreator ?? decoded.creatorName,
    updatedAt: sourceProject?.updatedAt ?? metadataUpdatedAt ?? decoded.updatedAt,
    lastSavedAt: sourceProject
      ? sourceProject.lastSavedAt
      : metadataLastSavedAt !== undefined
        ? metadataLastSavedAt
        : decoded.lastSavedAt,
    deletedAt: sourceProject ? sourceProject.deletedAt : manifest.deletedAt ?? decoded.deletedAt,
    status: normalizedRemoteStatus,
    setupComplete,
    thumbnailDataUrl: sourceProject
      ? sourceProject.thumbnailDataUrl
      : metadataThumbnail !== undefined
        ? metadataThumbnail
        : decoded.thumbnailDataUrl,
    importedFileName: sourceProject
      ? sourceProject.importedFileName
      : metadataImportedFile !== undefined
        ? metadataImportedFile
        : decoded.importedFileName,
    pendingChanges: 0,
    remoteRevision: manifest.revision,
    remoteChunkCount: manifest.chunkCount,
    remoteEncoding: manifest.encoding,
    remotePayloadSizeBytes: manifest.payloadSizeBytes,
    remoteUpdatedAt: manifest.updatedAt,
    contentLoaded: true,
  };
}

export async function deleteRemoteProject(projectId: string) {
  const response = await fetchWithSessionRefresh(
    `/api/dromap/projects/${encodeURIComponent(projectId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw new Error(await readError(response, "Le projet n’a pas pu être supprimé en ligne."));
  }
}
