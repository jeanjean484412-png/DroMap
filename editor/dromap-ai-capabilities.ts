import type { DroMapAiCommandType } from "./dromap-ai-types";

export type AiCapability = {
  description: string;
  fields: readonly string[];
  required: readonly string[];
  objects: readonly string[];
  humanConfirmation: boolean;
  dependsOnPriorObject: boolean;
  groupable: boolean;
  projectState: string;
  constraints: string;
  exposed: boolean;
};

function capability(
  description: string,
  fields = "",
  required = "",
  options: Partial<Omit<AiCapability, "description" | "fields" | "required">> = {},
): AiCapability {
  return {
    description,
    fields: fields.split(" ").filter(Boolean),
    required: required.split(" ").filter(Boolean),
    objects: options.objects ?? [],
    humanConfirmation: options.humanConfirmation ?? false,
    dependsOnPriorObject: options.dependsOnPriorObject ?? false,
    groupable: options.groupable ?? false,
    projectState: options.projectState ?? "Projet courant",
    constraints: options.constraints ?? "",
    exposed: options.exposed ?? true,
  };
}

// Source unique des commandes proposées au modèle et acceptées par le validateur.
// set_basemap reste réservé à la lecture des anciens plans, jamais à la génération.
export const AI_CAPABILITIES = {
  set_workspace_by_place: capability("Définir la zone autour d'un lieu", "place paddingRatio", "place", { projectState: "Mode automatique" }),
  set_workspace_bounds: capability("Définir la zone par ses limites", "bounds", "bounds", { projectState: "Mode automatique" }),
  select_world: capability("Sélectionner le monde entier", "", "", { projectState: "Mode automatique" }),
  fit_view: capability("Recadrer la vue sans changer la zone", "bounds coordinate selector zoom"),
  set_basemap: capability("Ancien changement de fond", "basemapId", "basemapId", { exposed: false, constraints: "Le fond n'est jamais modifié par l'IA." }),
  set_country_neighbors: capability("Afficher ou masquer les voisins d'un pays", "active"),
  create_layer: capability("Créer un calque DroMap", "layerName", "layerName", { objects: ["layer"] }),
  set_active_layer: capability("Activer un calque", "layerRef", "layerRef", { objects: ["layer"], dependsOnPriorObject: true }),
  configure_layer: capability("Modifier le nom, la visibilité, l'opacité ou le verrou d'un calque", "layerRef layerName visible opacity locked active", "layerRef", { objects: ["layer"], dependsOnPriorObject: true }),
  reorder_layer: capability("Avancer ou reculer un calque", "layerRef layerDirection", "layerRef layerDirection", { objects: ["layer"], dependsOnPriorObject: true }),
  delete_layer: capability("Supprimer un calque", "layerRef", "layerRef", { objects: ["layer"], dependsOnPriorObject: true }),
  import_geojson_catalog: capability("Importer un jeu GeoJSON du catalogue", "geoJsonCatalogId layerName geoJsonPrecision", "geoJsonCatalogId", { objects: ["geojson"] }),
  import_geojson_url: capability("Importer un GeoJSON depuis une URL HTTPS", "geoJsonUrl layerName geoJsonPrecision", "geoJsonUrl", { objects: ["geojson"] }),
  create_geojson_layer: capability("Créer un calque GeoJSON avec des données fournies", "geoJsonData layerName geoJsonPrecision", "geoJsonData", { objects: ["geojson"] }),
  configure_geojson_layer: capability("Styliser et régler un calque GeoJSON", "geoJsonLayerRef layerName visible opacity locked geoJsonPrecision geoJsonStyle", "geoJsonLayerRef", { objects: ["geojson"], dependsOnPriorObject: true }),
  reorder_geojson_layer: capability("Changer l'ordre d'un calque GeoJSON", "geoJsonLayerRef layerDirection", "geoJsonLayerRef layerDirection", { objects: ["geojson"], dependsOnPriorObject: true }),
  delete_geojson_layer: capability("Supprimer un calque GeoJSON", "geoJsonLayerRef", "geoJsonLayerRef", { objects: ["geojson"], dependsOnPriorObject: true }),
  convert_geojson_to_dromap: capability("Convertir un calque GeoJSON en objets DroMap", "geoJsonLayerRef layerName", "geoJsonLayerRef", { objects: ["geojson", "feature"], dependsOnPriorObject: true }),
  convert_dromap_to_geojson: capability("Reconvertir un calque issu d'un GeoJSON", "layerRef", "layerRef", { objects: ["layer", "geojson"], dependsOnPriorObject: true }),
  import_buildings: capability("Préparer la sélection humaine de bâtiments réels", "buildingMode buildingSelectionMode buildingQueries place bounds layerName maxFeatures", "buildingMode buildingSelectionMode", { objects: ["building"], humanConfirmation: true, constraints: "Première phase dédiée au sélecteur Bâtiments." }),
  import_routes: capability("Préparer la sélection humaine de routes réelles", "roadCategories roadSelectionMode roadQueries place bounds layerName", "roadCategories roadSelectionMode", { objects: ["road"], humanConfirmation: true, constraints: "Première phase dédiée au sélecteur Routes." }),
  create_custom_marker_svg: capability("Créer et enregistrer un marqueur SVG personnalisé", "label customMarkerSvg", "label customMarkerSvg", { objects: ["custom-marker"] }),
  delete_custom_marker: capability("Supprimer un marqueur personnalisé", "customMarkerRef label", "", { objects: ["custom-marker"], dependsOnPriorObject: true }),
  create_marker: capability("Placer un marqueur sur la carte", "place coordinate label legendLabel layerRef symbolId customMarkerRef style mapLabelVisibility", "label", { objects: ["feature", "marker"] }),
  create_text: capability("Placer un texte cartographique", "place coordinate label layerRef style", "label", { objects: ["feature", "text"] }),
  create_line: capability("Tracer une ligne, une flèche ou un trait courbe", "coordinates places label legendLabel layerRef lineVariant style", "", { objects: ["feature", "line"] }),
  create_zone: capability("Dessiner une zone ou un polygone", "rings coordinates places label legendLabel layerRef zoneVariant style", "", { objects: ["feature", "zone"] }),
  create_shape: capability("Ajouter un rectangle, cercle ou ellipse", "place coordinate shapeKind bounds label layerRef style", "shapeKind", { objects: ["feature", "zone"] }),
  fill_boundary: capability("Remplir un territoire à partir de sa vraie frontière", "place coordinate label legendLabel layerRef style", "", { objects: ["feature", "zone"] }),
  create_proportional_markers: capability("Créer des figurés proportionnels", "seriesItems proportionalMethod minSize maxSize symbolId layerRef style mapLabelVisibility legendTitle section", "seriesItems", { objects: ["feature", "marker"], groupable: true }),
  create_proportional_flows: capability("Créer des flux proportionnels", "seriesItems proportionalMethod minSize maxSize layerRef style legendTitle section", "seriesItems", { objects: ["feature", "line"], groupable: true }),
  create_choropleth: capability("Créer une carte choroplèthe liée à un GeoJSON", "geoJsonCatalogId geoJsonUrl geoJsonData geoJsonJoinProperties choroplethValues classes layerName geoJsonStyle legendTitle section", "geoJsonJoinProperties choroplethValues classes", { objects: ["geojson", "legend"] }),
  update_features: capability("Modifier un ou plusieurs objets", "selector label legendLabel symbolId customMarkerRef style mapLabelVisibility locked geometryLocked", "selector", { objects: ["feature"], groupable: true, dependsOnPriorObject: true }),
  duplicate_features: capability("Dupliquer un ou plusieurs objets", "selector", "selector", { objects: ["feature"], groupable: true, dependsOnPriorObject: true }),
  reorder_features: capability("Changer l'ordre d'un ou plusieurs objets", "selector layerDirection", "selector layerDirection", { objects: ["feature"], groupable: true, dependsOnPriorObject: true }),
  delete_features: capability("Supprimer un ou plusieurs objets", "selector", "selector", { objects: ["feature"], groupable: true, dependsOnPriorObject: true }),
  configure_legend: capability("Régler titre, position, format et apparence de la légende", "legendTitle legendPosition legendMapPosition legendMapTitlePosition exportFormat legendBackgroundColor legendSideWidth legendBottomHeight legendTitleFontSize legendItemFontSize legendSectionTitleFontSize legendSymbolSize legendItemGap legendLabelGap legendLabelLineHeight legendSectionGap legendMapBorderEnabled legendMapBorderColor legendMapBorderWidth legendMapBorderRadius legendMapPadding", "", { objects: ["legend"] }),
  configure_map_title: capability("Régler le titre de la carte", "mapTitle mapTitlePosition mapTitleFontSize mapTitleColor", "", { objects: ["title"] }),
  align_legend_sizes_with_map: capability("Aligner les tailles des figurés de légende avec la carte", "", "", { objects: ["legend"] }),
  configure_basemap_render: capability("Régler les écritures et le détail du fond dans le rendu", "showBasemapLabels basemapDetailDelta", "", { objects: ["render"], constraints: "Ne change pas le fond choisi." }),
  add_manual_legend_entry: capability("Ajouter une clé de lecture sans objet sur la carte", "label section manualLegendSymbol symbolId style", "label", { objects: ["legend"] }),
  update_manual_legend_entry: capability("Modifier une entrée manuelle de légende", "manualLegendEntryId label section manualLegendSymbol symbolId style", "manualLegendEntryId", { objects: ["legend"], dependsOnPriorObject: true }),
  delete_manual_legend_entry: capability("Supprimer une entrée manuelle de légende", "manualLegendEntryId", "manualLegendEntryId", { objects: ["legend"], dependsOnPriorObject: true }),
  configure_legend_group: capability("Régler une section de légende existante", "legendGroupKey label section hidden orderRefs", "legendGroupKey", { objects: ["legend"], dependsOnPriorObject: true }),
  configure_feature_legend: capability("Organiser les vrais objets dans la légende", "orderRefs selector label section hidden", "", { objects: ["feature", "legend"], groupable: true, dependsOnPriorObject: true }),
  configure_scale: capability("Afficher et placer l'échelle", "active scaleStyle scalePosition scaleMapPosition", "", { objects: ["scale"] }),
  configure_north_arrow: capability("Afficher et placer la flèche du nord", "active northStyle northPosition northMapPosition", "", { objects: ["north"] }),
  configure_map_labels: capability("Afficher les étiquettes de la carte", "allMapLabelsEnabled geoJsonMapLabelsEnabled mapLabelScale", "", { objects: ["feature", "geojson"], groupable: true }),
  select_feature: capability("Sélectionner un objet ou un groupe d'objets", "selector layerRef", "", { objects: ["feature"], groupable: true, dependsOnPriorObject: true }),
  clear_selection: capability("Effacer la sélection", ""),
  open_export_preview: capability("Ouvrir l'aperçu de rendu", "", "", { objects: ["render"] }),
} satisfies Record<DroMapAiCommandType, AiCapability>;

export const AI_COMMAND_TYPES = Object.keys(AI_CAPABILITIES).filter(
  (type) => AI_CAPABILITIES[type as DroMapAiCommandType].exposed,
) as DroMapAiCommandType[];

export function describeAiCapabilities() {
  return AI_COMMAND_TYPES.map((type) => {
    const entry = AI_CAPABILITIES[type];
    const fields = entry.fields.length ? ` ; paramètres : ${entry.fields.join(", ")}` : "";
    return `- ${type} : ${entry.description}${fields}. ${entry.constraints}`;
  }).join("\n");
}
