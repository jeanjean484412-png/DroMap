import { AI_CAPABILITIES } from "./dromap-ai-capabilities";
import type { DroMapAiCommand, DroMapAiPlan, DroMapAiProjectContext, DroMapAiWorkspaceMode } from "./dromap-ai-types";

export type AiPlanIssue = {
  commandId: string;
  index: number;
  code: string;
  detail: string;
  question: string;
};

const HEX = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;
const validCoordinate = (value: { lng: number; lat: number }) =>
  Number.isFinite(value.lng) && Number.isFinite(value.lat) &&
  value.lng >= -180 && value.lng <= 180 && value.lat >= -90 && value.lat <= 90;
const WORKSPACE_TYPES = new Set(["set_workspace_by_place", "set_workspace_bounds", "select_world"]);
const FEATURE_CREATION_TYPES = new Set([
  "create_marker", "create_text", "create_line", "create_zone", "create_shape",
  "fill_boundary", "create_proportional_markers", "create_proportional_flows",
]);

export function getAiPlanDependents(plan: DroMapAiPlan, commandId: string) {
  const index = plan.commands.findIndex((command) => command.id === commandId);
  if (index < 0) return [];
  return plan.commands.slice(index + 1).filter((candidate) =>
    candidate.layerRef === commandId ||
    candidate.geoJsonLayerRef === commandId ||
    candidate.customMarkerRef === commandId ||
    candidate.orderRefs.includes(commandId) ||
    candidate.selector.featureIds.includes(commandId),
  );
}

function hasSelector(command: DroMapAiCommand) {
  const selector = command.selector;
  return selector.all || selector.featureIds.length > 0 || Boolean(
    selector.labelContains || selector.legendLabelContains || selector.layerName ||
    selector.featureType || selector.sourceType,
  );
}

function isPresent(value: unknown) {
  return value !== null && value !== undefined && value !== "" &&
    (!Array.isArray(value) || value.length > 0);
}

export function validateAiPlan(
  plan: DroMapAiPlan,
  context: DroMapAiProjectContext,
  workspaceMode: DroMapAiWorkspaceMode,
): AiPlanIssue[] {
  const issues: AiPlanIssue[] = [];
  const seen = new Set<string>();
  const features = new Set(context.features.map((feature) => feature.id));
  const layers = new Set(context.layers.flatMap((layer) => [layer.id, layer.name]));
  const geoJsonLayers = new Set(context.geoJsonLayers.flatMap((layer) => [layer.id, layer.name]));
  const markers = new Set(context.customMarkers.flatMap((marker) => [marker.id, marker.name]));
  const add = (command: DroMapAiCommand, index: number, code: string, detail: string, question: string) => {
    issues.push({ commandId: command.id, index, code, detail, question });
  };

  for (const [index, command] of plan.commands.entries()) {
    const priorIds = new Set(seen);
    const capability = AI_CAPABILITIES[command.type];
    if (!capability?.exposed) {
      add(command, index, "COMMAND_UNAVAILABLE", `Commande indisponible : ${command.type}.`, "Je ne peux pas réaliser cette action automatiquement. Souhaites-tu une autre approche ?");
      continue;
    }
    if (!command.id || seen.has(command.id)) {
      add(command, index, "DUPLICATE_ID", `Identifiant manquant ou répété : ${command.id}.`, "Je dois réorganiser les étapes de cette demande. Peux-tu réessayer ?");
    }
    seen.add(command.id);
    for (const field of capability.required) {
      if (!isPresent(command[field as keyof DroMapAiCommand])) {
        add(command, index, "REQUIRED_FIELD", `Paramètre ${field} manquant pour ${command.type}.`, "Il me manque une précision pour cette action. Peux-tu indiquer le lieu ou l'objet concerné ?");
      }
    }
    if (workspaceMode === "manual" && WORKSPACE_TYPES.has(command.type)) {
      add(command, index, "WORKSPACE_LOCKED", "La zone manuelle appartient à l'utilisateur.", "La zone de travail est déjà définie. Souhaites-tu simplement recadrer la vue ?");
    }

    const hasLocation = Boolean(command.place || command.coordinate);
    if (["create_marker", "create_text", "fill_boundary"].includes(command.type) && !hasLocation) {
      add(command, index, "LOCATION_REQUIRED", "Lieu ou coordonnées manquants.", command.type === "create_text" ? "Où souhaites-tu placer ce texte ?" : "À quel endroit souhaites-tu placer cet élément ?");
    }
    if (command.type === "create_shape" && !hasLocation) {
      add(command, index, "LOCATION_REQUIRED", "Forme sans lieu ou centre ; l'exécuteur doit pouvoir résoudre un point.", "Où souhaites-tu placer cette forme ?");
    }
    if (command.type === "create_line" && command.coordinates.length < 2 && command.places.length < 2) {
      add(command, index, "LINE_POINTS", "Le trait a moins de deux points.", "Entre quels lieux le trait doit-il passer ?");
    }
    if (command.type === "create_zone" && (command.rings[0]?.length ?? 0) < 3 && command.coordinates.length < 3 && command.places.length < 3) {
      add(command, index, "ZONE_POINTS", "La zone ne possède pas trois sommets.", "Quelle zone souhaites-tu représenter précisément ? Je peux utiliser une frontière existante si elle est disponible.");
    }
    const coordinates = [
      ...(command.coordinate ? [command.coordinate] : []),
      ...command.coordinates,
      ...command.rings.flat(),
      ...command.seriesItems.flatMap((item) => [item.coordinate, item.fromCoordinate, item.toCoordinate].filter((point): point is NonNullable<typeof point> => point != null)),
    ];
    if (coordinates.some((point) => !validCoordinate(point))) {
      add(command, index, "INVALID_COORDINATE", "Longitude ou latitude hors limites.", "Je n'arrive pas à situer précisément un des lieux. Peux-tu le préciser ?");
    }
    if (command.bounds && (!validCoordinate({ lng: command.bounds.west, lat: command.bounds.south }) ||
      !validCoordinate({ lng: command.bounds.east, lat: command.bounds.north }) ||
      command.bounds.south >= command.bounds.north || command.bounds.west >= command.bounds.east)) {
      add(command, index, "INVALID_BOUNDS", "Limites géographiques invalides.", "Peux-tu préciser la zone à afficher ?");
    }
    if (command.type === "delete_custom_marker" && !command.customMarkerRef && !command.label) {
      add(command, index, "MARKER_REFERENCE", "Marqueur personnalisé non identifié.", "Quel marqueur personnalisé souhaites-tu supprimer ?");
    }
    if (command.type === "create_choropleth" && !command.geoJsonCatalogId && !command.geoJsonUrl && !command.geoJsonData) {
      add(command, index, "DATA_SOURCE", "Choroplèthe sans source géographique.", "Quel découpage géographique souhaites-tu utiliser ?");
    }
    if (command.type === "create_proportional_markers" && command.seriesItems.some((item) => !item.place && !item.coordinate)) {
      add(command, index, "SERIES_LOCATION", "Figuré proportionnel sans lieu.", "Pour quelles localités dois-je placer ces valeurs ?");
    }
    if (command.type === "create_proportional_flows" && command.seriesItems.some((item) =>
      (!item.fromPlace && !item.fromCoordinate) || (!item.toPlace && !item.toCoordinate)
    )) {
      add(command, index, "FLOW_ENDPOINT", "Flux sans départ ou arrivée.", "Quels sont les points de départ et d'arrivée des flux ?");
    }
    if (["update_features", "duplicate_features", "reorder_features", "delete_features"].includes(command.type) && !hasSelector(command)) {
      add(command, index, "EMPTY_SELECTOR", "Sélection d'objets vide.", "Quels objets souhaites-tu modifier ?");
    }
    if (command.type === "configure_feature_legend" && !hasSelector(command) && !command.orderRefs.length) {
      add(command, index, "LEGEND_TARGET", "Entrée automatique de légende non identifiée.", "Quels éléments veux-tu organiser dans la légende ?");
    }
    if (command.selector.featureIds.some((id) => !features.has(id))) {
      add(command, index, "UNKNOWN_FEATURE", `Référence d'objet absente : ${command.selector.featureIds.filter((id) => !features.has(id)).join(", ")}.`, "Je ne retrouve pas certains objets sur la carte. Peux-tu les sélectionner ?");
    }
    if (command.orderRefs.some((ref) => !features.has(ref) && !priorIds.has(ref))) {
      add(command, index, "UNKNOWN_ORDER_REFERENCE", `Référence de légende absente : ${command.orderRefs.filter((ref) => !features.has(ref) && !priorIds.has(ref)).join(", ")}.`, "Je ne retrouve pas tous les éléments à placer dans la légende. Peux-tu préciser lesquels ?");
    }
    if (command.layerRef && !layers.has(command.layerRef) && !priorIds.has(command.layerRef)) {
      add(command, index, "UNKNOWN_LAYER", `Calque absent : ${command.layerRef}.`, "Quel calque souhaites-tu utiliser ?");
    }
    if (command.geoJsonLayerRef && !geoJsonLayers.has(command.geoJsonLayerRef) && !priorIds.has(command.geoJsonLayerRef)) {
      add(command, index, "UNKNOWN_GEOJSON_LAYER", `Calque GeoJSON absent : ${command.geoJsonLayerRef}.`, "Quel calque GeoJSON souhaites-tu utiliser ?");
    }
    if (command.customMarkerRef && !markers.has(command.customMarkerRef) && !priorIds.has(command.customMarkerRef)) {
      add(command, index, "UNKNOWN_CUSTOM_MARKER", `Marqueur personnalisé absent : ${command.customMarkerRef}.`, "Quel marqueur personnalisé souhaites-tu utiliser ?");
    }
    if (command.type === "import_geojson_url" && command.geoJsonUrl && !/^https:\/\//i.test(command.geoJsonUrl)) {
      add(command, index, "INSECURE_URL", "L'import GeoJSON exige une URL HTTPS.", "Peux-tu fournir une adresse HTTPS pour ce GeoJSON ?");
    }
    for (const [field, value] of Object.entries({
      color: command.style.color, fillColor: command.style.fillColor,
      zoneHatchingColor: command.style.zoneHatchingColor,
      zoneDotsColor: command.style.zoneDotsColor,
      textBackgroundColor: command.style.textBackgroundColor,
      textBorderColor: command.style.textBorderColor,
      mapTitleColor: command.mapTitleColor,
      legendBackgroundColor: command.legendBackgroundColor,
    })) {
      if (value && !HEX.test(value)) add(command, index, "INVALID_COLOR", `Couleur invalide dans ${field} : ${value}.`, "Quelle couleur souhaites-tu utiliser ?");
    }
    if (command.type === "create_custom_marker_svg" && command.customMarkerSvg && (
      !/<svg[\s>]/i.test(command.customMarkerSvg) ||
      /<(?:script|iframe|object|embed|foreignObject)[\s>]/i.test(command.customMarkerSvg) ||
      /on\w+\s*=/i.test(command.customMarkerSvg) ||
      /(?:href|src)\s*=\s*["']\s*(?:https?:|javascript:|data:text\/html)/i.test(command.customMarkerSvg)
    )) {
      add(command, index, "INVALID_SVG", "Le marqueur SVG contient un élément invalide ou actif.", "Peux-tu décrire le symbole à créer ?");
    }
    if (FEATURE_CREATION_TYPES.has(command.type)) features.add(command.id);
    if (command.type === "create_layer") layers.add(command.id);
    if (["import_geojson_catalog", "import_geojson_url", "create_geojson_layer", "import_routes", "create_choropleth"].includes(command.type)) geoJsonLayers.add(command.id);
    if (command.type === "create_custom_marker_svg") markers.add(command.id);
  }
  return issues;
}
