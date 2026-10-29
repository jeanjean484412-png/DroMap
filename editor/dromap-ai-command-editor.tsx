"use client";

import { useState } from "react";
import { AI_CAPABILITIES, AI_COMMAND_TYPES } from "./dromap-ai-capabilities";
import { AI_COMMAND_FIELD_SCHEMAS } from "./dromap-ai-schema";
import { DROMAP_GEOJSON_CATALOG } from "./geojson-data-catalog";
import { DROMAP_BUILTIN_MARKER_SYMBOLS } from "./marker-symbol";
import type { DroMapAiCommand, DroMapAiCommandType, DroMapAiPlan, DroMapAiProjectContext, DroMapAiWorkspaceMode } from "./dromap-ai-types";

type Schema = Record<string, unknown>;
const LABELS: Record<string, string> = {
  explanation: "Description de l’action", place: "Lieu ou territoire", places: "Lieux dans l’ordre du tracé", coordinate: "Position exacte", coordinates: "Points du tracé", rings: "Contours du polygone", bounds: "Limites géographiques", paddingRatio: "Marge autour du lieu", zoom: "Niveau de zoom", lng: "Longitude", lat: "Latitude", south: "Sud", west: "Ouest", north: "Nord", east: "Est", x: "Position horizontale (0 à 1)", y: "Position verticale (0 à 1)",
  label: "Nom sur la carte", legendLabel: "Libellé de légende", layerRef: "Calque de destination", layerName: "Nom du calque", layerDirection: "Déplacement dans l’ordre", selector: "Objets concernés", featureIds: "Objets précis", labelContains: "Nom contenant", legendLabelContains: "Légende contenant", featureType: "Type d’objet", sourceType: "Origine des objets", all: "Tous les objets", symbolId: "Pictogramme", customMarkerRef: "Marqueur personnalisé", customMarkerSvg: "Dessin SVG du marqueur", style: "Apparence", mapLabelVisibility: "Étiquette sur la carte", lineVariant: "Type de trait", zoneVariant: "Type de zone", shapeKind: "Forme", geometryLocked: "Géométrie verrouillée", locked: "Verrouillé", visible: "Visible", active: "Activé", opacity: "Opacité (0 à 1)",
  color: "Couleur du contour", weight: "Épaisseur du contour", fillColor: "Couleur de remplissage", fillOpacity: "Opacité du remplissage (0 à 1)", dashStyle: "Style du trait", markerSize: "Taille du marqueur", markerFilled: "Marqueur rempli", markerRotation: "Rotation du marqueur", fontSize: "Taille du texte", textRotation: "Rotation du texte", arrowStart: "Flèche au départ", arrowEnd: "Flèche à l’arrivée", freehandSmoothing: "Lissage", zoneStrokeEnabled: "Afficher le contour", zoneFillEnabled: "Afficher le remplissage", zoneHatchingStyle: "Hachures", zoneHatchingColor: "Couleur des hachures", zoneHatchingWeight: "Épaisseur des hachures", zoneHatchingSpacing: "Espacement des hachures", zoneDotsEnabled: "Motif de points", zoneDotsColor: "Couleur des points", zoneDotsRadius: "Rayon des points", zoneDotsSpacing: "Espacement des points", zoneShapeWidth: "Largeur de la forme", zoneShapeHeight: "Hauteur de la forme", zoneShapeRotation: "Rotation de la forme", textBackgroundEnabled: "Fond du texte", textBackgroundColor: "Couleur du fond du texte", textBackgroundOpacity: "Opacité du fond du texte", textBorderEnabled: "Bordure du texte", textBorderColor: "Couleur de bordure du texte", textBorderWidth: "Épaisseur de bordure du texte",
  geoJsonCatalogId: "Jeu de données de la bibliothèque", geoJsonUrl: "Adresse du fichier GeoJSON", geoJsonData: "Données géographiques GeoJSON", geoJsonLayerRef: "Calque de données", geoJsonPrecision: "Précision des géométries", geoJsonStyle: "Apparence des données", geoJsonPropertyName: "Attribut utilisé", geoJsonJoinProperties: "Attributs de correspondance", strokeColor: "Couleur du contour", strokeWeight: "Épaisseur du contour", strokeOpacity: "Opacité du contour", buildingMode: "Format des bâtiments", buildingSelectionMode: "Sélection des bâtiments", buildingQueries: "Bâtiments recherchés", roadCategories: "Niveaux de routes", roadSelectionMode: "Sélection des routes", roadQueries: "Routes recherchées", maxFeatures: "Nombre maximal d’objets",
  seriesItems: "Liste des lieux et valeurs", id: "Référence", value: "Valeur", unit: "Unité", date: "Date des données", category: "Catégorie", sourceTitle: "Nom de la source", sourceUrl: "Adresse de la source", fromPlace: "Lieu de départ", toPlace: "Lieu d’arrivée", fromCoordinate: "Coordonnées de départ", toCoordinate: "Coordonnées d’arrivée", proportionalMethod: "Méthode de proportion", minSize: "Taille minimale", maxSize: "Taille maximale", classes: "Classes de valeurs", choroplethValues: "Valeurs par territoire", min: "Minimum", max: "Maximum", key: "Clé de correspondance",
  legendTitle: "Titre de légende", legendPosition: "Position de la légende", legendMapPosition: "Position libre de légende", legendMapTitlePosition: "Position du titre de légende", exportFormat: "Format de la carte", legendBackgroundColor: "Fond de légende", legendSideWidth: "Largeur de légende", legendBottomHeight: "Hauteur de légende", legendTitleFontSize: "Taille du titre de légende", legendItemFontSize: "Taille du texte de légende", legendSectionTitleFontSize: "Taille des sous-titres", legendSymbolSize: "Taille des figurés de légende", legendItemGap: "Espacement des éléments", legendLabelGap: "Espacement figuré et texte", legendLabelLineHeight: "Interligne", legendSectionGap: "Espacement des sections", legendMapBorderEnabled: "Bordure de légende", legendMapBorderColor: "Couleur de bordure", legendMapBorderWidth: "Épaisseur de bordure", legendMapBorderRadius: "Arrondi de bordure", legendMapPadding: "Marge intérieure", mapTitle: "Titre de la carte", mapTitlePosition: "Position du titre", mapTitleFontSize: "Taille du titre", mapTitleColor: "Couleur du titre", showBasemapLabels: "Écritures du fond", basemapDetailDelta: "Détail du fond", section: "Section de légende", manualLegendEntryId: "Entrée de légende", manualLegendSymbol: "Figuré de légende", legendGroupKey: "Groupe de légende", hidden: "Masqué", orderRefs: "Ordre des objets", scaleStyle: "Style de l’échelle", scalePosition: "Position de l’échelle", scaleMapPosition: "Position libre de l’échelle", northStyle: "Style de la flèche nord", northPosition: "Position du nord", northMapPosition: "Position libre du nord", mapLabelsEnabled: "Étiquettes activées", allMapLabelsEnabled: "Étiquettes des objets", geoJsonMapLabelsEnabled: "Étiquettes des données", mapLabelScale: "Taille des étiquettes (1 = standard)",
};
const VALUES: Record<string, string> = { show: "Afficher", hide: "Masquer", inherit: "Réglage général", up: "Avancer", down: "Reculer", marker: "Marqueur", line: "Trait", zone: "Zone", text: "Texte", straight: "Droit", curved: "Courbe", freehand: "Dessin libre", traced: "Tracé réel", polygon: "Polygone", shape: "Forme", "boundary-fill": "Remplissage de territoire", rectangle: "Rectangle", circle: "Cercle", ellipse: "Ellipse", solid: "Continu", dashed: "Tirets", dotted: "Pointillé", original: "Originale", intermediate: "Intermédiaire", light: "Allégée", all: "Tous", named: "Noms précis", geojson: "Calque de données", dromap: "Objets DroMap", motorways: "Autoroutes", main: "Grands axes", secondary: "Routes secondaires", local: "Routes locales", right: "À droite", left: "À gauche", bottom: "En bas", map: "Sur la carte", none: "Aucun", area: "Aire", diameter: "Diamètre", width: "Largeur", "top-left": "Haut gauche", "top-right": "Haut droite", "bottom-left": "Bas gauche", "bottom-right": "Bas droite", classic: "Classique", simple: "Simple", compass: "Rose des vents", needle: "Aiguille", auto: "Automatique", square: "Carré" };
const inputClass = "w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-teal-500 focus:outline-none";

function defaultValue(schema: Schema): unknown {
  if (Array.isArray(schema.type) && schema.type.includes("null")) return null;
  if (schema.properties) return Object.fromEntries(Object.entries(schema.properties as Record<string, Schema>).map(([key, value]) => [key, defaultValue(value)]));
  if (schema.type === "array") return [];
  return schema.type === "number" ? 0 : schema.type === "boolean" ? false : "";
}

function changeAction(command: DroMapAiCommand, type: DroMapAiCommandType): DroMapAiCommand {
  const allowed = new Set(AI_CAPABILITIES[type].fields);
  const previous = new Set(AI_CAPABILITIES[command.type].fields);
  const next = structuredClone(command) as unknown as Record<string, unknown>;
  for (const key of Object.keys(AI_COMMAND_FIELD_SCHEMAS)) {
    if (allowed.has(key) && previous.has(key)) continue;
    const current = next[key];
    next[key] = Array.isArray(current) ? [] : ["style", "selector", "geoJsonStyle"].includes(key) && current && typeof current === "object"
      ? Object.fromEntries(Object.entries(current).map(([field, value]) => [field, Array.isArray(value) ? [] : typeof value === "boolean" ? false : null]))
      : null;
  }
  next.type = type;
  next.explanation = AI_CAPABILITIES[type].description;
  return next as unknown as DroMapAiCommand;
}

function ValueEditor({ name, schema, value, onChange, choices }: { name: string; schema: Schema; value: unknown; onChange: (value: unknown) => void; choices: Record<string, Array<{ value: string; label: string }>> }) {
  const [page, setPage] = useState(0);
  const label = LABELS[name] ?? name.replace(/([A-Z])/g, " $1");
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (schema.properties) {
    const properties = schema.properties as Record<string, Schema>;
    const current = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return <details className="rounded-md border border-slate-200 bg-white p-2" open={!["style", "geoJsonStyle", "selector"].includes(name)}>
      <summary className="cursor-pointer text-xs font-semibold text-slate-800">{label}</summary>
      {types.includes("null") && value != null && !["style", "selector", "geoJsonStyle"].includes(name) ? <button type="button" className="mt-1 text-[11px] text-teal-800 underline" onClick={() => onChange(null)}>Effacer {label.toLowerCase()}</button> : null}
      <div className="mt-2 space-y-2">{Object.entries(properties).map(([key, child]) => <ValueEditor key={key} name={key} schema={child} value={current[key] ?? null} choices={choices} onChange={(updated) => onChange({ ...Object.fromEntries(Object.entries(properties).map(([field, definition]) => [field, defaultValue(definition)])), ...current, [key]: updated })} />)}</div>
    </details>;
  }
  if (schema.type === "array") {
    const items = Array.isArray(value) ? value : [];
    const itemSchema = schema.items as Schema;
    const start = Math.min(page * 10, Math.max(0, Math.floor((items.length - 1) / 10) * 10));
    return <details className="rounded-md border border-slate-200 bg-white p-2"><summary className="cursor-pointer text-xs font-semibold">{label} ({items.length})</summary>
      <div className="mt-2 space-y-2">{items.slice(start, start + 10).map((item, index) => <div key={start + index} className="flex items-start gap-1"><div className="min-w-0 flex-1"><ValueEditor name={String(start + index + 1)} schema={itemSchema} value={item} choices={choices} onChange={(updated) => onChange(items.map((existing, current) => current === start + index ? updated : existing))} /></div><button type="button" className="px-1 text-red-700" aria-label={`Retirer l’élément ${start + index + 1}`} onClick={() => onChange(items.filter((_, current) => current !== start + index))}>×</button></div>)}
        {items.length > 10 ? <div className="flex justify-between text-xs"><button type="button" disabled={start === 0} onClick={() => setPage(Math.max(0, page - 1))}>Précédents</button><span>{start + 1}–{Math.min(start + 10, items.length)} / {items.length}</span><button type="button" disabled={start + 10 >= items.length} onClick={() => setPage(page + 1)}>Suivants</button></div> : null}
        <button type="button" className="text-xs font-semibold text-teal-800" onClick={() => { onChange([...items, defaultValue(itemSchema)]); setPage(Math.floor(items.length / 10)); }}>+ Ajouter</button>
      </div></details>;
  }
  const options = choices[name] ?? (Array.isArray(schema.enum) ? schema.enum.filter((item) => item !== null).map((item) => ({ value: String(item), label: VALUES[String(item)] ?? String(item) })) : null);
  const nullable = types.includes("null");
  const title = <span className="mb-1 block text-[11px] font-medium text-slate-700">{label}</span>;
  if (types.includes("boolean")) return <label className="block">{title}<select className={inputClass} value={value === null ? "" : String(value)} onChange={(event) => onChange(event.target.value === "" ? null : event.target.value === "true")}><option value="">Automatique</option><option value="true">Oui</option><option value="false">Non</option></select></label>;
  if (options) return <label className="block">{title}<select className={inputClass} value={String(value ?? "")} onChange={(event) => onChange(event.target.value || null)}><option value="">{nullable ? "Automatique / aucun" : "Choisir…"}</option>{value && !options.some((option) => option.value === value) ? <option value={String(value)}>{String(value)}</option> : null}{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  if (types.includes("number")) return <label className="block">{title}<input type="number" step="any" min={schema.minimum as number | undefined} max={schema.maximum as number | undefined} className={inputClass} value={typeof value === "number" ? value : ""} placeholder="Automatique" onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} /></label>;
  const text = typeof value === "object" && value !== null ? JSON.stringify(value, null, 2) : String(value ?? "");
  if (["geoJsonData", "customMarkerSvg", "explanation"].includes(name) || text.length > 160) return <label className="block">{title}<textarea className={inputClass} rows={name === "geoJsonData" ? 8 : 3} value={text} onChange={(event) => onChange(event.target.value || null)} /></label>;
  return <label className="block">{title}<div className="flex gap-1">{/color$/i.test(name) ? <input type="color" aria-label={`Choisir ${label.toLowerCase()}`} value={/^#[a-f0-9]{6}$/i.test(text) ? text : "#111827"} onChange={(event) => onChange(event.target.value)} className="h-8 w-9 shrink-0" /> : null}<input className={inputClass} value={text} placeholder="Automatique" onChange={(event) => onChange(event.target.value || null)} /></div></label>;
}

export function DroMapAiCommandEditor({ command, plan, context, workspaceMode, onSave, onCancel }: { command: DroMapAiCommand; plan: DroMapAiPlan; context: DroMapAiProjectContext; workspaceMode: DroMapAiWorkspaceMode; onSave: (command: DroMapAiCommand) => string | null; onCancel: () => void }) {
  const [draft, setDraft] = useState(() => structuredClone(command));
  const [error, setError] = useState<string | null>(null);
  const index = plan.commands.findIndex((candidate) => candidate.id === command.id);
  const prior = plan.commands.slice(0, index);
  const choices = {
    layerRef: [...context.layers.map((layer) => ({ value: layer.id, label: layer.name })), ...prior.filter((item) => item.type === "create_layer").map((item) => ({ value: item.id, label: item.layerName ?? item.id }))],
    geoJsonLayerRef: [...context.geoJsonLayers.map((layer) => ({ value: layer.id, label: layer.name })), ...prior.filter((item) => ["import_geojson_catalog", "import_geojson_url", "create_geojson_layer", "import_routes", "create_choropleth"].includes(item.type)).map((item) => ({ value: item.id, label: item.layerName ?? item.explanation }))],
    customMarkerRef: [...context.customMarkers.map((marker) => ({ value: marker.id, label: marker.name })), ...prior.filter((item) => item.type === "create_custom_marker_svg").map((item) => ({ value: item.id, label: item.label ?? item.id }))],
    symbolId: DROMAP_BUILTIN_MARKER_SYMBOLS.map((symbol) => ({ value: symbol.id, label: symbol.label })),
    geoJsonCatalogId: DROMAP_GEOJSON_CATALOG.map((entry) => ({ value: entry.id, label: entry.title })),
  };
  function save() {
    const updated = structuredClone(draft);
    if (typeof updated.geoJsonData === "string") {
      try { updated.geoJsonData = JSON.parse(updated.geoJsonData); }
      catch { setError("Les données GeoJSON ne sont pas un JSON valide."); return; }
    }
    setError(onSave(updated));
  }
  return <div className="mt-3 space-y-3 rounded-lg border border-teal-200 bg-teal-50/60 p-3" aria-label="Modifier manuellement cette étape">
    <p className="text-xs font-semibold text-teal-950">Modifier cette étape</p>
    <label className="block"><span className="mb-1 block text-xs font-semibold">Action à exécuter</span><select className={inputClass} value={draft.type} onChange={(event) => { setDraft(changeAction(draft, event.target.value as DroMapAiCommandType)); setError(null); }}>{AI_COMMAND_TYPES.filter((type) => workspaceMode !== "manual" || !["set_workspace_by_place", "set_workspace_bounds", "select_world"].includes(type)).map((type) => <option key={type} value={type}>{AI_CAPABILITIES[type].description}</option>)}</select></label>
    <p className="text-[11px] leading-relaxed text-slate-600">Les champs affichent les paramètres exacts de cette action. Une valeur automatique utilise les réglages habituels de DroMap.</p>
    <ValueEditor name="explanation" schema={{ type: "string" }} value={draft.explanation} choices={choices} onChange={(value) => setDraft({ ...draft, explanation: String(value ?? "") })} />
    {AI_CAPABILITIES[draft.type].fields.map((field) => <ValueEditor key={`${draft.type}:${field}`} name={field} schema={AI_COMMAND_FIELD_SCHEMAS[field]} value={draft[field as keyof DroMapAiCommand]} choices={choices} onChange={(value) => setDraft((current) => ({ ...current, [field]: value }))} />)}
    {error ? <p role="alert" className="text-xs text-red-800">{error}</p> : null}
    <div className="flex justify-end gap-2"><button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs" onClick={onCancel}>Annuler</button><button type="button" className="rounded-md bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white" onClick={save}>Enregistrer l’étape</button></div>
  </div>;
}
