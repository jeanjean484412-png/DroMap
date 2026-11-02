import assert from "node:assert/strict";
import test from "node:test";
import { loadSource } from "../security/load-source.mjs";

const labels = loadSource("editor/dromap-ai-label-policy.ts");
const bulk = loadSource("lib/dromap/server/ai-bulk-geodata.ts");
const repair = loadSource("editor/dromap-ai-repair.ts");
const validator = loadSource("editor/dromap-ai-validator.ts");

test("N05: les cercles autour de chaque gare ne déclenchent pas une recherche exhaustive", () => {
  assert.equal(bulk.parseBulkPlaceRequest("Carte des terminus parisiens : gare du Nord et gare de Lyon. Ajoute autour de chaque gare un cercle de 500 mètres."), null);
});
test("N07 et N19: crée et communes empruntent les données structurées", () => {
  assert.equal(bulk.parseBulkPlaceRequest("Crée une carte de toutes les capitales nationales de l’Europe dans la zone de travail").kind, "capitals");
  assert.equal(bulk.parseBulkPlaceRequest("Affiche toutes les communes de Bretagne de plus de 50 000 habitants").kind, "cities");
});
test("N06 N08 N10: noms normaux des points sans étiquettes sur les surfaces", () => {
  for (const prompt of ["Place leurs capitales avec leurs noms à taille normale", "Ajoute Rennes et Nantes avec noms à taille normale", "Affiche seulement les noms des villes à taille normale"]) {
    const plan = { commands: [{ type: "create_marker", style: {fontSize: 72} }, {type: "fill_boundary", style: {fontSize: 72}}] };
    labels.enforceMapLabelDefaults(prompt, plan);
    assert.equal(plan.commands[0].mapLabelVisibility, "show");
    assert.equal(plan.commands[0].style.fontSize, null);
    assert.equal(plan.commands[1].mapLabelVisibility, "hide");
  }
});
test("une réparation partielle conserve le siège, les flux et le titre", () => {
  const original = {summary: "Notre réseau international", commands: [{id:"hq",type:"create_marker"},{id:"offices",type:"create_marker_series"},{id:"flows",type:"create_line"},{id:"title",mapTitle:"Notre réseau international"}]};
  const revision = {summary: "Correction technique", commands:[{id:"offices",type:"create_marker_series",seriesItems:[{coordinate:{lat:1,lng:2}}]}]};
  const result = repair.preservePlanRepair(original,revision,["offices"]);
  assert.deepEqual(result.commands.map(c=>c.id),["hq","offices","flows","title"]);
  assert.equal(result.summary,original.summary);
  assert.equal(result.commands[3].mapTitle,"Notre réseau international");
});
test("une réparation qui omet une étape invalide ne la supprime pas", () => {
  const original={commands:[{id:"bad",type:"create_line"}]};
  assert.deepEqual(repair.preservePlanRepair(original,{commands:[]},["bad"]),original);
});
test("les remplissages et flèches explicitement demandés sont contrôlés", () => {
  assert.ok(validator.validateAiPlanRequest("Colorie les six États fondateurs en bleu", {commands:[{type:"create_marker_series"}]}).length);
  assert.ok(validator.validateAiPlanRequest("Relie les bureaux avec des flèches courbes", {commands:[{type:"create_marker_series"}]}).length);
  assert.equal(validator.validateAiPlanRequest("Relie les bureaux avec des flèches courbes", {commands:[{type:"create_line"}]}).length,0);
});
test("R09: les îlots sont interrogés ensemble et les lieux filtrés par leur contour", async () => {
  const ring = x => [[[x,41],[x+.04,41],[x+.04,41.1],[x,41.1],[x,41]]];
  let queries=0;
  const engine=loadSource("lib/dromap/server/ai-bulk-geodata.ts",{
    "./public-url":{readPublicUrl:async()=>JSON.stringify({features:[]})},
    "./land-boundaries":{resolveLandBoundary:async()=>({label:"Corse",datasetId:"france-regions-detailed",properties:{},geometry:{type:"MultiPolygon",coordinates:[0,1,2,3,4,5].map(x=>ring(8+x*.1))},source:{sourceLabel:"IGN",sourceUrl:"https://example.org"}})},
    "./overpass":{queryOverpass:async()=>{queries++;return {elements:[{type:"node",id:1,lat:41.05,lon:8.02,tags:{name:"Dedans"}},{type:"node",id:2,lat:41.05,lon:8.07,tags:{name:"Dehors"}}]};}}
  });
  const result=await engine.resolveBulkPlaces(engine.parseBulkPlaceRequest("Affiche toutes les usines de la région Corse"),null);
  assert.equal(queries,1); assert.deepEqual(result.items.map(x=>x.label),["Dedans"]);
});
test("Overpass: découpage, dédoublonnage et rejet des résultats partiels", async t => {
  const {queryOverpass}=loadSource("lib/dromap/server/overpass.ts");
  let failTile=false;
  t.mock.method(globalThis,"fetch",async(url,options)=>{
    const q=options.body.get("data");
    if(q.includes("(0,0,2,2)") || (failTile && q.includes("(1,1,2,2)"))) return new Response("",{status:502});
    return Response.json({elements:[{type:"node",id:1,lat:.5,lon:.5}]});
  });
  assert.equal((await queryOverpass("[out:json];node(0,0,2,2);out;")).elements.length,1);
  failTile=true;
  await assert.rejects(queryOverpass("[out:json];node(0,0,2,2);out;"),/OpenStreetMap/);
});
