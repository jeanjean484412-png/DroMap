"use client";
import { readBoundedBytes } from "@/lib/dromap/bounded-stream";

const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
async function boundedJson(response: Response, maxBytes: number) {
  return JSON.parse(new TextDecoder().decode(await readBoundedBytes(response.body, maxBytes)));
}

import type { DromapProject } from "@/lib/dromap/product";
import type { DromapEditorProjectSnapshot } from "@/lib/dromap/editor-project-persistence";

export type DromapPublicationSourceResult = {
  copyProof: { projectId: string; token: string };
  sourceName: string;
  snapshot: DromapEditorProjectSnapshot;
  basemapId: DromapProject["setup"]["basemapId"];
  workspaceBounds: DromapProject["setup"]["workspaceBounds"];
  workspaceView: DromapProject["setup"]["workspaceView"];
  attribution: {
    publicationSlug: string;
    creatorName: string;
    allowRemoval: boolean;
  };
  purchased: boolean;
};

type SourceManifest = {
  revision: string;
  chunkCount: number;
  encoding: "gzip-base64" | "base64";
  payloadSizeBytes: number;
};

function readApiError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const error = (payload as Record<string, unknown>).error;
    if (typeof error === "string" && error.trim()) return error.trim();
  }
  return fallback;
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function decodeProject(encoded: string, encoding: SourceManifest["encoding"]) {
  if (encoded.length > MAX_SOURCE_BYTES) throw new Error("La version modifiable est trop volumineuse.");
  let bytes = base64ToBytes(encoded);
  if (encoding === "gzip-base64") {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Ce navigateur ne peut pas ouvrir cette version modifiable compressée.");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    bytes = await readBoundedBytes(stream, MAX_SOURCE_BYTES);
  }
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as DromapProject;
}

export async function fetchDromapPublicationSource(
  slug: string,
): Promise<DromapPublicationSourceResult> {
  const response = await fetch(`/api/dromap/publications/${encodeURIComponent(slug)}/source`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload = (await boundedJson(response, 64 * 1024).catch(() => null)) as
    | {
        manifest?: SourceManifest;
        copyProof?: { projectId: string; token: string };
        sourceName?: string;
        attribution?: {
          publicationSlug?: string;
          creatorName?: string;
          allowRemoval?: boolean;
        };
        purchased?: boolean;
        error?: string;
      }
    | null;
  if (!response.ok || !payload?.manifest || !payload.copyProof?.projectId || !payload.copyProof.token) {
    throw new Error(readApiError(payload, "La version modifiable n’est pas disponible."));
  }

  const manifest = payload.manifest;
  if (!Number.isInteger(manifest.chunkCount) || manifest.chunkCount < 1 || manifest.chunkCount > 128 ||
      (manifest.encoding !== "gzip-base64" && manifest.encoding !== "base64")) {
    throw new Error("La version modifiable publiée est incomplète.");
  }

  const chunks = new Array<string>(manifest.chunkCount);
  let encodedSize = 0;
  for (let index = 0; index < manifest.chunkCount; index += 1) {
    const chunkResponse = await fetch(
      `/api/dromap/publications/${encodeURIComponent(slug)}/source/chunks/${index}`,
      { method: "GET", credentials: "same-origin", cache: "no-store" },
    );
    const chunkPayload = (await boundedJson(chunkResponse, 2_710_000).catch(() => null)) as
      | { chunk?: string; error?: string }
      | null;
    if (!chunkResponse.ok || typeof chunkPayload?.chunk !== "string") {
      throw new Error(readApiError(chunkPayload, "Une partie de la carte modifiable n’a pas pu être chargée."));
    }
    encodedSize += chunkPayload.chunk.length;
    if (encodedSize > MAX_SOURCE_BYTES) throw new Error("La version modifiable est trop volumineuse.");
    chunks[index] = chunkPayload.chunk;
  }

  const project = await decodeProject(chunks.join(""), manifest.encoding);
  if (!project || typeof project !== "object" || !project.editorSnapshot) {
    throw new Error("La publication ne contient pas de projet DroMap modifiable valide.");
  }

  const attribution = payload.attribution;
  return {
    copyProof: payload.copyProof,
    sourceName:
      typeof payload.sourceName === "string" && payload.sourceName.trim()
        ? payload.sourceName.trim()
        : project.name || "Carte publique",
    snapshot: project.editorSnapshot,
    basemapId: project.editorSnapshot.basemapId ?? project.setup?.basemapId,
    workspaceBounds: project.editorSnapshot.workspaceBounds ?? project.setup?.workspaceBounds ?? null,
    workspaceView: project.editorSnapshot.mapView ?? project.setup?.workspaceView ?? null,
    attribution: {
      publicationSlug:
        typeof attribution?.publicationSlug === "string" && attribution.publicationSlug
          ? attribution.publicationSlug
          : slug,
      creatorName:
        typeof attribution?.creatorName === "string" && attribution.creatorName.trim()
          ? attribution.creatorName.trim()
          : "Utilisateur DroMap",
      allowRemoval: attribution?.allowRemoval === true,
    },
    purchased: payload.purchased === true,
  };
}
