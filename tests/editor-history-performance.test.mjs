import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "zustand";
import { loadSource } from "./security/load-source.mjs";

test("un aperçu de réglages DroMap respecte la géométrie et les autres changements enregistrés", () => {
  const { stageFeatureSettings, getFeaturesWithSettingsPreview, useEditorFeatureSettingsPreview } = loadSource("stores/editor-feature-settings-preview.ts");
  const original = {
    type: "Feature", id: "trait",
    geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
    properties: { type: "line", label: "Trait", style: { weight: 2, opacity: 1 } },
  };
  stageFeatureSettings([original], [original.id], (feature) => ({
    ...feature,
    properties: { ...feature.properties, style: { ...feature.properties.style, weight: 7 } },
  }));
  const current = {
    ...original,
    geometry: { type: "LineString", coordinates: [[2, 2], [3, 3]] },
    properties: { ...original.properties, label: "Trait déplacé", style: { ...original.properties.style, opacity: 0.5 } },
  };
  const [preview] = getFeaturesWithSettingsPreview([current], useEditorFeatureSettingsPreview.getState().features);
  assert.equal(preview.geometry, current.geometry);
  assert.equal(preview.properties.label, "Trait déplacé");
  assert.deepEqual(preview.properties.style, { weight: 7, opacity: 0.5 });
  assert.equal(original.properties.style.weight, 2);
  assert.equal(current.properties.style.weight, 2);
});

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

test("les paramètres d’un élément GeoJSON sont isolés, persistants et conservés à sa conversion", () => {
  const { parseGeoJsonTextToDromapGeoJsonLayer, useEditorGeoJsonLayersStore } = loadSource("stores/editor-geojson-layers.ts");
  const { getEffectiveGeoJsonFeatureStyle } = loadSource("editor/geojson-layer-style.ts");
  const { convertGeoJsonFeatureAtIndex } = loadSource("editor/geojson-layer-conversion.ts");
  const line = (name, west) => ({
    type: "Feature",
    properties: { name, source: "import" },
    geometry: { type: "LineString", coordinates: [[west, 45], [west + 1, 46]] },
  });
  const layer = parseGeoJsonTextToDromapGeoJsonLayer(JSON.stringify({
    type: "FeatureCollection",
    features: [line("A", 0), line("B", 10)],
  }));
  const store = useEditorGeoJsonLayersStore;
  store.getState().addGeoJsonLayer(layer);
  const [first, second] = store.getState().geoJsonLayers[0].data.features;

  store.getState().updateGeoJsonFeatureSettings(layer.id, first.id, {
    name: "Ligne modifiée",
    style: { strokeColor: "#123456", dashStyle: "dotted", strokeWeight: 5 },
  });
  const [updated] = store.getState().geoJsonLayers;
  assert.equal(updated.id, layer.id);
  assert.equal(updated.featureCount, 2);
  assert.equal(updated.locked, layer.locked);
  assert.equal(updated.data.features[0].geometry, first.geometry);
  assert.equal(updated.data.features[1], second);
  assert.equal(updated.data.features[0].properties.source, "import");
  assert.deepEqual(updated.style, layer.style);

  store.getState().setGeoJsonLayers(JSON.parse(JSON.stringify([updated])));
  const [restored] = store.getState().geoJsonLayers;
  assert.equal(restored.data.features[0].id, first.id);
  assert.equal(getEffectiveGeoJsonFeatureStyle(restored, restored.data.features[0]).strokeColor, "#123456");
  const [object] = convertGeoJsonFeatureAtIndex(restored, "dessin", 0);
  assert.equal(object.properties.label, "Ligne modifiée");
  assert.equal(object.properties.style.weight, 5);
  assert.equal(object.properties.style.dashStyle, "dotted");

  store.getState().updateGeoJsonLayerStyle(layer.id, { strokeColor: "#abcdef" });
  const [global] = store.getState().geoJsonLayers;
  assert.equal(getEffectiveGeoJsonFeatureStyle(global, global.data.features[0]).strokeColor, "#abcdef");
  assert.equal(getEffectiveGeoJsonFeatureStyle(global, global.data.features[1]).strokeColor, "#abcdef");
  assert.equal(getEffectiveGeoJsonFeatureStyle(global, global.data.features[0]).strokeWeight, 5);

  const { convertFeaturesToGeoJsonFeatures } = loadSource("editor/dromap-layer-to-geojson-conversion.ts");
  const route = line("Route", 0);
  const compound = parseGeoJsonTextToDromapGeoJsonLayer(JSON.stringify({
    ...route,
    geometry: { type: "MultiLineString", coordinates: [route.geometry.coordinates, line("Suite", 10).geometry.coordinates] },
  }));
  const parts = convertGeoJsonFeatureAtIndex(compound, "dessin", 0);
  const drawingLayer = { id: "dessin", name: compound.name };
  assert.equal(convertFeaturesToGeoJsonFeatures(parts, drawingLayer)[0].geometry.type, "MultiLineString");
  parts[1].properties.style.color = "#987654";
  const returnedParts = convertFeaturesToGeoJsonFeatures(parts, drawingLayer);
  assert.equal(returnedParts.length, 2);
  assert.equal(returnedParts[1].properties.dromap.style.color, "#987654");
});

test("le retour des objets modifiés utilise le calque source et supporte sa restauration", () => {
  const geoJson = loadSource("stores/editor-geojson-layers.ts");
  const {
    convertGeoJsonFeatureAtIndex,
  } = loadSource("editor/geojson-layer-conversion.ts");
  const {
    convertFeaturesToGeoJsonFeatures,
  } = loadSource("editor/dromap-layer-to-geojson-conversion.ts");
  const { getEffectiveGeoJsonFeatureStyle } = loadSource("editor/geojson-layer-style.ts");
  const {
    getActiveDromapLayerId,
    useEditorLayersStore: drawingStore,
  } = loadSource("stores/editor-layers.ts");
  const line = (west) => ({
    type: "Feature",
    geometry: { type: "LineString", coordinates: [[west, 45], [west + 1, 46]] },
    properties: { name: `Ligne ${west}` },
  });
  const source = geoJson.parseGeoJsonTextToDromapGeoJsonLayer(JSON.stringify({
    type: "FeatureCollection",
    features: [line(0), line(10)],
  }), { layerName: "Routes" });
  const geoStore = geoJson.useEditorGeoJsonLayersStore;
  geoStore.getState().addGeoJsonLayer(source);
  const settings = geoJson.getGeoJsonLayerSettings(source);

  const activeLayerId = drawingStore.getState().activeLayerId;
  const id = drawingStore.getState().createLayer(source.name, { activate: false, geoJsonSource: settings });
  assert.equal(getActiveDromapLayerId(), activeLayerId);
  drawingStore.getState().setLayers(JSON.parse(JSON.stringify(drawingStore.getState().layers)), activeLayerId);
  const drawingLayer = drawingStore.getState().layers.find((layer) => layer.id === id);
  assert.equal(drawingLayer.name, source.name);
  assert.deepEqual(drawingLayer.sourceGeoJsonLayerSettings, settings);

  const [editable] = convertGeoJsonFeatureAtIndex(source, id, 0);
  const modified = {
    ...editable,
    geometry: line(-10).geometry,
    properties: {
      ...editable.properties,
      label: "Route modifiée",
      style: { color: "#123456", dashStyle: "solid" },
      mapLabelOffset: { x: 10, y: -15, referenceZoom: 8 },
      mapLabelScale: 1.5,
      belowBasemapLabels: true,
    },
  };
  const converted = convertFeaturesToGeoJsonFeatures([modified], drawingLayer);
  geoStore.getState().removeGeoJsonFeature(source.id, 0);
  geoStore.getState().renameGeoJsonLayer(source.id, "Routes renommées");
  geoStore.getState().updateGeoJsonLayerStyle(source.id, { dashStyle: "dashed" });
  geoStore.getState().restoreGeoJsonLayerFeatures(drawingLayer.sourceGeoJsonLayerSettings, converted);
  geoStore.getState().setGeoJsonLayers(JSON.parse(JSON.stringify(geoStore.getState().geoJsonLayers)));

  const [merged] = geoStore.getState().geoJsonLayers;
  assert.equal(geoStore.getState().geoJsonLayers.length, 1);
  assert.equal(merged.id, source.id);
  assert.equal(merged.name, "Routes renommées");
  assert.equal(merged.featureCount, 2);
  assert.equal(merged.coordinateCount, 4);
  assert.deepEqual(merged.bounds, geoJson.getGeoJsonLayerBoundsFromFeatures([source.data.features[1], converted[0]]));
  assert.deepEqual(merged.data.features[0], source.data.features[1]);
  const returned = merged.data.features[1];
  assert.equal(returned.id, source.data.features[0].id);
  assert.equal(returned.properties.name, "Route modifiée");
  assert.deepEqual(returned.geometry, modified.geometry);
  assert.equal(getEffectiveGeoJsonFeatureStyle(merged, returned).strokeColor, "#123456");
  assert.equal(getEffectiveGeoJsonFeatureStyle(merged, returned).dashStyle, "solid");
  const [reopened] = convertGeoJsonFeatureAtIndex(merged, id, 1);
  assert.deepEqual(reopened.properties.mapLabelOffset, modified.properties.mapLabelOffset);
  assert.equal(reopened.properties.mapLabelScale, modified.properties.mapLabelScale);
  assert.equal(reopened.properties.belowBasemapLabels, true);

  geoStore.getState().removeGeoJsonLayer(source.id);
  geoStore.getState().restoreGeoJsonLayerFeatures(drawingLayer.sourceGeoJsonLayerSettings, converted);
  const [restored] = geoStore.getState().geoJsonLayers;
  assert.deepEqual(geoJson.getGeoJsonLayerSettings(restored), settings);
  assert.equal(restored.featureCount, 1);
  assert.deepEqual(restored.data.features[0], returned);

  drawingStore.getState().setLayers([], "");
  drawingStore.getState().createLayer(source.name, { activate: false, geoJsonSource: settings });
  drawingStore.getState().syncLayersForFeatures([{ ...modified, properties: { ...modified.properties, layerId: undefined } }]);
  assert.equal(drawingStore.getState().layers.length, 1);
  drawingStore.getState().setLayers(drawingStore.getState().layers, "");
  assert.equal(getActiveDromapLayerId(), null, "le dessin direct reste actif après une conversion et un rechargement");
});

test("la légende GeoJSON regroupe les styles visibles et distingue les zones et traits modifiés", () => {
  const { parseGeoJsonTextToDromapGeoJsonLayer, useEditorGeoJsonLayersStore } = loadSource("stores/editor-geojson-layers.ts");
  const { getGeoJsonLayerLegendEntries, getGeoJsonLayerLegendId, getGeoJsonLayerLegendDedupeKey } = loadSource("editor/geojson-layer-legend.ts");
  const zone = (name) => ({
    type: "Feature",
    properties: { name },
    geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
  });
  const line = (name) => ({
    type: "Feature",
    properties: { name },
    geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
  });
  const layer = parseGeoJsonTextToDromapGeoJsonLayer(JSON.stringify({
    type: "FeatureCollection",
    features: [zone("Bois"), zone("Zone commune"), zone("Parc"), line("Trait commun"), line("Chemin"), line("Trait masqué")],
  }), { layerName: "Quartier" });
  const store = useEditorGeoJsonLayersStore;
  store.getState().addGeoJsonLayer(layer);
  const [original] = store.getState().geoJsonLayers;
  const edit = (index, style) => store.getState().updateGeoJsonFeatureSettings(layer.id, original.data.features[index].id, { style });
  edit(0, { fillColor: "#008000", fillOpacity: 0.5 });
  edit(2, { fillColor: "#008000", fillOpacity: 0.5 });
  edit(4, { strokeColor: "#880000", dashStyle: "dotted" });
  edit(5, { strokeOpacity: 0 });

  const [updated] = store.getState().geoJsonLayers;
  const baseZoneKey = getGeoJsonLayerLegendDedupeKey(layer.id, "zones");
  const baseZoneId = getGeoJsonLayerLegendId(layer.id, "zones");
  const options = { legendGroupLabels: { [baseZoneKey]: "Zones du quartier" }, legendGroupSections: { [baseZoneKey]: "Landes" } };
  const [baseZone, parks, baseLine, path] = getGeoJsonLayerLegendEntries([updated], options);
  assert.equal(baseZone.id, baseZoneId);
  assert.equal(baseZone.label, "Zones du quartier");
  assert.equal(baseZone.count, 1);
  assert.equal(parks.label, "Bois et autres");
  assert.equal(parks.count, 2);
  assert.equal(parks.section, "Landes");
  assert.equal(parks.representativeFeature.properties.style.fillColor, "#008000");
  assert.equal(baseLine.count, 1);
  assert.equal(path.label, "Chemin");
  assert.equal(path.representativeFeature.properties.style.dashStyle, "dotted");
  assert.deepEqual(getGeoJsonLayerLegendEntries([updated], { hiddenLegendFeatureIds: [parks.id] }).map(({ id }) => id), [baseZone.id, baseLine.id, path.id]);

  const classified = { ...updated, data: { ...updated.data, features: updated.data.features.map((feature) => ({
    ...feature, properties: { ...feature.properties, dromap_ai_value: 1 },
  })) } };
  assert.deepEqual(getGeoJsonLayerLegendEntries([classified], { hiddenLegendFeatureIds: [baseZoneId] }).map(({ id }) => id), [baseLine.id, path.id]);
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
