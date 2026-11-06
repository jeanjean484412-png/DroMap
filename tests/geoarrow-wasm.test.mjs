import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { test } from "node:test";
import * as geoArrow from "@geoarrow/geoarrow-wasm/esm/index.js";

test("GeoArrow navigateur : initialisation WASM, lecture GeoParquet par plages et filtrage spatial", async () => {
  // Deux bâtiments synthétiques à (2, 48) et (10, 50), sans données utilisateur.
  const parquet = await readFile(new URL("./fixtures/overture-buildings.parquet", import.meta.url));
  const wasm = await readFile(new URL("../node_modules/@geoarrow/geoarrow-wasm/esm/index_bg.wasm", import.meta.url));
  await geoArrow.default({ module_or_path: wasm });
  geoArrow.set_panic_hook();

  let rangeRequests = 0;
  const server = createServer((request, response) => {
    const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), parquet.length - 1) : parquet.length - 1;
    if (range) rangeRequests++;
    response.writeHead(range ? 206 : 200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": end - start + 1,
      "Accept-Ranges": "bytes",
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${parquet.length}` } : {}),
    });
    response.end(parquet.subarray(start, end + 1));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));

  let dataset;
  try {
    dataset = await new geoArrow.ParquetDataset(`http://127.0.0.1:${server.address().port}/`, ["buildings.parquet"]);
    const bboxPaths = { xmin: ["bbox", "xmin"], ymin: ["bbox", "ymin"], xmax: ["bbox", "xmax"], ymax: ["bbox", "ymax"] };
    const reader = await dataset.read({ bbox: [1.999, 47.999, 2.002, 48.002], bboxPaths, limit: 2 });
    const result = JSON.parse(new TextDecoder().decode(geoArrow.writeGeoJSON(reader)));
    assert.equal(result.type, "FeatureCollection");
    assert.equal(result.features.length, 1, "le bâtiment hors zone doit être exclu");
    const building = result.features[0];
    assert.equal(building.properties.id, "fixture-building-1");
    assert.equal(building.properties.height, 12);
    assert.equal(building.geometry.type, "Polygon");
    assert.deepEqual(building.geometry.coordinates[0][0], [2, 48]);
    assert.ok(rangeRequests > 0, "le lecteur doit utiliser les plages HTTP comme pour Overture");
  } finally {
    dataset?.free();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
