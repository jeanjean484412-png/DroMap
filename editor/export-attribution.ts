import type { DroMapFeature } from "@/lib/dromap/feature";
import type { DromapGeoJsonLayer } from "@/stores/editor-geojson-layers";

function extractAttributionDate(value: string | null | undefined) {
  const safeValue = value?.trim();

  if (!safeValue) {
    return null;
  }

  const isoDate = safeValue.match(/\b(?:19|20)\d{2}-\d{2}-\d{2}\b/);
  if (isoDate) {
    return isoDate[0];
  }

  const yearMonth = safeValue.match(/\b(?:19|20)\d{2}-\d{2}\b/);
  if (yearMonth) {
    return yearMonth[0];
  }

  const year = safeValue.match(/\b(?:19|20)\d{2}\b/);
  return year?.[0] ?? null;
}

function normalizeDataAttributionPart(
  attribution: string | null | undefined,
  license: string | null | undefined,
  version: string | null | undefined = undefined,
) {
  const safeAttribution = attribution?.trim();
  const safeLicense = license?.trim();

  if (!safeAttribution) {
    return null;
  }

  if (/domaine public|public domain|\bcc0\b/i.test(safeLicense ?? "")) {
    return null;
  }

  if (/etalab|licence ouverte/i.test(safeLicense ?? "")) {
    const date = extractAttributionDate(version);
    return date ? `${safeAttribution} (${date})` : safeAttribution;
  }

  if (/cc\s*-?\s*by/i.test(safeLicense ?? "")) {
    return safeAttribution.toLowerCase().includes("cc by")
      ? safeAttribution
      : `${safeAttribution} (CC BY 4.0)`;
  }

  if (/odbl/i.test(safeLicense ?? "")) {
    return /odbl|openstreetmap\.org\/copyright/i.test(safeAttribution)
      ? safeAttribution
      : `${safeAttribution} (ODbL)`;
  }

  return safeAttribution;
}

function inferFeatureSourceAttribution(
  source: DroMapFeature["properties"]["source"],
) {
  if (!source) {
    return null;
  }

  const explicit = normalizeDataAttributionPart(
    source.sourceAttribution,
    source.sourceLicense,
    source.sourceVersion,
  );

  if (explicit) {
    return explicit;
  }

  const sourceName = source.sourceName?.toLowerCase() ?? "";

  if (sourceName.includes("overture-buildings")) {
    return "© OpenStreetMap contributors, Overture Maps Foundation — openstreetmap.org/copyright";
  }

  if (sourceName.includes("ign-bdtopo") || sourceName.includes("bd topo")) {
    return "Source : IGN · BD TOPO®";
  }

  return null;
}

export function getDromapExportDataAttributionText(
  features: DroMapFeature[],
  geoJsonLayers: DromapGeoJsonLayer[] = [],
) {
  const parts = new Set<string>();

  for (const layer of geoJsonLayers) {
    const part = normalizeDataAttributionPart(
      layer.sourceAttribution,
      layer.sourceLicense,
      layer.sourceVersion,
    );
    if (part) parts.add(part);
  }

  for (const feature of features) {
    const part = inferFeatureSourceAttribution(feature.properties.source);
    if (part) parts.add(part);
  }

  return [...parts].join(" · ");
}
