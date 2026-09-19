import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSource } from "./security/load-source.mjs";

const { createCurvedLineCoordinates, createMultiCurvedLine, getCurveHandleIndices, readCurveHandleIndices, getCurvedLineHandles, getCurvedLegendPoints, getCurvedLegendPath } = loadSource("lib/dromap/curved-line.ts");
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

test("multiple bends interpolate every handle and survive serialization and translation", () => {
  const handles = [[2, 48], [2.4, 49], [2.8, 47.5], [3.2, 49], [4, 48]];
  const curve = createMultiCurvedLine(handles);
  assert.deepEqual(curve.indices, [0, 64, 128, 192, 256]);
  const saved = JSON.parse(JSON.stringify(curve));
  assert.deepEqual(getCurvedLineHandles(saved.coordinates, saved.indices), handles);
  const moved = saved.coordinates.map(([x,y]) => [x + 1, y + 1]);
  assert.deepEqual(getCurvedLineHandles(moved, saved.indices), handles.map(([x,y]) => [x + 1,y + 1]));
  assert.ok(curve.coordinates.flat().every(Number.isFinite));
  // The two one-sided tangents at each join converge: no angular break.
  const p = curve.coordinates.map(mercator);
  for (const i of curve.indices.slice(1,-1)) {
    const left = [0,1].map(axis => 3*p[i][axis]-4*p[i-1][axis]+p[i-2][axis]);
    const right = [0,1].map(axis => -3*p[i][axis]+4*p[i+1][axis]-p[i+2][axis]);
    const cosine = (left[0]*right[0]+left[1]*right[1]) / Math.hypot(...left) / Math.hypot(...right);
    assert.ok(cosine > .98);
  }
});

test("inserting a handle preserves the sampled trace; invalid imported indices are ignored", () => {
  const coordinates = createCurvedLineCoordinates([2,48],[4,48],[3,49]);
  const before = JSON.stringify(coordinates);
  const indices = getCurveHandleIndices(coordinates);
  indices.splice(1,0,32);
  assert.equal(getCurvedLineHandles(coordinates, indices).length, 4);
  assert.equal(JSON.stringify(coordinates), before);
  assert.deepEqual(getCurveHandleIndices(coordinates,[0,200,400]), [0,64,128]);
  assert.equal(readCurveHandleIndices([0,10,10]), undefined);
  assert.equal(readCurveHandleIndices([0,"64",128]), undefined);
  assert.throws(() => createMultiCurvedLine(Array.from({length:65},()=>[0,0])));
});
