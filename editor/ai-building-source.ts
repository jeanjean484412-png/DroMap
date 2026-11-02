import type { DromapGeoJsonFeature } from "@/stores/editor-geojson-layers";

const SOURCES = {
  ign: { sourceLabel: "IGN BD TOPO®", sourceUrl: "https://geoservices.ign.fr/bdtopo", sourceLicense: "Licence ouverte Etalab 2.0", sourceAttribution: "IGN" },
  osm: { sourceLabel: "OpenStreetMap — Bâtiments", sourceUrl: "https://www.openstreetmap.org/copyright", sourceLicense: "ODbL", sourceAttribution: "© OpenStreetMap contributors" },
};

export function buildingSource(features: Array<{ properties?: Record<string, unknown> | null }>) {
  const osm = features.some(feature => feature.properties?.__dromapBuildingProvider === "osm");
  const ign = features.some(feature => feature.properties?.__dromapBuildingProvider !== "osm");
  if (osm && ign) return { sourceLabel: "IGN BD TOPO® / OpenStreetMap", sourceLicense: "Licence ouverte Etalab 2.0 / ODbL", sourceAttribution: "IGN / © OpenStreetMap contributors" };
  return osm ? SOURCES.osm : SOURCES.ign;
}

export async function fetchAiBuildings(bounds: { south: number; west: number; north: number; east: number }, maxFeatures: number): Promise<DromapGeoJsonFeature[]> {
  const params = new URLSearchParams(Object.entries(bounds).map(([key, value]) => [key, String(value)]));
  const failures: string[] = [];
  for (const provider of ["ign", "osm"] as const) {
    let response: Response;
    let data: { error?: string; features?: DromapGeoJsonFeature[] };
    try {
      response = await fetch(`/api/dromap/buildings?${params}&provider=${provider}`, {
        headers: { Accept: "application/geo+json,application/json" }, cache: "no-store", signal: AbortSignal.timeout(65_000),
      });
      data = await response.json();
    } catch (error) {
      failures.push(`${SOURCES[provider].sourceLabel} : ${error instanceof Error ? error.message : "connexion impossible"}`);
      continue;
    }
    // A size limit is not an outage: never return a smaller substitute dataset.
    if (response.status === 413) throw new Error(data.error ?? "La zone contient trop de bâtiments. Réduis-la.");
    if (response.ok && Array.isArray(data.features) && data.features.length) {
      if (data.features.length > maxFeatures) throw new Error(`Plus de ${maxFeatures} bâtiments ont été trouvés. Réduis la zone.`);
      return data.features.map(feature => ({ ...feature, properties: { ...feature.properties, __dromapBuildingProvider: provider } }));
    }
    failures.push(`${SOURCES[provider].sourceLabel} : ${data.error ?? "aucun bâtiment trouvé"}`);
  }
  throw new Error(`La recherche de bâtiments n’a pas abouti. ${failures.join(" ; ")}`);
}
