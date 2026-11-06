import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { compileFunction } from "node:vm";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
function loadComponent(relativePath, mocks) {
  const filename = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  compileFunction(code, ["require", "module", "exports"], { filename })(
    name => Object.hasOwn(mocks, name) ? mocks[name] : nativeRequire(name), loaded, loaded.exports,
  );
  return loaded.exports;
}

function setupDom(t) {
  const dom = new JSDOM('<div id="root"></div><div id="map"></div>', { url: "http://localhost" });
  const saved = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  dom.window.requestAnimationFrame = () => 1;
  dom.window.cancelAnimationFrame = () => {};
  const { createRoot } = nativeRequire("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("root"));
  t.after(async () => {
    await act(() => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return { root, document: dom.window.document, window: dom.window };
}

test("inspecteur : le changement mobile appelle le dernier callback et une sélection rouvre le panneau", async t => {
  const { root, document, window } = setupDom(t);
  let onMediaChange;
  window.matchMedia = () => ({ matches: false, addEventListener: (_name, callback) => { onMediaChange = callback; }, removeEventListener: () => {} });
  const selection = { selectedFeatureIds: [], selectedFeatureId: null, selectedFromObjectsPanel: false, mapSelectionRequestId: 0 };
  const { DromapEditorInspector } = loadComponent("components/dromap-product/editor-inspector.tsx", {
    "@/editor/legend-panel": { LegendPanel: () => null },
    "@/stores/editor-features": { useEditorFeaturesStore: selector => selector({ features: [] }) },
    "@/stores/editor-selection": { useEditorSelectionStore: selector => selector(selection) },
  });
  const calls = [];
  await act(() => root.render(createElement(DromapEditorInspector, { onCollapsedChange: value => calls.push(["old", value]) })));
  await act(() => root.render(createElement(DromapEditorInspector, { onCollapsedChange: value => calls.push(["current", value]) })));
  await act(() => onMediaChange({ matches: true }));
  assert.equal(document.querySelector("aside").dataset.collapsed, "true");
  assert.deepEqual(calls, [["current", true]]);
  selection.selectedFeatureId = "marker";
  selection.mapSelectionRequestId = 1;
  await act(() => root.render(createElement(DromapEditorInspector, { onCollapsedChange: value => calls.push(["current", value]) })));
  assert.equal(document.querySelector("aside").dataset.collapsed, "false");
  assert.deepEqual(calls.at(-1), ["current", false]);
});

test("texte : le brouillon survit aux changements de style et suit la carte sans perdre son édition", async t => {
  const { root, document } = setupDom(t);
  let feature = { id: "text-1", geometry: { type: "Point", coordinates: [2, 48] }, properties: { type: "text", label: "Mon brouillon", style: {} } };
  let point = { x: 100, y: 200 };
  let refreshMap;
  const map = { on: (_events, callback) => { refreshMap = callback; }, off: () => {}, getZoom: () => 10, latLngToContainerPoint: () => point, getContainer: () => document.getElementById("map") };
  const textRendering = {
    getTextBackgroundEnabled: () => false, getTextBorderEnabled: () => false,
    getTextFeatureReferenceZoom: () => 10, getTextMapZoomScale: () => 1,
    getTextFeatureFontSize: () => 20, getTextFeatureRotation: () => 0,
    getTextFeatureBold: () => false, getTextFeatureItalic: () => false,
    measureTextBlock: () => ({ width: 150, height: 40, fontSize: 20, lineHeight: 24 }),
  };
  const { SelectedTextInlineEditor } = loadComponent("editor/selected-text-inline-editor.tsx", {
    "react-leaflet": { useMap: () => map },
    "@/stores/editor-features": { useEditorFeaturesStore: selector => selector({ features: [feature], updateFeatureWithHistory: () => {} }) },
    "@/stores/editor-layers": { useEditorLayersStore: selector => selector({ layers: [] }), isFeatureLayerVisible: () => true, isFeatureEffectivelyLocked: () => false },
    "@/stores/editor-text-edit": { useEditorTextEditStore: selector => selector({ editingTextFeatureId: feature.id, stopEditingTextFeature: () => {} }) },
    "./text-rendering": textRendering,
  });
  await act(() => root.render(createElement(SelectedTextInlineEditor)));
  assert.equal(document.querySelector("textarea").value, "Mon brouillon");
  feature = { ...feature, properties: { ...feature.properties, label: "Autre valeur du store", style: { color: "red" } } };
  await act(() => root.render(createElement(SelectedTextInlineEditor)));
  assert.equal(document.querySelector("textarea").value, "Mon brouillon", "une actualisation du même objet ne doit pas réinitialiser la saisie");
  point = { x: 300, y: 400 };
  await act(() => refreshMap());
  assert.equal(document.querySelector("textarea").style.left, "300px");
  assert.equal(document.querySelector("textarea").value, "Mon brouillon");
  feature = { ...feature, id: "text-2", properties: { ...feature.properties, label: "Nouveau texte" } };
  await act(() => root.render(createElement(SelectedTextInlineEditor)));
  assert.equal(document.querySelector("textarea").value, "Nouveau texte");
});

for (const kind of ["building", "route"]) {
  test(`${kind} : une présélection identique ne réinitialise pas les choix manuels`, async t => {
    const { root, document } = setupDom(t);
    const componentName = kind === "building" ? "BuildingSelectionModal" : "RouteSelectionModal";
    const loaded = loadComponent(`editor/${kind}-selection-modal.tsx`, {
      leaflet: {}, "leaflet/dist/leaflet.css": {},
      "react-leaflet": { MapContainer: () => null, Rectangle: () => null, TileLayer: () => null },
      "@/lib/dromap/road-import": { getDromapRoadImportCategoryLabel: () => "Route" },
    });
    const geometry = kind === "building"
      ? { type: "Polygon", coordinates: [[[2, 48], [3, 48], [3, 49], [2, 48]]] }
      : { type: "LineString", coordinates: [[2, 48], [3, 49]] };
    const features = ["a", "b"].map(id => ({ id, type: "Feature", geometry, properties: { name: id } }));
    let confirmed;
    const props = { features, bounds: { south: 47, west: 1, north: 50, east: 4 }, allowEmptyConfirm: true, onCancel: () => {}, onConfirm: value => { confirmed = value; } };
    const render = ids => root.render(createElement(loaded[componentName], { ...props, initialSelectedIds: ids }));
    const clearButton = () => [...document.querySelectorAll("button")].find(button => button.textContent.trim() === "Tout désélectionner");
    await act(() => render(["a"]));
    assert.equal(clearButton().disabled, false);
    await act(() => clearButton().click());
    await act(() => render(["a"]));
    assert.equal(clearButton().disabled, true, "un nouveau tableau avec les mêmes IDs ne doit pas effacer le choix manuel");
    await act(() => render(["b"]));
    assert.equal(clearButton().disabled, false, "une nouvelle présélection doit être prise en compte");
    const buttons = document.querySelectorAll("footer button");
    await act(() => buttons[buttons.length - 1].click());
    assert.deepEqual(confirmed.map(feature => feature.id), ["b"]);
  });
}
