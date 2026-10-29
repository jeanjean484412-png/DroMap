import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const countries = {
  features: [
    {
      properties: { ADMIN: "France", ISO_A2: "FR", ADM0_A3: "FRA", CONTINENT: "Europe" },
      geometry: { type: "Polygon", coordinates: [[[0, 42], [8, 42], [8, 51], [0, 51], [0, 42]]] },
    },
    {
      properties: { ADMIN: "Germany", ISO_A2: "DE", ADM0_A3: "DEU", CONTINENT: "Europe" },
      geometry: { type: "Polygon", coordinates: [[[8, 47], [15, 47], [15, 55], [8, 55], [8, 47]]] },
    },
  ],
};
const places = {
  features: [
    { properties: { name: "Paris", featurecla: "Admin-0 capital", adm0_a3: "FRA", pop_max: 9_000_000 }, geometry: { type: "Point", coordinates: [2.35, 48.86] } },
    { properties: { name: "Lyon", featurecla: "Admin-1 capital", pop_max: 1_500_000 }, geometry: { type: "Point", coordinates: [4.84, 45.76] } },
    { properties: { name: "Berlin", featurecla: "Admin-0 capital", adm0_a3: "DEU", pop_max: 4_000_000 }, geometry: { type: "Point", coordinates: [13.4, 52.52] } },
    { properties: { name: "Petitbourg", featurecla: "Populated place", pop_max: 9_000 }, geometry: { type: "Point", coordinates: [2.5, 48.5] } },
  ],
};
const osm = {
  elements: [
    { type: "node", id: 12, lat: 48.87, lon: 2.4, tags: { name: "Usine Paris" } },
    { type: "node", id: 13, lat: 52.5, lon: 13.4, tags: { name: "Usine Berlin" } },
  ],
};

const source = readFileSync(new URL("../lib/dromap/server/ai-bulk-geodata.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiledModule = { exports: {} };
const modules = {
  "server-only": {},
  "@/editor/geojson-data-catalog": {
    DROMAP_GEOJSON_CATALOG: [
      { id: "natural-earth-countries-50m", downloadUrl: "https://example.org/countries.geojson" },
      { id: "natural-earth-populated-places-10m-simple", downloadUrl: "https://example.org/places.geojson" },
    ],
  },
  "./public-url": {
    readPublicUrl: async (url) => JSON.stringify(url.pathname.endsWith("countries.geojson")
      ? countries : url.pathname.endsWith("places.geojson") ? places : osm),
  },
};
new Function("require", "module", "exports", compiled)(
  (name) => {
    if (!(name in modules)) throw new Error(`Module inattendu : ${name}`);
    return modules[name];
  },
  compiledModule,
  compiledModule.exports,
);
const { parseBulkPlaceRequest, resolveBulkPlaces } = compiledModule.exports;

test("la zone signifie les limites du projet et exclut les points hors zone", async () => {
  const request = parseBulkPlaceRequest("Mets un marqueur sur toutes les capitales de la zone");
  assert.equal(request?.kind, "capitals");
  assert.equal(request?.usesWorkspace, true);
  const result = await resolveBulkPlaces(request, { south: 48, west: 1, north: 49, east: 3 });
  assert.deepEqual(result.items.map((item) => item.label), ["Paris"]);
});

test("les villes utilisent un seuil strict et le pays demandé", async () => {
  const request = parseBulkPlaceRequest("Affiche toutes les villes de plus de 100 000 habitants en France");
  assert.equal(request?.minimumPopulation, 100_000);
  const result = await resolveBulkPlaces(request, null);
  assert.deepEqual(result.items.map((item) => item.label), ["Paris", "Lyon"]);
  assert.ok(result.warnings.some((warning) => warning.includes("pas un recensement exhaustif")));
});

test("les capitales européennes suivent le code du pays et les limites de la zone", async () => {
  const request = parseBulkPlaceRequest("Affiche toutes les capitales d'Europe");
  const result = await resolveBulkPlaces(request, null);
  assert.deepEqual(result.items.map((item) => item.label), ["Paris", "Berlin"]);
  const partial = await resolveBulkPlaces(request, { south: 48, west: 1, north: 49, east: 3 });
  assert.deepEqual(partial.items.map((item) => item.label), ["Paris"]);
});

test("une demande polie de toutes les villes capitales exclut les grandes villes ordinaires", async () => {
  const request = parseBulkPlaceRequest("Peux-tu mettre un marqueur sur toutes les villes capitales de l'Europe ?");
  assert.equal(request?.kind, "capitals");
  const result = await resolveBulkPlaces(request, null);
  assert.deepEqual(result.items.map((item) => item.label), ["Paris", "Berlin"]);
});

test("un million et demi d'habitants est correctement interprété", () => {
  assert.equal(parseBulkPlaceRequest("Toutes les villes de plus de 1,5 million d'habitants de la zone")?.minimumPopulation, 1_500_000);
});

test("les usines OSM sont recoupées avec la zone validée", async () => {
  const request = parseBulkPlaceRequest("Affiche toutes les usines de la zone");
  const result = await resolveBulkPlaces(request, { south: 48, west: 1, north: 49, east: 3 });
  assert.deepEqual(result.items.map((item) => item.label), ["Usine Paris"]);
});

test("les autres catégories cartographiées sont reconnues sans inventer de liste", () => {
  assert.equal(parseBulkPlaceRequest("Montre tous les hôpitaux de France")?.kind, "hospitals");
  assert.equal(parseBulkPlaceRequest("Mets mon marqueur sur toutes les écoles de la zone")?.kind, "schools");
  assert.equal(parseBulkPlaceRequest("Combien de musées existe-t-il ?"), null);
  assert.equal(parseBulkPlaceRequest("Je veux supprimer toutes les usines de la zone"), null);
});

test("sans zone ni territoire nommé, aucune liste n'est inventée", async () => {
  const request = parseBulkPlaceRequest("Toutes les capitales de la zone");
  await assert.rejects(resolveBulkPlaces(request, null), /zone de travail validée/i);
});
