import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";
import sharp from "sharp";
import { loadSource } from "./security/load-source.mjs";

const mocks = { dompurify: createDOMPurify(new JSDOM("").window) };
const { createDrawnMarkerSvg, createDrawnMarkerDataUrl } = loadSource(
  "editor/custom-marker-rendering.ts",
  mocks,
);
const { normalizeCustomMarkerDefinitions } = loadSource(
  "stores/editor-custom-markers.ts",
);
const { alignMarkerElements, translateMarkerElement } = loadSource(
  "editor/custom-marker-composition.ts",
);
const { sanitizeMarkerSvg } = loadSource(
  "lib/dromap/safe-marker-svg.ts",
  mocks,
);
const {
  createCurvedMarkerPoints,
  trimMarkerLineForArrowheads,
  updateMarkerPathHandle,
} = loadSource("editor/custom-marker-line-geometry.ts");
const {
  getFeatureMarkerSize,
  getFeatureMarkerSizeLimits,
} = loadSource("editor/feature-style.ts");
const shape = (id, x = 70, y = 80) => ({
  id,
  type: "shape",
  shape: "circle",
  x,
  y,
  width: 180,
  height: 180,
  rotation: 0,
  fillEnabled: true,
  fillColor: "#ef4444",
  fillOpacity: 1,
  strokeColor: "#194858",
  strokeWidth: 2,
  strokeScales: true,
});
const text = {
  id: "text",
  type: "text",
  x: 90,
  y: 130,
  width: 180,
  height: 70,
  rotation: 0,
  text: "A1",
  fontSize: 42,
  fontWeight: 700,
  textAlign: "center",
  color: "#194858",
  opacity: 1,
};
const marker = (elements) => ({
  id: "saved-id",
  name: "Recette",
  kind: "drawn",
  elements,
  dataUrl: createDrawnMarkerDataUrl(elements),
  createdAt: "2026-09-20",
  updatedAt: "2026-09-20",
});

test("drawn and imported custom markers use the extended size range", () => {
  const feature = (type, markerSize) => ({
    properties: {
      symbol: { type, id: "marker-id" },
      style: { markerSize },
    },
  });

  assert.deepEqual(getFeatureMarkerSizeLimits(feature("drawn", 18)), {
    min: 2,
    max: 300,
  });
  assert.equal(getFeatureMarkerSize(feature("drawn", 0.5)), 2);
  assert.equal(getFeatureMarkerSize(feature("drawn", 260)), 260);
  assert.equal(getFeatureMarkerSize(feature("custom-image", 999)), 300);
  assert.equal(getFeatureMarkerSize(feature("custom-svg", 300)), 300);

  assert.deepEqual(getFeatureMarkerSizeLimits(feature("builtin", 18)), {
    min: 8,
    max: 120,
  });
  assert.equal(getFeatureMarkerSize(feature("builtin", 2)), 8);
  assert.equal(getFeatureMarkerSize(feature("builtin", 300)), 120);
});

test("legacy IDs, SVG and imported images survive normalization unchanged", () => {
  const legacy = marker([
    { ...shape("old"), strokeScales: undefined, cornerRadius: undefined },
  ]);
  const imported = {
    id: "image-id",
    name: "Import",
    kind: "image",
    dataUrl: "data:image/png;base64,AAAA",
  };
  const [saved, image] = normalizeCustomMarkerDefinitions([legacy, imported]);
  assert.equal(saved.id, legacy.id);
  assert.equal(saved.dataUrl, legacy.dataUrl);
  assert.equal(saved.elements[0].id, "old");
  assert.equal(saved.elements[0].cornerRadius, undefined);
  assert.equal(image.dataUrl, imported.dataUrl);
  assert.equal(image.kind, "image");
});

test("group, catalog ID, rounded corners and text properties persist", () => {
  const elements = [
    {
      ...shape("symbol"),
      symbolId: "cross",
      groupId: "group-1",
      cornerRadius: 12,
    },
    { ...text, groupId: "group-1", fontWeight: 400, textAlign: "left" },
  ];
  const saved = normalizeCustomMarkerDefinitions(
    JSON.parse(JSON.stringify([marker(elements)])),
  )[0];
  assert.equal(saved.elements[0].symbolId, "cross");
  assert.equal(saved.elements[0].groupId, "group-1");
  assert.equal(saved.elements[0].cornerRadius, 12);
  assert.equal(saved.elements[0].strokeScales, true);
  assert.equal(saved.elements[1].fontWeight, 400);
  assert.equal(saved.elements[1].textAlign, "left");
});

test("translation preserves geometry beyond the work frame and after reopening", () => {
  const path = {
    id: "path",
    type: "path",
    closed: false,
    points: [
      { x: 0, y: 0 },
      { x: 350, y: 350 },
    ],
    rawPoints: [
      { x: 0, y: 0 },
      { x: 350, y: 350 },
    ],
    strokeColor: "#194858",
    strokeWidth: 4,
  };
  const moved = translateMarkerElement(path, -20, 40);
  const saved = normalizeCustomMarkerDefinitions([marker([moved])])[0]
    .elements[0];
  assert.deepEqual(saved.points, [
    { x: -20, y: 40 },
    { x: 330, y: 390 },
  ]);
  assert.deepEqual(saved.rawPoints, saved.points);
});

test("alignment centers a circle and symbol; a group stays intact", () => {
  const elements = [
    shape("a", 10, 20),
    { ...shape("b", 240, 230), width: 60, height: 60 },
  ];
  const aligned = alignMarkerElements(
    alignMarkerElements(elements, ["a", "b"], "centerX"),
    ["a", "b"],
    "centerY",
  );
  assert.equal(aligned[0].x + 90, aligned[1].x + 30);
  assert.equal(aligned[0].y + 90, aligned[1].y + 30);
  const group = elements.map((e) => ({ ...e, groupId: "g" }));
  const moved = alignMarkerElements(group, ["a", "b"], "centerX");
  assert.equal(moved[1].x - moved[0].x, group[1].x - group[0].x);
  assert.equal((moved[0].x + moved[1].x + 60) / 2, 180);
});

test("new SVG remains vector, transparent, ordered and uses a single viewport", () => {
  const svg = createDrawnMarkerSvg([
    shape("circle"),
    text,
    { ...shape("symbol"), symbolId: "cross", fillColor: "#ffffff" },
  ]);
  assert.equal((svg.match(/<svg\b/g) ?? []).length, 1);
  assert.match(svg, /<path /);
  assert.ok(svg.indexOf("<ellipse") < svg.indexOf("<text"));
  assert.ok(svg.indexOf("<text") < svg.indexOf("<path"));
  assert.doesNotMatch(svg, /<image|<canvas|foreignObject|non-scaling-stroke/);
  assert.match(svg, /translate\(70 80\) scale\(7.5 7.5\)/);
});

test("existing contour scaling is retained while new contours scale with the marker", () => {
  assert.match(
    createDrawnMarkerSvg([{ ...shape("old"), strokeScales: undefined }]),
    /non-scaling-stroke/,
  );
  assert.doesNotMatch(
    createDrawnMarkerSvg([shape("new")]),
    /non-scaling-stroke/,
  );
});

test("curved marker lines keep editable handles and a smooth vector trace", () => {
  const handles = [
    { x: 40, y: 180 },
    { x: 180, y: 80 },
    { x: 320, y: 180 },
  ];
  const points = createCurvedMarkerPoints(handles);
  assert.deepEqual(points[0], handles[0]);
  assert.deepEqual(points.at(-1), handles.at(-1));
  assert.deepEqual(points[24], handles[1]);
  const element = {
    id: "curve",
    type: "path",
    lineVariant: "curved",
    points,
    rawPoints: handles,
    closed: false,
    strokeColor: "#194858",
    strokeWidth: 6,
  };
  const changed = updateMarkerPathHandle(element, 1, { x: 180, y: 260 });
  assert.deepEqual(changed.rawPoints[1], { x: 180, y: 260 });
  assert.deepEqual(changed.points[24], { x: 180, y: 260 });
  const saved = normalizeCustomMarkerDefinitions([marker([changed])])[0]
    .elements[0];
  assert.equal(saved.lineVariant, "curved");
  assert.deepEqual(saved.rawPoints, changed.rawPoints);
});

test("arrow shafts stop behind their heads at every stroke width", () => {
  for (const strokeWidth of [1, 4, 12, 40]) {
    const shaft = trimMarkerLineForArrowheads(
      [
        { x: 10, y: 20 },
        { x: 340, y: 20 },
      ],
      strokeWidth,
      false,
      true,
    );
    assert.ok(shaft.at(-1).x < 340 - Math.max(12, strokeWidth * 3.2));
    const svg = createDrawnMarkerSvg([
      {
        id: `arrow-${strokeWidth}`,
        type: "arrow",
        x1: 10,
        y1: 20,
        x2: 340,
        y2: 20,
        strokeColor: "#194858",
        strokeWidth,
      },
    ]);
    const [, x2] = svg.match(/<line [^>]*x2="([^"]+)"/);
    assert.ok(Number(x2) < 340 - Math.max(12, strokeWidth * 3.2));
  }
});

test("multiline text keeps only explicit line breaks, is escaped and not clipped", () => {
  const svg = createDrawnMarkerSvg([
    { ...text, text: "Long label <A&B>\nSecond line", textAlign: "left" },
  ]);
  assert.equal((svg.match(/<text /g) ?? []).length, 2);
  assert.match(svg, /Long label &lt;A&amp;B&gt;/);
  assert.match(svg, /text-anchor="start"/);
  const [, , width] = svg
    .match(/viewBox="([^"]+)"/)[1]
    .split(" ")
    .map(Number);
  assert.ok(width > 300);
});

test("safe inline SVG retains text, geometry and colors without relaxing sanitization", () => {
  const svg = createDrawnMarkerSvg(
    [shape("circle"), text, { ...shape("symbol"), symbolId: "cross" }],
    '@font-face{font-family:Geist;src:url("data:font/woff2;base64,AAAA")}',
  );
  const safe = sanitizeMarkerSvg(svg);
  assert.match(safe, />A1<\/text>/);
  assert.match(safe, /<path /);
  assert.doesNotMatch(safe, /<style|href=/);
});

test("SVG rasterization preserves transparent edges and visible text at export size", async () => {
  const svg = createDrawnMarkerSvg([shape("circle"), text]);
  const { data, info } = await sharp(Buffer.from(svg))
    .resize(120, 120)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  assert.equal(data[3], 0);
  let darkInterior = 0;
  for (let y = 40; y < 80; y++)
    for (let x = 35; x < 85; x++) {
      const i = (y * 120 + x) * 4;
      if (
        data[i] < 70 &&
        data[i + 1] < 110 &&
        data[i + 2] < 130 &&
        data[i + 3] > 150
      )
        darkInterior++;
    }
  assert.ok(darkInterior > 20, `Text pixels missing: ${darkInterior}`);
});

test("text enlarged with a group keeps its size when reopened", () => {
  const enlarged = { ...text, fontSize: 168, width: 720, height: 280, x: -90, y: -40 };
  const saved = normalizeCustomMarkerDefinitions([marker([enlarged])])[0].elements[0];
  assert.equal(saved.fontSize, 168);
  assert.equal(saved.width, 720);
  assert.equal(saved.x, -90);
});
