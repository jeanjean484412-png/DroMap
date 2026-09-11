import "server-only";

import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";

const decompress = promisify(gunzip);
const compress = promisify(gzip);
const MAX_BYTES = 64 * 1024 * 1024;
const CHUNK_CHARACTERS = 2_400_000;
const SNAPSHOT_FIELDS = [
  "schemaVersion", "savedAt", "features", "workspaceBounds", "mapView", "workspaceBasemapZoom",
  "workspaceBasemapBaseZoom", "basemapId", "showBasemapLabels", "showCountryNeighborContext",
  "showAllFeatureLabels", "showAllGeoJsonFeatureLabels", "featureMapLabelScale", "featureMapLabelOutlineWidth",
  "layers", "activeLayerId", "geoJsonLayers", "customMarkers", "exportSettings",
];

export function publicProjectContent(value: unknown) {
  const project = value as Record<string, unknown> | null;
  const snapshot = project?.editorSnapshot as Record<string, unknown> | null;
  if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.features)) {
    throw new Error("PUBLICATION_SOURCE_CHUNK_INVALID");
  }
  const setup = project?.setup as Record<string, unknown> | undefined;
  // Seules les données nécessaires à la carte sont publiques. La discussion IA,
  // les métadonnées du compte et les futurs champs privés restent dans le projet.
  return {
    editorSnapshot: Object.fromEntries(SNAPSHOT_FIELDS.filter(key => Object.hasOwn(snapshot, key)).map(key => [key, snapshot[key]])),
    setup: {
      basemapId: setup?.basemapId,
      workspaceBounds: setup?.workspaceBounds,
      workspaceView: setup?.workspaceView,
    },
  };
}

export async function sanitizePublicationChunks(chunks: string[], encoding: "base64" | "gzip-base64") {
  if (chunks.reduce((total, chunk) => total + chunk.length, 0) > MAX_BYTES) {
    throw new Error("PUBLICATION_SOURCE_CHUNK_INVALID");
  }
  let bytes = Buffer.from(chunks.join(""), "base64");
  if (encoding === "gzip-base64") bytes = await decompress(bytes, { maxOutputLength: MAX_BYTES });
  if (bytes.length > MAX_BYTES) throw new Error("PUBLICATION_SOURCE_CHUNK_INVALID");
  const content = publicProjectContent(JSON.parse(bytes.toString("utf8")));
  const json = Buffer.from(JSON.stringify(content));
  const encoded = (await compress(json)).toString("base64");
  const safeChunks: string[] = [];
  for (let offset = 0; offset < encoded.length; offset += CHUNK_CHARACTERS) safeChunks.push(encoded.slice(offset, offset + CHUNK_CHARACTERS));
  return { chunks: safeChunks, encoding: "gzip-base64" as const, payloadSizeBytes: json.length };
}
