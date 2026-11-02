import type { DroMapFeature } from "@/lib/dromap/feature";
import type { DromapGeoJsonLayer } from "@/stores/editor-geojson-layers";

function validPositions(value: unknown): boolean {
  if (!Array.isArray(value) || !value.length) return false;
  if (typeof value[0] === "number") return value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]) && Math.abs(value[1]) <= 90;
  return value.every(validPositions);
}
function closedRing(ring: unknown): boolean {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  const first = ring[0], last = ring[ring.length - 1];
  return Array.isArray(first) && Array.isArray(last) && first[0] === last[0] && first[1] === last[1];
}
export function validateExportGeometry(input: { features: DroMapFeature[]; geoJsonLayers?: DromapGeoJsonLayer[] }) {
  const all = [...input.features, ...(input.geoJsonLayers ?? []).filter(layer => layer.visible).flatMap(layer => layer.data.features)];
  for (const feature of all) {
    const geometry = feature.geometry;
    if (!geometry || !("coordinates" in geometry) || !validPositions(geometry.coordinates)) throw new Error("Export interrompu : un objet contient une géométrie vide ou des coordonnées invalides.");
    const rings = geometry.type === "Polygon" ? geometry.coordinates : geometry.type === "MultiPolygon" ? geometry.coordinates.flat() : [];
    if (!rings.every(closedRing)) throw new Error("Export interrompu : une surface possède un contour ouvert ou incomplet.");
    if (geometry.type === "LineString" && geometry.coordinates.length < 2) throw new Error("Export interrompu : un trait possède moins de deux points.");
    if (geometry.type === "MultiLineString" && geometry.coordinates.some(line => line.length < 2)) throw new Error("Export interrompu : un trait possède moins de deux points.");
  }
  for (const feature of input.features) {
    const source = feature.properties.source;
    if (feature.properties.type === "zone" && source?.sourceLabel === "OpenStreetMap / Nominatim" && source.originalProperties?.dromapBoundaryKind !== "land") {
      throw new Error("Ce remplissage utilise une ancienne frontière administrative susceptible d’inclure la mer. Recrée le remplissage avec le contour terrestre avant l’export.");
    }
    if (source?.originalProperties?.dromapAiCurvedFlow === true && feature.properties.lineVariant === "curved" && feature.geometry.type === "LineString") {
      const points = feature.geometry.coordinates;
      const a = points[0], b = points[points.length - 1];
      if (!points.some(p => Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 1e-10)) {
        throw new Error("Export interrompu : une flèche annoncée comme courbe est restée droite. Modifie sa courbure.");
      }
    }
  }
}
