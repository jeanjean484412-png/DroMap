import "server-only";
import { DROMAP_GEOJSON_CATALOG } from "@/editor/geojson-data-catalog";
import { readPublicUrl } from "./public-url";

export type LandGeometry = { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] };
type Feature = { type: "Feature"; geometry: LandGeometry; properties: Record<string, unknown> };
const cache = new Map<string, Promise<Feature[]>>();
export const normalizePlaceName = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function dataset(id: string) {
  const entry = DROMAP_GEOJSON_CATALOG.find(item => item.id === id)!;
  let request = cache.get(id);
  if (!request) {
    request = readPublicUrl(new URL(entry.downloadUrl), 25 * 1024 * 1024, 45_000).then(text => {
      const data = JSON.parse(text);
      return (data.type === "Feature" ? [data] : data.features ?? []) as Feature[];
    });
    cache.set(id, request);
    request.catch(() => cache.delete(id));
  }
  return { entry, features: await request };
}

// These datasets describe land. Never substitute a geocoder's administrative
// relation: its polygon can include territorial waters.
export async function resolveLandBoundary(query: string, inSentence = false) {
  const text = normalizePlaceName(inSentence ? query : query.replace(/,\s*France\s*$/i, ""));
  const metropolitan = /\bfrance metropolitaine\b/.test(text);
  const matchText = text.replace(/\bfrance metropolitaine\b/g, "france");
  const matches = (name: unknown) => {
    if (typeof name !== "string" || !name.trim()) return false;
    const key = normalizePlaceName(name);
    return inSentence ? (` ${matchText} `).includes(` ${key} `) : matchText === key ||
      matchText.replace(/^(?:le|la|les|l) /, "").replace(/^(?:region|departement|pays)(?: de| du| d| des)? /, "").replace(/ (?:\d{2,3}|2a|2b)$/, "") === key;
  };
  const subdivision = /\b(region|departement)\b/.test(text);
  // Prefer a subdivision over a country mentioned as a qualifier (Paris, France).
  const ids = subdivision ? ["france-departments-detailed", "france-regions-detailed"]
    : ["natural-earth-countries-10m", "france-regions-detailed", "france-departments-detailed"];
  for (const id of ids) {
    if (/\bregion\b/.test(text) && id.includes("departments")) continue;
    if (/\bdepartement\b/.test(text) && id.includes("regions")) continue;
    const { features, entry } = await dataset(id);
    const found = features.find(feature => {
      const p = feature.properties ?? {};
      const iso = String(p.ISO_A2_EH ?? p.ISO_A2 ?? "");
      const localized = /^[A-Z]{2}$/.test(iso) ? new Intl.DisplayNames(["fr"], { type: "region" }).of(iso) : "";
      const departmentCode = id.includes("departments") && /\bdepartement\b/.test(text)
        && new RegExp(`\\bdepartement (?:de |du )?${normalizePlaceName(String(p.code ?? "__unknown"))}\\b`).test(text);
      return departmentCode || [p.nom, p.NAME_FR, p.ADMIN, p.NAME_EN, p.NAME, localized].some(matches);
    });
    if (found && ["Polygon", "MultiPolygon"].includes(found.geometry?.type)) {
      const geometry: LandGeometry = metropolitan && found.geometry.type === "MultiPolygon"
        ? { type: "MultiPolygon", coordinates: found.geometry.coordinates.filter(polygon => polygon[0].every(point => point[0] >= -6 && point[0] <= 10 && point[1] >= 41 && point[1] <= 52)) }
        : found.geometry;
      return { geometry, label: metropolitan ? "France métropolitaine" : String(found.properties.nom ?? found.properties.NAME_FR ?? found.properties.ADMIN ?? query),
        source: { sourceLabel: entry.sourceLabel, sourceUrl: entry.sourceUrl, sourceLicense: entry.sourceLicense, sourceAttribution: entry.sourceAttribution },
        properties: found.properties, datasetId: id };
    }
  }
  return null;
}
