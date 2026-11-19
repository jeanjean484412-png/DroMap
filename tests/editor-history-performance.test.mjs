import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "zustand";
import { loadSource } from "./security/load-source.mjs";

test("une extraction GeoJSON conserve l'identité des entités restantes après rechargement", () => {
  const { parseGeoJsonTextToDromapGeoJsonLayer, useEditorGeoJsonLayersStore } =
    loadSource("stores/editor-geojson-layers.ts");
  const point = (longitude) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [longitude, 45] },
    properties: {},
  });
  const layer = parseGeoJsonTextToDromapGeoJsonLayer(JSON.stringify({
    type: "FeatureCollection",
    features: [point(0), point(10)],
  }));
  const store = useEditorGeoJsonLayersStore;
  store.getState().addGeoJsonLayer(layer);
  const remainingId = store.getState().geoJsonLayers[0].data.features[1].id;

  store.getState().removeGeoJsonFeature(layer.id, 0);
  const remainingLayer = store.getState().geoJsonLayers[0];
  assert.equal(remainingLayer.featureCount, 1);
  assert.equal(remainingLayer.coordinateCount, 1);
  assert.ok(remainingLayer.bounds.southWest.lng > 0);
  store.getState().setGeoJsonLayers(JSON.parse(JSON.stringify([remainingLayer])));
  assert.equal(store.getState().geoJsonLayers[0].data.features[0].id, remainingId);
});

test("l’historique restaure la géométrie et les calques sans recopier les versions inchangées", () => {
  const stores = [];
  loadSource("lib/dromap/editor-project-persistence.ts", {
    zustand: { create: (initializer) => {
      const store = create(initializer);
      stores.push(store);
      return store;
    } },
  });
  const store = stores.find((item) => item.getState().commitFeaturesHistory);
  const geoJsonStore = stores.find((item) => item.getState().setGeoJsonLayers);
  assert.ok(store && geoJsonStore);
  const line = (id, coordinates) => ({
    type: "Feature", id,
    geometry: { type: "LineString", coordinates },
    properties: { type: "line", style: { color: "#ff0000" } },
  });
  const original = line("original", [[0, 0], [1, 1]]);
  store.getState().replaceFeatures([original, line("unchanged", [[0, 0], [5, 5]])]);
  const [first, unchanged] = store.getState().features;
  original.geometry.coordinates[0][0] = 42;
  assert.equal(first.geometry.coordinates[0][0], 0, "les données importées restent isolées");

  store.getState().updateFeatureWithHistory(first.id, (feature) => ({
    ...feature, geometry: { type: "LineString", coordinates: [[2, 2], [3, 3]] },
  }));
  store.getState().updateFeatureWithHistory(first.id, (feature) => ({
    ...feature, properties: { ...feature.properties, style: { color: "#0000ff" } },
  }));
  const updated = store.getState().features[0];
  assert.equal(store.getState().past[0].features[1], unchanged);
  store.getState().undo();
  const firstRedo = store.getState().future[0];
  assert.deepEqual(store.getState().features[0].geometry.coordinates, [[2, 2], [3, 3]]);
  assert.equal(store.getState().features[0].properties.style.color, "#ff0000");
  store.getState().undo();
  assert.equal(store.getState().future[1], firstRedo);
  assert.deepEqual(store.getState().features[0].geometry.coordinates, [[0, 0], [1, 1]]);
  store.getState().redo();
  store.getState().redo();
  assert.deepEqual(store.getState().features[0], updated);
  assert.equal(store.getState().features[1], unchanged);

  const layer = loadSource("stores/editor-geojson-layers.ts").parseGeoJsonTextToDromapGeoJsonLayer(
    JSON.stringify({ type: "FeatureCollection", features: [line("import", [[0, 0], [1, 1]])] }),
  );
  geoJsonStore.getState().addGeoJsonLayer(layer);
  const before = geoJsonStore.getState().geoJsonLayers;
  store.getState().commitFeaturesHistory({ includeParticipants: true });
  geoJsonStore.getState().toggleGeoJsonLayerVisibility(layer.id);
  store.getState().undo();
  assert.equal(geoJsonStore.getState().geoJsonLayers, before);
  store.getState().redo();
  assert.equal(geoJsonStore.getState().geoJsonLayers[0].visible, false);
  assert.equal(geoJsonStore.getState().geoJsonLayers[0].data, before[0].data);
});
