import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSource } from "./security/load-source.mjs";

const { createCurvedLineCoordinates, getCurvedLineHandles, getCurvedLegendPoints, getCurvedLegendPath } = loadSource("lib/dromap/curved-line.ts");
const { isFreehandLineFeature } = loadSource("lib/dromap/feature.ts");
const mercator = ([x, y]) => [x * Math.PI / 180, Math.log(Math.tan(Math.PI / 4 + y * Math.PI / 360))];
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);

test("curve preserves endpoints and the bend handle exactly, including persistence", () => {
  const points = createCurvedLineCoordinates([2, 48], [4, 49], [3, 50]);
  assert.equal(points.length, 129);
  assert.deepEqual(getCurvedLineHandles(JSON.parse(JSON.stringify(points))), [[2, 48], [3, 50], [4, 49]]);
  assert.deepEqual(createCurvedLineCoordinates(points[0], points[128], points[64]), points);
});

test("curve is smooth in map/export projection, at all display scales", () => {
  for (const bend of [[3, 50], [3, 47], [2.2, 48.8]]) {
    const points = createCurvedLineCoordinates([2, 48], [4, 49], bend).map(mercator);
    // A quadratic has constant second differences: no angular vertices.
    for (const scale of [0.25, 1, 4, 12]) {
      for (let axis = 0; axis < 2; axis++) {
        const second = points[2][axis] - 2 * points[1][axis] + points[0][axis];
        for (let i = 2; i < points.length; i++) close(scale * (points[i][axis] - 2 * points[i - 1][axis] + points[i - 2][axis]), scale * second);
      }
    }
  }
});

test("two clicks create a straight curve ready to bend; degenerate points stay finite", () => {
  const points = createCurvedLineCoordinates([2, 48], [4, 49]).map(mercator);
  points.forEach((p, i) => p.forEach((v, axis) => close(v, points[0][axis] + (points[128][axis] - points[0][axis]) * i / 128)));
  assert.ok(createCurvedLineCoordinates([0, 90], [0, 90]).flat().every(Number.isFinite));
});

test("curves are not mistaken for freehand lines, legend uses one shared path", () => {
  assert.equal(isFreehandLineFeature({ geometry: { type: "LineString", coordinates: createCurvedLineCoordinates([2, 48], [4, 49]) }, properties: { type: "line", lineVariant: "curved" } }), false);
  const points = getCurvedLegendPoints(0, 40, 10);
  assert.deepEqual(points[0], [0, 10]);
  assert.deepEqual(points[32], [40, 10]);
  assert.ok(points[16][1] < 10);
  assert.equal(getCurvedLegendPath(0, 40, 10), points.map(([x, y], i) => `${i ? "L" : "M"} ${x} ${y}`).join(" "));
});
