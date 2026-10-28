import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(new URL("../editor/dromap-ai-label-policy.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiledModule = { exports: {} };
new Function("module", "exports", compiled)(compiledModule, compiledModule.exports);
const { enforceMapLabelDefaults } = compiledModule.exports;

function markerPlan() {
  return {
    commands: [
      { type: "create_marker_series", mapLabelVisibility: "show", style: { fontSize: 42 } },
      { type: "configure_map_labels", mapLabelScale: 2, allMapLabelsEnabled: true },
    ],
  };
}

test("les marqueurs IA n'affichent aucune étiquette implicite", () => {
  const plan = markerPlan();
  enforceMapLabelDefaults("Place un marqueur sur toutes les capitales de la zone", plan);
  assert.equal(plan.commands[0].mapLabelVisibility, "hide");
  assert.equal(plan.commands[0].style.fontSize, null);
  assert.equal(plan.commands.length, 1);
});

test("une demande explicite montre les noms à la taille habituelle", () => {
  const plan = markerPlan();
  enforceMapLabelDefaults("Affiche toutes les capitales avec leurs noms sur la carte", plan);
  assert.equal(plan.commands[0].mapLabelVisibility, "show");
  assert.equal(plan.commands[0].style.fontSize, null);
  assert.equal(plan.commands.length, 1);
});

test("sans étiquettes l'emporte sur une autre mention de noms", () => {
  const plan = markerPlan();
  enforceMapLabelDefaults("Affiche les noms dans la légende mais sans étiquettes sur la carte", plan);
  assert.equal(plan.commands[0].mapLabelVisibility, "hide");
});
