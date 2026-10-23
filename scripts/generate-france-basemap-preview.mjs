import { readFile, writeFile } from "node:fs/promises";

const sourceUrl =
  "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/regions-version-simplifiee.geojson";
const sourcePath = process.argv[2];
const outputPath = new URL("../public/basemap-france-regions-preview.svg", import.meta.url);
const geojson = sourcePath
  ? JSON.parse(await readFile(sourcePath, "utf8"))
  : await fetch(sourceUrl).then((response) => {
      if (!response.ok) throw new Error(`GeoJSON: HTTP ${response.status}`);
      return response.json();
    });

const width = 160;
const height = 104;
const longitudeScale = Math.cos((46.3 * Math.PI) / 180);
const features = geojson.features;
const allPoints = features.flatMap((feature) => {
  const polygons =
    feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
  return polygons.flatMap((polygon) => polygon.flat());
});
const xs = allPoints.map(([longitude]) => longitude * longitudeScale);
const ys = allPoints.map(([, latitude]) => -latitude);
const minX = Math.min(...xs);
const maxX = Math.max(...xs);
const minY = Math.min(...ys);
const maxY = Math.max(...ys);
const scale = Math.min((width - 18) / (maxX - minX), (height - 10) / (maxY - minY));
const offsetX = (width - (maxX - minX) * scale) / 2;
const offsetY = (height - (maxY - minY) * scale) / 2;

function project([longitude, latitude]) {
  return [
    offsetX + (longitude * longitudeScale - minX) * scale,
    offsetY + (-latitude - minY) * scale,
  ];
}

function distanceToSegment(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared
    ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared))
    : 0;
  return Math.hypot(point[0] - start[0] - t * dx, point[1] - start[1] - t * dy);
}

function simplify(points, tolerance = 0.18) {
  if (points.length < 4) return points;
  let farthestDistance = 0;
  let farthestIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = distanceToSegment(points[index], points[0], points.at(-1));
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthestIndex = index;
    }
  }
  if (farthestDistance <= tolerance) return [points[0], points.at(-1)];
  return [
    ...simplify(points.slice(0, farthestIndex + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(farthestIndex), tolerance),
  ];
}

function ringPath(ring) {
  const projected = ring.map(project);
  const simplified = simplify(projected);
  if (simplified.length < 3) return "";
  return `${simplified
    .map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ")} Z`;
}

const regionPaths = features.map((feature) => {
  const polygons =
    feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
  return polygons.flatMap((polygon) => polygon.map(ringPath)).filter(Boolean).join(" ");
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title">
  <title id="title">France métropolitaine et ses treize régions</title>
  <!-- Source des frontières : ${sourceUrl} -->
  <rect width="${width}" height="${height}" fill="#f8fafc"/>
  <g fill="#ffffff" fill-rule="evenodd" stroke="#475569" stroke-width="0.72" stroke-linejoin="round">
${regionPaths.map((path) => `    <path d="${path}"/>`).join("\n")}
  </g>
</svg>
`;

await writeFile(outputPath, svg);
console.log(`Aperçu créé : ${outputPath.pathname} (${Buffer.byteLength(svg)} octets)`);
