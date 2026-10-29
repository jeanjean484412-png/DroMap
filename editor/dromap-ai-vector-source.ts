import type { DromapGeoJsonGeometry } from "@/stores/editor-geojson-layers";

type VectorGeometry = Extract<DromapGeoJsonGeometry, { type: "Polygon" | "MultiPolygon" | "LineString" | "MultiLineString" }>;
type Position = [number, number];
const pending = new Map<string, Promise<VectorGeometry | null>>();

function validCoordinates(value: unknown, depth: number): boolean {
  if (!Array.isArray(value)) return false;
  if (depth === 0) return value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]) &&
    Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
  return value.length > 0 && value.every((item) => validCoordinates(item, depth - 1));
}

export function readAiVectorGeometry(value: unknown): VectorGeometry | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { type?: string; coordinates?: unknown };
  const depth = candidate.type === "LineString" ? 1 :
    candidate.type === "Polygon" || candidate.type === "MultiLineString" ? 2 :
      candidate.type === "MultiPolygon" ? 3 : -1;
  return depth >= 0 && validCoordinates(candidate.coordinates, depth) ? candidate as VectorGeometry : null;
}

export async function loadAiPlaceVectorGeometry(place: string, kind: "area" | "line") {
  const key = `${kind}:${place.trim().toLocaleLowerCase("fr")}`;
  const cached = pending.get(key);
  if (cached) return cached;
  const request = (async () => {
    const response = await fetch(`/api/dromap/place-search?geometry=1&q=${encodeURIComponent(place)}`, {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error("La frontière géographique n'a pas pu être récupérée.");
    const payload = await response.json() as { results?: Array<{ geometry?: unknown }> };
    for (const result of payload.results ?? []) {
      const geometry = readAiVectorGeometry(result.geometry);
      if (geometry && (kind === "line" || geometry.type === "Polygon" || geometry.type === "MultiPolygon")) return geometry;
    }
    return null;
  })();
  pending.set(key, request);
  try { return await request; }
  catch (error) { pending.delete(key); throw error; }
}

export function getAiVectorPolygons(geometry: VectorGeometry): Position[][][] {
  return geometry.type === "Polygon" ? [geometry.coordinates] :
    geometry.type === "MultiPolygon" ? geometry.coordinates : [];
}

export function getAiVectorLines(geometry: VectorGeometry): Position[][] {
  return geometry.type === "LineString" ? [geometry.coordinates] :
    geometry.type === "MultiLineString" ? geometry.coordinates : getAiVectorPolygons(geometry).flat();
}
