import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { loadSource } from "../security/load-source.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function loadTs(path, modules = {}) {
  const compiledModule = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function("require", "module", "exports", code)((name) => name in modules ? modules[name] : require(name), compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

const capabilities = loadTs("editor/dromap-ai-capabilities.ts");
const schemas = loadTs("editor/dromap-ai-schema.ts", { "./dromap-ai-capabilities": capabilities });
const vector = loadTs("editor/dromap-ai-vector-source.ts");
const outline = [[0, 42], [8, 42], [8, 51], [0, 51], [0, 42]];
const hole = [[2, 44], [3, 44], [3, 45], [2, 44]];
const island = [[8, 41], [9, 41], [9, 42], [8, 41]];
const geometry = { type: "MultiPolygon", coordinates: [[outline, hole], [island]] };

test("une recherche factuelle exige un appel web réel et ne valide pas une réponse sans recherche", async () => {
  let options;
  let reply = { status: "completed", output_text: '{"summary":"Vérifié"}', output: [{ type: "web_search_call" }] };
  class FakeOpenAi {
    responses = { create: async (request) => { options = request; return reply; } };
  }
  const { callStructuredOpenAi } = loadTs("lib/dromap/server/openai-provider.ts", { "server-only": {}, openai: FakeOpenAi });
  const request = { apiKey: "test-key", choice: { model: "gpt-5.6-luna", reasoning: "low", level: "rapid" }, schema: schemas.AI_RESEARCH_SCHEMA, schemaName: "research", input: "Capitales", instructions: "Vérifier", webSearch: true };
  assert.equal((await callStructuredOpenAi(request)).webSearched, true);
  assert.equal(options.tool_choice, "required");
  reply = { ...reply, output: [] };
  await assert.rejects(callStructuredOpenAi(request), { code: "AI_WEB_SEARCH_NOT_EXECUTED" });
  await callStructuredOpenAi({ ...request, webSearch: false });
  assert.equal(options.tool_choice, undefined);
});

test("les géométries conservent les îles et les trous, sans accepter des coordonnées invalides", () => {
  assert.deepEqual(vector.getAiVectorPolygons(vector.readAiVectorGeometry(geometry)), [[outline, hole], [island]]);
  assert.deepEqual(vector.getAiVectorLines(geometry), [outline, hole, island]);
  assert.equal(vector.readAiVectorGeometry({ type: "Polygon", coordinates: [[[181, 45]]] }), null);
  assert.equal(vector.readAiVectorGeometry({ type: "LineString", coordinates: [[2, NaN]] }), null);
});

function store(initial) {
  let state = initial;
  return { getState: () => state, setState: (data) => { state = { ...state, ...data }; } };
}

function installDom(t, dom) {
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => { if (original) Object.defineProperty(globalThis, name, original); else delete globalThis[name]; });
  }
}

test("R06 N17 : une mairie ne présélectionne pas le voisinage et un groupe absent bloque l’import", async t => {
  const workspace = store({workspaceBounds:{southWest:{lat:48.85,lng:2.33},northEast:{lat:48.87,lng:2.36}}});
  const modules = {
    "@/stores/editor-workspace":{useEditorWorkspaceStore:workspace},
    "./ai-building-source":{fetchAiBuildings:async()=>[
      {type:"Feature",id:"mairie",properties:{},geometry:{type:"Polygon",coordinates:[[[2.34,48.86],[2.3401,48.86],[2.3401,48.8601],[2.34,48.86]]]}},
      {type:"Feature",id:"voisin",properties:{},geometry:{type:"Polygon",coordinates:[[[2.3405,48.86],[2.3406,48.86],[2.3406,48.8601],[2.3405,48.86]]]}},
    ]},
  };
  for (const [,dependency] of readFileSync(new URL("../../editor/dromap-ai-executor.ts",import.meta.url),"utf8").matchAll(/from "([^"]+)"/g)) modules[dependency] ??= {};
  t.mock.method(globalThis,"fetch",async()=>Response.json({results:[{id:"townhall",lat:48.86005,lng:2.34005,displayName:"Mairie"}]}));
  const {prepareDroMapAiBuildingSelection,importDroMapAiSelectedBuildings}=loadTs("editor/dromap-ai-executor.ts",modules);
  const command={id:"buildings",type:"import_buildings",buildingSelectionMode:"named",buildingQueries:["Mairie de test"],places:[],place:null,bounds:null};
  const prepared=await prepareDroMapAiBuildingSelection(command);
  assert.deepEqual(prepared.suggestedFeatureIds,["mairie"]);
  assert.throws(()=>importDroMapAiSelectedBuildings({...command,buildingQueries:["Mairie de test","Palais de test"]},prepared,[prepared.features[0]]),/Sélection incomplète/);
});

test("N15 : les catégories routières GeoJSON ont leurs propres groupes de légende", async () => {
  const grouped = [];
  const stores = {
    basemap: store({}), customMarkers: store({}), export: store({ hiddenLegendGroupKeys: [],
      setLegendGroupLabel: (key,label) => grouped.push([key,label]),
      setLegendGroupSection() {} }),
    features: store({features: []}), geoJsonLayers: store({geoJsonLayers: [
      {id:"roads-primary",name:"Routes principales"},
      {id:"roads-secondary",name:"Routes secondaires"},
    ]}), layers: store({layers: []}), mapLabels: store({}),
    mode: store({currentMode:"edit"}), selection: store({clearSelectedFeatureId() {}}),
    tool: store({resetActiveTool() {}}),
    workspace: store({workspaceBounds:{southWest:{lat:48,lng:2},northEast:{lat:49,lng:3}}}),
  };
  const modules = Object.fromEntries(Object.entries(stores).map(([name,value]) => [
    `@/stores/editor-${name === "geoJsonLayers" ? "geojson-layers" : name.replace(/[A-Z]/g,letter=>`-${letter.toLowerCase()}`)}`,
    {[`useEditor${name[0].toUpperCase()}${name.slice(1)}Store`]:value},
  ]));
  modules["./geojson-layer-legend"] = {
    getGeoJsonLayerLegendKinds: () => [{kind:"lines",count:1}],
    getGeoJsonLayerLegendDedupeKey: (id,kind) => `geojson-layer:${id}:${kind}`,
  };
  for (const [,dependency] of readFileSync(new URL("../../editor/dromap-ai-executor.ts",import.meta.url),"utf8").matchAll(/from "([^"]+)"/g)) modules[dependency] ??= {};
  const {executeDroMapAiPlan} = loadTs("editor/dromap-ai-executor.ts",modules);
  const commands = ["Routes principales","Routes secondaires"].map((name,index) => ({
    id:"legend-"+index,type:"configure_feature_legend",label:name,section:"Réseau routier",hidden:null,orderRefs:[],
    selector:{all:false,featureIds:[],layerName:name,sourceType:"geojson",featureType:null,labelContains:null,legendLabelContains:null},
  }));
  await executeDroMapAiPlan({commands,warnings:[]});
  assert.deepEqual(grouped,[["geojson-layer:roads-primary:lines","Routes principales"],["geojson-layer:roads-secondary:lines","Routes secondaires"]]);
});

test("remplir puis tracer un pays sur fond classique conserve les objets sans ajouter de calque technique", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    requests.push(String(url));
    return { ok: true, json: async () => ({ results: String(url).includes("Inconnu") ? [] : [{ geometry, boundaryKind: "land", source: { sourceLabel: "Natural Earth", sourceUrl: "https://www.naturalearthdata.com", sourceLicense: "Public domain", sourceAttribution: "Natural Earth" } }] }) };
  });
  const stores = {
    basemap: store({ basemapId: "classic" }), customMarkers: store({ customMarkers: [] }),
    export: store({}), features: store({ features: [] }), geoJsonLayers: store({ geoJsonLayers: [] }),
    layers: store({ activeLayerId: "layer-1", layers: [{ id: "layer-1", name: "Calque 1" }] }),
    mapLabels: store({}), mode: store({ currentMode: "edit" }),
    selection: store({ clearSelectedFeatureId() {} }), tool: store({ resetActiveTool() {} }),
    workspace: store({ workspaceBounds: { southWest: { lat: 40, lng: -5 }, northEast: { lat: 52, lng: 10 } } }),
  };
  stores.features.setState({ commitFeaturesHistory() {}, addFeatures(features) { stores.features.setState({ features: [...stores.features.getState().features, ...features] }); } });
  const modules = Object.fromEntries(Object.entries(stores).map(([name, value]) => [
    `@/stores/editor-${name === "geoJsonLayers" ? "geojson-layers" : name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
    { [`useEditor${name[0].toUpperCase()}${name.slice(1)}Store`]: value },
  ]));
  const zoneFill = loadTs("editor/zone-fill.ts", {
    "@/lib/dromap/basemap": {}, "@/lib/dromap/basemap-boundaries": {}, "@/stores/editor-geojson-layers": {},
  });
  modules["./zone-fill"] = zoneFill;
  modules["./dromap-ai-vector-source"] = vector;
  // Les autres imports ne participent pas à ces deux commandes.
  const executorSource = readFileSync(new URL("../../editor/dromap-ai-executor.ts", import.meta.url), "utf8");
  for (const [, dependency] of executorSource.matchAll(/from "([^"]+)"/g)) modules[dependency] ??= {};
  const { executeDroMapAiPlan, undoLastDroMapAiPlan } = loadTs("editor/dromap-ai-executor.ts", modules);
  const command = { id: "france-fill", type: "fill_boundary", place: "France test", label: "France", legendLabel: "France", layerRef: null, style: { fillColor: "#ff0000", fillOpacity: 0.6 }, coordinate: null };
  const plan = { summary: "France", warnings: [], commands: [command, { ...command, id: "france-line", type: "trace_boundary", style: { color: "#ff0000", weight: 3 } }] };
  const result = await executeDroMapAiPlan(plan);
  const features = stores.features.getState().features;
  assert.equal(result.createdFeatureIds.length, 5);
  assert.equal(features.filter((feature) => feature.properties.type === "zone").length, 2);
  assert.deepEqual(features[0].geometry.coordinates, [outline, hole]);
  assert.equal(features[0].properties.style.fillColor, "#ff0000");
  assert.equal(features[2].properties.lineVariant, "traced");
  assert.equal(stores.basemap.getState().basemapId, "classic");
  assert.deepEqual(stores.geoJsonLayers.getState().geoJsonLayers, []);
  assert.deepEqual(result.createdGeoJsonLayerIds, []);
  assert.equal(requests.every((url) => url.includes("geometry=1")), true);
  assert.equal(undoLastDroMapAiPlan(), true);
  assert.deepEqual(stores.features.getState().features, []);
  await assert.rejects(executeDroMapAiPlan({ ...plan, commands: [{ ...command, type: "trace_boundary", place: "Inconnu" }] }), /Aucun tracé vectoriel vérifié/);
  assert.deepEqual(stores.features.getState().features, []);
});

test("19 : l’exécuteur crée trois vraies courbes proportionnelles sans étiquettes, exportables et annulables", async () => {
  const stores = {
    basemap: store({ basemapId: "classic" }), customMarkers: store({ customMarkers: [] }),
    export: store({ customLegendEntries: [], legendGroupOrder: [], setLegendGroupOrder() {} }),
    features: store({ features: [] }), geoJsonLayers: store({ geoJsonLayers: [] }),
    layers: store({ activeLayerId: "layer-1", layers: [{ id: "layer-1", name: "Calque 1" }] }),
    mapLabels: store({}), mode: store({ currentMode: "edit" }),
    selection: store({ clearSelectedFeatureId() {} }), tool: store({ resetActiveTool() {} }),
    workspace: store({ workspaceBounds: { southWest: { lat: 40, lng: -5 }, northEast: { lat: 52, lng: 10 } } }),
  };
  stores.features.setState({ commitFeaturesHistory() {}, addFeature(feature) { stores.features.setState({ features: [...stores.features.getState().features, feature] }); } });
  const modules = Object.fromEntries(Object.entries(stores).map(([name, value]) => [
    `@/stores/editor-${name === "geoJsonLayers" ? "geojson-layers" : name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`,
    { [`useEditor${name[0].toUpperCase()}${name.slice(1)}Store`]: value },
  ]));
  modules["@/lib/dromap/curved-line"] = loadSource("lib/dromap/curved-line.ts");
  let fitted = null;
  modules["./dromap-ai-map-bridge"] = { fitDroMapAiMapBounds: bounds => { fitted = bounds; } };
  modules["./ai-flow-geometry"] = loadSource("editor/ai-flow-geometry.ts");
  modules["./legend-entry"] = { getLegendDedupeKey: feature => feature.id };
  for (const [, dependency] of readFileSync(new URL("../../editor/dromap-ai-executor.ts", import.meta.url), "utf8").matchAll(/from "([^"]+)"/g)) modules[dependency] ??= {};
  const { executeDroMapAiPlan, undoLastDroMapAiPlan } = loadTs("editor/dromap-ai-executor.ts", modules);
  const pairs = [[[2.35,48.86],[4.84,45.76]], [[4.84,45.76],[5.37,43.3]], [[2.35,48.86],[5.37,43.3]]];
  const seriesItems = [100,50,30].map((value, index) => ({ id: `flux-${index}`, label: `Flux ${index}`, value, fromCoordinate: { lng: pairs[index][0][0], lat: pairs[index][0][1] }, toCoordinate: { lng: pairs[index][1][0], lat: pairs[index][1][1] } }));
  const command = { id: "flows", type: "create_proportional_flows", lineVariant: "curved", seriesItems, style: {}, mapLabelVisibility: "hide" };
  const fit = { type: "fit_view", selector: {featureIds:["flows"],all:false,labelContains:null,legendLabelContains:null,layerName:null,featureType:null,sourceType:null} };
  const result = await executeDroMapAiPlan({ commands: [command, fit], warnings: [] });
  assert.ok(fitted, "N04 : le recadrage résout les références des étapes créées");
  assert.ok(!result.warnings.includes("Aucun objet disponible pour recadrer la vue."));
  const features = stores.features.getState().features;
  assert.equal(result.createdFeatureIds.length, 3);
  features.forEach((feature, index) => {
    const points = feature.geometry.coordinates;
    assert.ok(points.length > 3);
    assert.deepEqual(points[0], pairs[index][0]); assert.deepEqual(points.at(-1), pairs[index][1]);
    assert.equal(feature.properties.style.arrowEnd, true);
    assert.equal(feature.properties.mapLabelVisibility, "hide");
    assert.equal(feature.properties.lineVariant, "curved");
    const a = points[0], b = points.at(-1);
    assert.ok(points.some(p => Math.abs((p[0]-a[0])*(b[1]-a[1])-(p[1]-a[1])*(b[0]-a[0])) > .01));
  });
  assert.ok(features[0].properties.style.weight > features[1].properties.style.weight);
  assert.ok(features[1].properties.style.weight > features[2].properties.style.weight);
  const { validateExportGeometry } = loadSource("editor/export-validation.ts");
  assert.doesNotThrow(() => validateExportGeometry({ features }));
  assert.equal(undoLastDroMapAiPlan(), true);
  assert.deepEqual(stores.features.getState().features, []);
});

test("l’édition manuelle affiche les paramètres, permet de changer d’action et enregistre sans IA", async (t) => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>');
  installDom(t, dom);
  t.mock.method(globalThis, "fetch", () => { throw new Error("Aucun appel réseau ne doit être fait pour modifier une étape."); });
  const React = require("react");
  const { act } = React;
  const { createRoot } = require("react-dom/client");
  const { DroMapAiCommandEditor } = loadTs("editor/dromap-ai-command-editor.tsx", {
    "./dromap-ai-capabilities": capabilities, "./dromap-ai-schema": schemas,
    "./geojson-data-catalog": { DROMAP_GEOJSON_CATALOG: [] }, "./marker-symbol": { DROMAP_BUILTIN_MARKER_SYMBOLS: [] },
  });
  const command = { id: "france", type: "fill_boundary", explanation: "Colorier la France", place: "France", coordinate: null, label: "France", legendLabel: "Pays", layerRef: "layer-1", style: { fillColor: "#ff0000", fillOpacity: 0.6, weight: 2 }, selector: { featureIds: [], all: false } };
  let saved;
  const root = createRoot(document.getElementById("root"));
  await act(async () => root.render(React.createElement(DroMapAiCommandEditor, {
    command, plan: { commands: [command] }, context: { layers: [{ id: "layer-1", name: "Principal" }], geoJsonLayers: [], customMarkers: [] }, workspaceMode: "manual", onSave: (value) => { saved = value; return null; }, onCancel() {},
  })));
  const control = (label) => [...document.querySelectorAll("label")].find((element) => element.firstElementChild?.textContent === label)?.querySelector("input,select,textarea");
  assert.equal(control("Lieu ou territoire").value, "France");
  assert.equal(control("Opacité du remplissage (0 à 1)").value, "0.6");
  assert.equal(control("Épaisseur du contour").value, "2");
  const action = control("Action à exécuter");
  assert.equal([...action.options].some((option) => option.value === "set_workspace_bounds"), false);
  await act(async () => { action.value = "trace_boundary"; action.dispatchEvent(new window.Event("change", { bubbles: true })); });
  const layer = control("Calque de destination");
  await act(async () => { layer.value = ""; layer.dispatchEvent(new window.Event("change", { bubbles: true })); });
  await act(async () => [...document.querySelectorAll("button")].find((button) => button.textContent === "Enregistrer l’étape").click());
  assert.equal(saved.type, "trace_boundary");
  assert.equal(saved.place, "France");
  assert.equal(saved.style.weight, 2);
  assert.equal(saved.layerRef, null);
  assert.equal(command.type, "fill_boundary");
  await act(async () => root.unmount());
  dom.window.close();
});

test("le panneau ouvert sort du contexte de superposition des boutons de carte", async (t) => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM('<!doctype html><body><div id="dock" style="position:relative;z-index:1000"></div></body>');
  installDom(t, dom);
  const { createElement, act } = require("react");
  const { createRoot } = require("react-dom/client");
  const { FloatingPanelPortal } = loadTs("editor/floating-panel-portal.tsx");
  const dock = document.getElementById("dock");
  const root = createRoot(dock);
  await act(async () => root.render(createElement(FloatingPanelPortal, { active: true }, createElement("section", { id: "assistant" }))));
  assert.equal(document.getElementById("assistant").parentElement, document.body);
  await act(async () => root.render(createElement(FloatingPanelPortal, { active: false }, createElement("button", { id: "launcher" }))));
  assert.equal(document.getElementById("launcher").parentElement, dock);
  await act(async () => root.unmount());
  dom.window.close();
});
