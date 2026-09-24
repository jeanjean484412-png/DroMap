import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cache = new Map();

function loadTs(relativePath) {
  const path = resolve(root, relativePath);
  if (cache.has(path)) return cache.get(path);
  const source = readFileSync(path, "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  cache.set(path, module.exports);
  const localRequire = (name) => name.startsWith(".")
    ? loadTs(resolve(dirname(path), `${name}.ts`))
    : require(name);
  new Function("require", "module", "exports", code)(localRequire, module, module.exports);
  cache.set(path, module.exports);
  return module.exports;
}

const { chooseAiModel } = loadTs("editor/dromap-ai-router.ts");
const { AI_CAPABILITIES, AI_COMMAND_TYPES } = loadTs("editor/dromap-ai-capabilities.ts");
const { AI_INTERACTION_SCHEMA } = loadTs("editor/dromap-ai-schema.ts");
const { validateAiPlan, getAiPlanDependents } = loadTs("editor/dromap-ai-validator.ts");
const { repairWithValidation } = loadTs("editor/dromap-ai-repair.ts");

const context = {
  featureCount: 1,
  features: [{ id: "marqueur-existant", type: "marker", label: "Paris" }],
  layers: [{ id: "calque-1", name: "Principal" }],
  geoJsonLayers: [],
  customMarkers: [],
};

function command(type, overrides = {}) {
  return {
    id: `${type}-1`, type, explanation: "Action cartographique",
    place: null, coordinate: null, places: [], coordinates: [], rings: [], bounds: null,
    selector: {
      featureIds: [], labelContains: null, legendLabelContains: null,
      layerName: null, featureType: null, sourceType: null, all: false,
    },
    style: { color: null, fillColor: null, zoneHatchingColor: null,
      zoneDotsColor: null, textBackgroundColor: null, textBorderColor: null },
    layerRef: null, geoJsonLayerRef: null, customMarkerRef: null,
    orderRefs: [], seriesItems: [], classes: [], choroplethValues: [],
    geoJsonCatalogId: null, geoJsonUrl: null, geoJsonData: null,
    label: null, legendGroupKey: null, mapTitleColor: null,
    legendBackgroundColor: null, customMarkerSvg: null,
    ...overrides,
  };
}
function plan(...commands) {
  return { summary: "Carte", warnings: [], facts: [], sources: [], commands };
}
function codes(...commands) {
  return validateAiPlan(plan(...commands), context, "automatic").map((issue) => issue.code);
}

test("requêtes simples : modèle rapide", () => {
  assert.equal(chooseAiModel("Mets ce marqueur en rouge.", context).level, "rapid");
  assert.equal(chooseAiModel("Agrandis le titre et mets-le en haut.", context).level, "rapid");
});

test("carte historique, bâtiments et routes : modèle complexe et validation humaine", () => {
  assert.equal(chooseAiModel("Fais-moi une carte de la crise des euromissiles.", context).level, "complex");
  assert.equal(chooseAiModel("Importe les bâtiments militaires de Paris.", context).level, "complex");
  assert.equal(AI_CAPABILITIES.import_buildings.humanConfirmation, true);
  assert.equal(AI_CAPABILITIES.import_routes.humanConfirmation, true);
  assert.equal(AI_CAPABILITIES.create_custom_marker_svg.exposed, true);
});

test("demande OTAN/Pacte : complexe et aucune zone géométrique vide acceptée", () => {
  assert.equal(chooseAiModel("Colorie les pays de l’OTAN en violet et ceux du pacte de Varsovie en orange.", context).level, "complex");
  assert.ok(codes(command("create_zone", { label: "OTAN" })).includes("ZONE_POINTS"));
  assert.equal(codes(command("fill_boundary", { place: "France" })).length, 0);
});

test("une légende et plusieurs modifications basculent au niveau standard", () => {
  assert.equal(chooseAiModel("Modifie la légende de ces deux objets.", context).level, "standard");
  assert.equal(codes(command("update_features", {
    selector: { ...command("update_features").selector, featureIds: ["marqueur-existant"] },
    style: { ...command("update_features").style, markerSize: 30 },
  })).length, 0);
});

test("les sorties structurées couvrent exactement le registre exposé", () => {
  const variants = AI_INTERACTION_SCHEMA.properties.commands.items.anyOf;
  assert.ok(variants.length >= AI_COMMAND_TYPES.length);
  assert.deepEqual(new Set(variants.map((item) => item.properties.type.enum[0])), new Set(AI_COMMAND_TYPES));
  for (const variant of variants) {
    assert.equal(variant.additionalProperties, false);
    assert.deepEqual(new Set(variant.required), new Set(Object.keys(variant.properties)));
  }
});

test("le schéma strict reste dans les limites publiées par OpenAI", () => {
  const count = (node, depth = 1) => {
    if (!node || typeof node !== "object") return { properties: 0, enumValues: 0, depth };
    const properties = Object.entries(node.properties ?? {});
    const children = [
      ...properties.map(([, value]) => value),
      ...(node.anyOf ?? []),
      ...(node.items ? [node.items] : []),
    ].map((child) => count(child, depth + 1));
    return {
      properties: properties.length + children.reduce((total, item) => total + item.properties, 0),
      enumValues: (node.enum?.length ?? 0) + children.reduce((total, item) => total + item.enumValues, 0),
      depth: Math.max(depth, ...children.map((item) => item.depth)),
    };
  };
  const size = count(AI_INTERACTION_SCHEMA);
  assert.ok(size.properties <= 5000, JSON.stringify(size));
  assert.ok(size.enumValues <= 1000, JSON.stringify(size));
  assert.ok(size.depth <= 10, JSON.stringify(size));
});

test("toutes les commandes exécutables sont exposées ou explicitement interdites", () => {
  const source = readFileSync(resolve(root, "editor/dromap-ai-executor.ts"), "utf8");
  const executable = new Set([...source.matchAll(/case "([a-z_]+)":/g)].map((match) => match[1]));
  executable.add("import_routes"); // Ce workflow se prépare avant le switch principal.
  assert.deepEqual(new Set(Object.keys(AI_CAPABILITIES)), executable);
  assert.deepEqual(Object.keys(AI_CAPABILITIES).filter((type) => !AI_CAPABILITIES[type].exposed), ["set_basemap"]);
});

test("une zone vide et un texte sans lieu sont rejetés", () => {
  assert.ok(codes(command("create_zone")).includes("ZONE_POINTS"));
  assert.ok(codes(command("create_text", { label: "Océan Atlantique" })).includes("LOCATION_REQUIRED"));
  assert.ok(!codes(command("fill_boundary", { place: "France", style: { ...command("fill_boundary").style, fillColor: "#ff0000" } })).length);
});

test("les points d'un trait ou d'une zone utilisent le même mode que l'exécuteur", () => {
  const first = { lng: 2.3, lat: 48.8 };
  assert.ok(codes(command("create_line", { coordinates: [first], places: ["Paris"] })).includes("LINE_POINTS"));
  assert.ok(codes(command("create_zone", { coordinates: [first, first], places: ["Paris"] })).includes("ZONE_POINTS"));
  assert.ok(codes(command("create_shape", { shapeKind: "circle", bounds: { south: 48, west: 2, north: 49, east: 3 } })).includes("LOCATION_REQUIRED"));
});

test("coordonnées, couleurs et commandes interdites sont rejetées", () => {
  assert.ok(codes(command("create_marker", { label: "Paris", coordinate: { lng: 200, lat: 48 } })).includes("INVALID_COORDINATE"));
  assert.ok(codes(command("create_marker", { label: "Paris", place: "Paris", style: { ...command("create_marker").style, color: "rouge" } })).includes("INVALID_COLOR"));
  assert.ok(codes(command("set_basemap")).includes("COMMAND_UNAVAILABLE"));
  assert.ok(codes(command("create_custom_marker_svg", { label: "Croix", customMarkerSvg: "<svg onload='alert(1)'></svg>" })).includes("INVALID_SVG"));
});

test("les workflows bâtiments et routes gardent leur confirmation humaine", () => {
  const buildings = command("import_buildings", { buildingMode: "dromap", buildingSelectionMode: "named", buildingQueries: ["mairies"] });
  const routes = command("import_routes", { roadCategories: ["motorways"], roadSelectionMode: "all" });
  assert.deepEqual(codes(buildings, routes), []);
  assert.equal(AI_CAPABILITIES.import_buildings.humanConfirmation, true);
  assert.equal(AI_CAPABILITIES.import_routes.humanConfirmation, true);
});

test("sélecteurs groupés et références inconnues", () => {
  assert.ok(codes(command("update_features")).includes("EMPTY_SELECTOR"));
  assert.ok(codes(command("update_features", {
    selector: { ...command("update_features").selector, featureIds: ["introuvable"] },
  })).includes("UNKNOWN_FEATURE"));
  assert.equal(codes(command("update_features", {
    selector: { ...command("update_features").selector, featureIds: ["marqueur-existant"] },
  })).length, 0);
});

test("la légende dépend des objets précédemment créés", () => {
  const marker = command("create_marker", { id: "nouveau", label: "Paris", place: "Paris" });
  const legend = command("configure_feature_legend", { orderRefs: ["nouveau"], section: "Villes" });
  assert.equal(codes(marker, legend).length, 0);
  assert.ok(codes(legend, marker).includes("UNKNOWN_ORDER_REFERENCE"));
  assert.equal(getAiPlanDependents(plan(marker, legend), "nouveau").length, 1);
});

test("une zone manuelle validée ne peut pas être remplacée silencieusement", () => {
  const issues = validateAiPlan(plan(command("set_workspace_by_place", { place: "Paris" })), context, "manual");
  assert.ok(issues.some((issue) => issue.code === "WORKSPACE_LOCKED"));
});

test("réponse simple : aucun plan exigé", () => {
  assert.deepEqual(validateAiPlan(plan(), context, "automatic"), []);
});

test("plan invalide du modèle : une correction est tentée puis revalidée", async () => {
  let calls = 0;
  const result = await repairWithValidation({
    initial: plan(command("create_text", { label: "Océan Atlantique" })),
    inspect: (candidate) => ({ value: candidate, issues: validateAiPlan(candidate, context, "automatic") }),
    repair: async (candidate) => {
      calls += 1;
      return plan({ ...candidate.commands[0], place: "Océan Atlantique" });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.repairs, 1);
  assert.equal(result.issues.length, 0);
});
