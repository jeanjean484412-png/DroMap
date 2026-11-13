import type { DromapProject } from "./product";

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

export async function encodeProject(project: DromapProject) {
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

export async function decodeProject(
  encoded: string,
  encoding: "gzip-base64" | "base64",
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
