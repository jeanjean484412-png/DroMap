import "server-only";
import { queryOverpass } from "./overpass";

type Point = [number, number];
type OsmGeometry = Array<{ lon: number; lat: number }>;
type Element = { id: number; type: string; tags?: Record<string, string>; geometry?: OsmGeometry; members?: Array<{ ref?: number; type?: string; role: string; geometry?: OsmGeometry }> };
const equal = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
export function assembleRings(parts: Point[][]) {
  const remaining = parts.filter(part => part.length > 1).map(part => [...part]);
  const rings: Point[][] = [];
  while (remaining.length) {
    const ring = remaining.shift()!;
    while (!equal(ring[0], ring[ring.length - 1])) {
      const index = remaining.findIndex(part => equal(part[0], ring[ring.length - 1]) || equal(part[part.length - 1], ring[ring.length - 1]));
      if (index < 0) throw new Error("Une emprise de bâtiment OpenStreetMap est incomplète.");
      const part = remaining.splice(index, 1)[0];
      if (!equal(part[0], ring[ring.length - 1])) part.reverse();
      ring.push(...part.slice(1));
    }
    if (ring.length < 4) throw new Error("Une emprise de bâtiment OpenStreetMap est invalide.");
    rings.push(ring);
  }
  return rings;
}
function inside(point: Point, ring: Point[]) {
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes;
  }
  return yes;
}
export async function fetchOsmBuildings(bounds: { south: number; west: number; north: number; east: number }, maxFeatures: number) {
  const area = (bounds.north - bounds.south) * (bounds.east - bounds.west) * 12365 * Math.cos((bounds.north + bounds.south) * Math.PI / 360);
  if (area > 250) throw Object.assign(new Error("La recherche de bâtiments OpenStreetMap est limitée à 250 km². Réduis la zone de travail."), { status: 413, code: "BUILDING_AREA_TOO_LARGE" });
  const bbox = [bounds.south, bounds.west, bounds.north, bounds.east].join(",");
  const response = await queryOverpass(`[out:json][timeout:20];(way[building](${bbox});relation[building][type=multipolygon](${bbox}););out body geom;`);
  const elements = response.elements as unknown as Element[];
  const memberWays = new Set(elements.filter(element => element.type === "relation").flatMap(element => (element.members ?? []).filter(member => member.type === "way").map(member => member.ref)));
  const buildings = elements.filter(element => element.type !== "way" || !memberWays.has(element.id));
  if (buildings.length > maxFeatures) throw Object.assign(new Error(`Plus de ${maxFeatures} bâtiments ont été trouvés. Réduis la zone.`), { status: 413, code: "TOO_MANY_BUILDINGS" });
  const features = buildings.map(element => {
    const points = (geometry: OsmGeometry = []): Point[] => geometry.map(p => [p.lon, p.lat]);
    const outers = assembleRings(element.type === "way" ? [points(element.geometry)] : (element.members ?? []).filter(m => m.role === "outer" || m.role === "").map(m => points(m.geometry)));
    const holes = assembleRings((element.members ?? []).filter(m => m.role === "inner").map(m => points(m.geometry)));
    if (!outers.length) throw new Error("Un bâtiment ne possède pas de contour exploitable.");
    const polygons = outers.map(outer => [outer, ...holes.filter(hole => inside(hole[0], outer))]);
    return { type: "Feature", id: `osm-${element.type}-${element.id}`, properties: { ...element.tags, source: "OpenStreetMap", osm_id: element.id, osm_type: element.type },
      geometry: polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0] } : { type: "MultiPolygon", coordinates: polygons } };
  });
  return { type: "FeatureCollection", features, metadata: { provider: "osm", sourceName: "osm-buildings.geojson", sourceLabel: "OpenStreetMap — Bâtiments", sourceUrl: "https://www.openstreetmap.org/copyright", license: "ODbL", attribution: "© OpenStreetMap contributors" } };
}
