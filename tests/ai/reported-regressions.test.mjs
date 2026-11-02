import assert from "node:assert/strict";
import test from "node:test";
import { loadSource } from "../security/load-source.mjs";

const { curvedFlowHandles } = loadSource("editor/ai-flow-geometry.ts");
const { enforceMapLabelDefaults } = loadSource("editor/dromap-ai-label-policy.ts");
const { AI_INTERACTION_SCHEMA } = loadSource("editor/dromap-ai-schema.ts");
const { validateExportGeometry } = loadSource("editor/export-validation.ts");
const { normalizeAiProviderError } = loadSource("lib/dromap/server/openai-provider.ts");
const { assembleRings } = loadSource("lib/dromap/server/osm-buildings.ts");

test("19 : le schéma accepte des flux proportionnels courbes", () => {
  const flow = AI_INTERACTION_SCHEMA.properties.commands.items.anyOf.find(c => c.properties.type.enum[0] === "create_proportional_flows");
  assert.ok(flow.properties.lineVariant.enum.includes("curved"));
});
test("19 : les poignées conservent les extrémités et créent une courbure effective", () => {
  const from = { lat: 48.86, lng: 2.35 }, to = { lat: 45.76, lng: 4.84 };
  const [a, m, b] = curvedFlowHandles(from, to);
  assert.deepEqual(a, from); assert.deepEqual(b, to);
  assert.ok(Math.abs((m.lng-a.lng)*(b.lat-a.lat)-(m.lat-a.lat)*(b.lng-a.lng)) > .01);
});
test("les flux, traits et surfaces respectent sans étiquettes", () => {
  const plan = { commands: ["create_proportional_flows", "trace_boundary", "fill_boundary"].map(type => ({ type, style: { fontSize: 42 }, mapLabelVisibility: "show" })) };
  enforceMapLabelDefaults("Flèches courbes et France colorée, sans étiquettes", plan);
  assert.equal(plan.commands[0].lineVariant, "curved");
  for (const c of plan.commands) { assert.equal(c.mapLabelVisibility, "hide"); assert.equal(c.style.fontSize, null); }
});
test("17 : reconstruction des bâtiments OSM avec segments inversés", () => {
  assert.deepEqual(assembleRings([[[0,0],[1,0]], [[1,1],[1,0]], [[1,1],[0,1],[0,0]]]), [[[0,0],[1,0],[1,1],[0,1],[0,0]]]);
  assert.throws(() => assembleRings([[[0,0],[1,0]]]), /incomplète/);
});
test("export : refus d'un contour ouvert et de coordonnées non finies", () => {
  assert.throws(() => validateExportGeometry({ features: [{ geometry: { type: "Polygon", coordinates: [[[0,0],[1,0],[1,1]]] }, properties: {} }] }), /contour ouvert/);
  assert.throws(() => validateExportGeometry({ features: [{ geometry: { type: "Point", coordinates: [NaN, 0] }, properties: {} }] }), /coordonnées invalides/);
});
test("export : ancien remplissage administratif refusé, contour terrestre accepté", () => {
  const feature = { geometry: { type: "Polygon", coordinates: [[[0,0],[1,0],[1,1],[0,0]]] }, properties: { type: "zone", source: { sourceLabel: "OpenStreetMap / Nominatim" } } };
  assert.throws(() => validateExportGeometry({ features: [feature] }), /ancienne frontière/);
  feature.properties.source = { sourceLabel: "Natural Earth", originalProperties: { dromapBoundaryKind: "land" } };
  assert.doesNotThrow(() => validateExportGeometry({ features: [feature] }));
});
test("les erreurs de délai, quota et accès ne sont pas masquées en panne générique", () => {
  assert.equal(normalizeAiProviderError({ name: "APIConnectionTimeoutError" }).code, "AI_PROVIDER_TIMEOUT");
  assert.equal(normalizeAiProviderError({ status: 429, code: "insufficient_quota" }).code, "AI_PROVIDER_QUOTA");
  assert.equal(normalizeAiProviderError({ status: 401 }).code, "AI_PROVIDER_ACCESS");
});

const land = { geometry: { type: "Polygon", coordinates: [[[2,48],[3,48],[3,49],[2,49],[2,48]]] }, label: "Paris", properties: { code: "75" }, source: { sourceLabel: "IGN", sourceUrl: "https://example.org/land" } };
const bulk = loadSource("lib/dromap/server/ai-bulk-geodata.ts", {
  "./land-boundaries": { resolveLandBoundary: async q => q.includes("paris") ? land : null },
  "./public-url": { readPublicUrl: async url => JSON.stringify(url.hostname === "geo.api.gouv.fr" ? { features: [
    { properties: { nom: "Grande", code: "1", population: 600001 }, geometry: { type: "Point", coordinates: [2.5,48.5] } },
    { properties: { nom: "Limite", code: "2", population: 500000 }, geometry: { type: "Point", coordinates: [2.5,48.5] } },
  ] } : { features: [] }) },
  "./overpass": { queryOverpass: async () => ({ elements: [
    { type: "node", id: 1, lon: 2.5, lat: 48.5, tags: { name: "Dedans" } },
    { type: "node", id: 2, lon: 4, lat: 48.5, tags: { name: "Dehors" } },
  ] }) },
});
test("15 : Grandes villes dans la légende ne déclenche pas une recherche de population", () => {
  assert.equal(bulk.parseBulkPlaceRequest('Place des marqueurs à Paris, Lyon et Marseille puis organise la légende dans une section « Grandes villes » et ajoute un titre.'), null);
  assert.equal(bulk.parseBulkPlaceRequest('Affiche toutes les « capitales » de la zone').kind, "capitals");
});
test("6 : département nommé filtré par son polygone dans la zone de travail", async () => {
  const result = await bulk.resolveBulkPlaces(bulk.parseBulkPlaceRequest("Affiche toutes les usines du département de Paris (75)"), { south:47, west:1, north:50, east:5 });
  assert.deepEqual(result.items.map(i => i.label), ["Dedans"]);
  assert.equal(result.scopeLabel, "Paris");
});
test("5 : le seuil municipal français est strict", async () => {
  const result = await bulk.resolveBulkPlaces(bulk.parseBulkPlaceRequest("Affiche toutes les villes de plus de 500 000 habitants du département de Paris"), null);
  assert.deepEqual(result.items.map(i => i.label), ["Grande"]);
  assert.equal(result.populationBasis, "municipal");
});
test("un territoire inconnu ne retombe pas silencieusement sur le rectangle", async () => {
  await assert.rejects(bulk.resolveBulkPlaces(bulk.parseBulkPlaceRequest("Toutes les usines de la région Introuvable"), { south:47, west:1, north:50, east:5 }), /pas été identifié/);
});

test("08-10 : la résolution terrestre utilise une source cartographique identifiée", async () => {
  const { resolveLandBoundary } = loadSource("lib/dromap/server/land-boundaries.ts", {
    "./public-url": { readPublicUrl: async () => JSON.stringify({ features: [{ type: "Feature", properties: { ADMIN: "France", NAME_FR: "France" }, geometry: land.geometry }] }) },
  });
  const result = await resolveLandBoundary("France");
  assert.equal(result.datasetId, "natural-earth-countries-10m");
  assert.deepEqual(result.geometry, land.geometry);
  assert.ok(result.source.sourceUrl.includes("natural-earth"));
});

test("17 : une panne réseau IGN utilise OSM et conserve son attribution", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async url => {
    calls.push(String(url));
    if (String(url).includes("provider=ign")) throw new TypeError("fetch failed");
    return Response.json({ features: [{ type: "Feature", properties: {}, geometry: land.geometry }] });
  });
  const { fetchAiBuildings, buildingSource } = loadSource("editor/ai-building-source.ts");
  const features = await fetchAiBuildings({ south: 48, west: 2, north: 49, east: 3 }, 100);
  assert.equal(calls.length, 2);
  assert.equal(features[0].properties.__dromapBuildingProvider, "osm");
  assert.equal(buildingSource(features).sourceLicense, "ODbL");
});

test("17 : une limite de bâtiments ne devient pas un import partiel de substitution", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return Response.json({ error: "Trop de bâtiments" }, { status: 413 }); });
  const { fetchAiBuildings } = loadSource("editor/ai-building-source.ts");
  await assert.rejects(fetchAiBuildings({ south: 48, west: 2, north: 49, east: 3 }, 100), /Trop de bâtiments/);
  assert.equal(calls, 1);
});

test("une réponse IA incomplète est reprise une seule fois, avec le modèle réellement utilisé", async () => {
  const calls = [];
  class Provider {
    responses = { create: async options => {
      calls.push(options);
      return calls.length === 1 ? { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }
        : { status: "completed", model: options.model, output_text: '{"commands":[]}', output: [] };
    } };
  }
  const { callStructuredOpenAi } = loadSource("lib/dromap/server/openai-provider.ts", { openai: Provider });
  const result = await callStructuredOpenAi({ apiKey: "test", choice: { model: "gpt-5.6-sol", reasoning: "high", level: "complex" }, schema: {}, schemaName: "plan", input: "test", instructions: "test" });
  assert.equal(calls.length, 2);
  assert.equal(result.model, "gpt-5.6-terra");
  assert.deepEqual(result.parsed.commands, []);
});

test("Overpass : reprise après panne, refus des résultats partiels", async t => {
  let calls = 0;
  const original = process.env.DROMAP_OVERPASS_API_URLS;
  process.env.DROMAP_OVERPASS_API_URLS = "https://first.example,https://second.example";
  t.after(() => { if (original === undefined) delete process.env.DROMAP_OVERPASS_API_URLS; else process.env.DROMAP_OVERPASS_API_URLS = original; });
  t.mock.method(globalThis, "fetch", async () => ++calls === 1 ? Response.json({ remark: "query timed out", elements: [{ id: 1 }] }) : Response.json({ elements: [{ id: 2 }] }));
  const { queryOverpass } = loadSource("lib/dromap/server/overpass.ts");
  assert.deepEqual((await queryOverpass("test")).elements, [{ id: 2 }]);
  assert.equal(calls, 2);
});

test("18 : principales et secondaires restent distinctes et conservent leurs couleurs après resélection", () => {
  let layers = [];
  let id = 0;
  const store = { getState: () => ({ geoJsonLayers: layers, setGeoJsonLayers: value => { layers = value; } }) };
  const { reconcileDromapRoadImport } = loadSource("editor/road-import-runtime.ts", {
    "@/stores/editor-geojson-layers": { useEditorGeoJsonLayersStore: store, parseGeoJsonTextToDromapGeoJsonLayer: (text, options) => ({ id: `layer-${++id}`, name: options.layerName, data: JSON.parse(text), visible: true, opacity: 1, createdAt: "today", style: {} }) },
    "@/stores/editor-features": { useEditorFeaturesStore: { getState: () => ({ commitFeaturesHistory() {} }) } },
  });
  const features = ["primary", "secondary"].map(highway => ({ type: "Feature", properties: { highway }, geometry: { type: "LineString", coordinates: [[2,48],[3,49]] } }));
  const input = { features, source: {}, categories: ["main", "secondary"], mode: "selection", splitByCategory: true };
  const first = reconcileDromapRoadImport(input);
  assert.equal(first.categoryLayers.length, 2);
  assert.deepEqual(first.categoryLayers.map(l => l.category), ["main", "secondary"]);
  layers[0].style.strokeColor = "#ff0000"; layers[1].style.strokeColor = "#0000ff";
  const ids = layers.map(l => l.id);
  reconcileDromapRoadImport({ ...input, splitByCategory: false });
  assert.deepEqual(layers.map(l => l.id), ids);
  assert.deepEqual(layers.map(l => l.style.strokeColor), ["#ff0000", "#0000ff"]);
});

test("une région inconnue qualifiée France ne devient pas le pays entier", async () => {
  const { resolveLandBoundary } = loadSource("lib/dromap/server/land-boundaries.ts", {
    "./public-url": { readPublicUrl: async () => JSON.stringify({ features: [{ type: "Feature", properties: { NAME_FR: "France" }, geometry: land.geometry }] }) },
  });
  // The country collection must never be used for an explicit subdivision.
  assert.equal(await resolveLandBoundary("région Introuvable France"), null);
});

test("une liste sans territoire explicite utilise la zone de travail", async () => {
  const result = await bulk.resolveBulkPlaces(bulk.parseBulkPlaceRequest("Affiche toutes les usines"), { south:47, west:1, north:50, east:5 });
  assert.equal(result.scopeLabel, "zone de travail");
  assert.equal(result.items.length, 2);
});

test("20 : une source de secours sans preuve citée ne valide pas un fait", () => {
  const { filterResearchEvidence } = loadSource("lib/dromap/server/research-evidence.ts");
  const url = "https://example.org/history";
  const quote = "Six pays signent le traité le 25 mars 1957.";
  const corpus = [{ url, text: `Histoire. ${quote} Fin.` }];
  const result = filterResearchEvidence([
    { subject: "CEE", sourceUrl: url, note: quote },
    { subject: "Inventé", sourceUrl: url, note: "Cette phrase ne figure dans aucune source consultée." },
    { subject: "URL inventée", sourceUrl: "https://invented.example", note: quote },
  ], [{ url }], corpus);
  assert.equal(result.facts.length, 1);
  assert.equal(result.facts[0].subject, "CEE");
  assert.deepEqual(result.sources, [{ url }]);
});
