import { NextRequest, NextResponse } from "next/server";

import type {
  DroMapAiApiRequest,
  DroMapAiApiResponse,
  DroMapAiBounds,
  DroMapAiChoroplethClass,
  DroMapAiChoroplethValue,
  DroMapAiCommand,
  DroMapAiCommandType,
  DroMapAiCoordinate,
  DroMapAiFact,
  DroMapAiFeatureSelector,
  DroMapAiPlan,
  DroMapAiSeriesItem,
  DroMapAiSource,
  DroMapAiStylePatch,
} from "@/app/editor/test/dromap-ai-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GENERATE_CONTENT_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.5-flash";
const DEFAULT_FALLBACK_MODEL = "gemini-3.1-flash-lite";
const REQUEST_TIMEOUT_MS = 22_000;
const MAX_PROMPT_LENGTH = 20_000;
const MAX_COMMANDS = 120;

const COMMAND_TYPES = [
  "fit_view",
  "set_basemap",
  "set_country_neighbors",
  "create_layer",
  "set_active_layer",
  "configure_layer",
  "reorder_layer",
  "delete_layer",
  "import_geojson_catalog",
  "import_geojson_url",
  "create_geojson_layer",
  "configure_geojson_layer",
  "reorder_geojson_layer",
  "delete_geojson_layer",
  "convert_geojson_to_dromap",
  "convert_dromap_to_geojson",
  "import_buildings",
  "create_custom_marker_svg",
  "delete_custom_marker",
  "create_marker",
  "create_text",
  "create_line",
  "create_zone",
  "create_shape",
  "fill_boundary",
  "create_proportional_markers",
  "create_proportional_flows",
  "create_choropleth",
  "update_features",
  "duplicate_features",
  "reorder_features",
  "delete_features",
  "configure_legend",
  "add_manual_legend_entry",
  "update_manual_legend_entry",
  "delete_manual_legend_entry",
  "configure_legend_group",
  "configure_feature_legend",
  "configure_scale",
  "configure_north_arrow",
  "configure_map_labels",
  "select_feature",
  "clear_selection",
  "open_export_preview",
] as const satisfies readonly DroMapAiCommandType[];

const FEATURE_TYPES = ["marker", "line", "zone", "text"] as const;
const DASH_STYLES = ["solid", "dashed", "dotted"] as const;
const HATCHING_STYLES = [
  "none",
  "diagonal-right",
  "diagonal-left",
  "horizontal",
  "vertical",
  "dots",
] as const;
const MAP_LABEL_VISIBILITIES = ["inherit", "show", "hide"] as const;
const LEGEND_POSITIONS = ["right", "left", "bottom", "map"] as const;
const EXPORT_FORMATS = [
  "auto",
  "16-9",
  "4-3",
  "a4-landscape",
  "a4-portrait",
  "square",
] as const;
const MANUAL_LEGEND_SYMBOLS = [
  "marker",
  "line",
  "arrow",
  "zone",
  "text",
] as const;
const SCALE_STYLES = ["bar", "alternating", "line", "boxed"] as const;
const MAP_ELEMENT_POSITIONS = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;
const NORTH_STYLES = ["classic", "simple", "compass", "needle"] as const;
const LINE_VARIANTS = ["straight", "freehand", "traced"] as const;
const ZONE_VARIANTS = [
  "polygon",
  "freehand",
  "shape",
  "boundary-fill",
] as const;
const SHAPE_KINDS = ["rectangle", "circle", "ellipse"] as const;
const GEOJSON_PRECISIONS = ["original", "intermediate", "light"] as const;
const LAYER_DIRECTIONS = ["up", "down"] as const;
const BUILDING_MODES = ["geojson", "dromap"] as const;
const BUILDING_SELECTION_MODES = ["all", "named"] as const;
const PROPORTIONAL_METHODS = ["area", "diameter", "width"] as const;
const FORBIDDEN_WORKSPACE_COMMANDS = new Set<DroMapAiCommandType>([
  "set_workspace_by_place",
  "set_workspace_bounds",
  "select_world",
]);

const SYSTEM_INSTRUCTIONS = `Tu es l'agent cartographique complet de DroMap. Tu dois transformer la demande en commandes DroMap réellement exécutables et entièrement éditables.

Tu as accès aux familles fonctionnelles suivantes : cadrage de la vue à l'intérieur de la zone déjà validée, fonds de carte, calques DroMap, calques GeoJSON, bibliothèque GeoJSON, bâtiments IGN/Overture, marqueurs intégrés ou personnalisés SVG, textes, lignes, flèches, dessins libres, suivis de trait, zones, zones libres, formes, figurés proportionnels, flux proportionnels, choroplèthes, styles, étiquettes, ordre, verrouillage, duplication, suppression, légende avancée liée aux objets, éléments manuels de légende uniquement lorsqu'aucun objet cartographique correspondant n'existe, échelle, flèche du nord et préparation de l'export.

Réponds uniquement avec un objet JSON :
{
  "summary": "résumé court",
  "warnings": [],
  "facts": [],
  "sources": [],
  "commands": []
}

Règles absolues :
- N'invente jamais l'identifiant d'un objet, calque ou jeu de données existant : utilise uniquement le contexte ou l'id d'une commande précédente comme référence.
- Pour des données démographiques, historiques ou géographiques factuelles, utilise les résultats de recherche fournis dans RECHERCHE FACTUELLE. Reprends les dates, unités et sources dans facts/sources.
- Pour des villes dont la taille dépend de la population, utilise UNE commande create_proportional_markers avec seriesItems et proportionalMethod="area". Chaque item contient label, place ou coordinate, value, unit, date, sourceTitle et sourceUrl, puis configure_legend à droite si demandé.
- Pour des flux quantitatifs, utilise create_proportional_flows.
- Pour une carte par plages de valeurs, utilise create_choropleth avec une source GeoJSON fiable du catalogue, choroplethValues, classes et geoJsonJoinProperties.
- Pour une carte administrative ou physique, privilégie import_geojson_catalog à la génération de frontières approximatives.
- Pour une donnée historique sans frontière vectorielle fiable, représente honnêtement les lieux, zones schématiques, flux et textes ; ajoute un avertissement sur la nature schématique.
- Pour viser tous les objets d'un type, update_features avec selector.featureType. selector.all=true n'est permis que si la demande vise explicitement tous les objets.
- Ne produis jamais update_features, duplicate_features, reorder_features ou delete_features avec un selector vide.
- Les coordonnées sont {"lng": longitude, "lat": latitude}.
- Les opacités sont entre 0 et 1. Les couleurs sont hexadécimales.
- Les fonds recommandés sont openfreemap-liberty, openfreemap-positron, ign-satellite, ign-plan et blank-white.
- Une ligne utilise places ou coordinates dans l'ordre. Pour une flèche, style.arrowEnd=true.
- Un dessin libre est create_line avec lineVariant="freehand" et beaucoup de coordinates. Un suivi est lineVariant="traced" si la géométrie exacte est fournie.
- Une zone libre est create_zone avec zoneVariant="freehand". Une forme est create_shape avec shapeKind et bounds/coordinate.
- Pour utiliser le véritable outil Remplissage sur un fond blanc vectoriel ou un polygone GeoJSON visible, utilise fill_boundary avec place ou coordinate et un style de zone.
- Un marqueur intégré utilise symbolId. Un marqueur IA personnalisé doit d'abord utiliser create_custom_marker_svg, puis create_marker avec customMarkerRef égal à l'id de cette commande.
- Pour un marqueur catégoriel ordinaire, n'indique jamais style.markerSize : DroMap appliquera sa taille normale. N'utilise markerSize que si l'utilisateur demande explicitement une taille, un diamètre ou des marqueurs plus grands/petits. Les figurés réellement quantitatifs utilisent create_proportional_markers.
- Dès que l'utilisateur demande des bâtiments, des édifices ou leurs emprises réelles, utilise import_buildings pour employer le véritable outil Bâtiments IGN/Overture, jamais des polygones inventés ni des marqueurs de substitution. buildingMode="geojson" convient à beaucoup de bâtiments ; buildingMode="dromap" convient à quelques bâtiments éditables individuellement.
- Pour tous les bâtiments d'une zone, utilise buildingSelectionMode="all". Pour des bâtiments précis, utilise buildingSelectionMode="named" et buildingQueries avec leurs noms complets. Pour ces bâtiments précis, choisis par défaut buildingMode="dromap" afin que DroMap crée de vrais objets éditables et une vraie légende liée aux objets. Ne remplace pas les bâtiments ciblés par des marqueurs si l'utilisateur demande les emprises bâties.
- En mode manuel, import_buildings utilise la zone validée. En mode automatique sans zone, fournis place ou bounds pour délimiter la recherche ; à défaut, DroMap géolocalisera les buildingQueries. Les cibles introuvables sont signalées et ne sont jamais remplacées au hasard.
- Ordre impératif : crée/importes d'abord tous les marqueurs, zones, traits, GeoJSON et bâtiments ; configure ensuite la légende.
- Pour tout élément qui existe réellement sur la carte, utilise sa légende automatique. Configure son libellé via legendLabel lors de la création, puis sa section/son ordre via configure_feature_legend avec orderRefs ou selector.
- Dès que la carte contient plusieurs familles de figurés ou plusieurs thèmes, crée toi-même des sous-légendes explicites avec configure_feature_legend. Utilise des intitulés complets et pédagogiques, par exemple « Bars par note Google » et « Moyens de déplacement ».
- N'abrège jamais un titre ou un sous-titre de légende et ne coupe jamais un mot. Le texte fourni dans section doit être la formulation complète destinée à l'utilisateur.
- Organise chaque sous-légende après la création des objets correspondants : utilise orderRefs pour placer les vrais groupes automatiques dans la bonne section et dans le bon ordre. Si tu viens juste de créer/importer une famille d'objets puis que tu règles sa légende, DroMap peut reprendre automatiquement ce dernier groupe ; mais préfère quand même orderRefs dès que possible.
- N'utilise jamais add_manual_legend_entry pour recopier un marqueur, une ligne, une zone, un bâtiment ou une donnée GeoJSON déjà présents sur la carte : cela dédouble la légende et rompt le lien avec l'objet.
- Les entrées manuelles sont réservées aux clés de lecture sans objet source, notamment les classes d'un choroplèthe ou une note purement explicative.
- create_proportional_markers et create_proportional_flows génèrent déjà des entrées automatiques aux tailles exactes : ne crée aucune entrée manuelle supplémentaire.
- Le mode de zone est fourni dans CONTEXTE DROMAP ACTUEL. En mode manual, la zone déjà validée est immuable. En mode automatic, crée d’abord les objets et données utiles sans fabriquer de commande de zone : DroMap calculera ensuite la zone autour du résultat avec une marge.
- Ne génère jamais set_workspace_by_place, set_workspace_bounds ou select_world. fit_view ne remplace jamais directement la zone : le moteur DroMap gère le cadrage et la validation automatique au bon moment.
- La position de légende à droite se voit dans Préparer l'export. Ne génère pas automatiquement open_export_preview : le panneau Assistant IA possède désormais son propre bouton « Voir le rendu ».
- N'ajoute que les champs utiles. Le serveur complétera les autres champs.
`;

const STEP_REVISION_SYSTEM_INSTRUCTIONS = `Tu modifies UNE SEULE étape d'un plan DroMap existant.

Réponds uniquement avec un objet JSON de cette forme :
{
  "command": { ...commande DroMap complète... },
  "message": "résumé très court de la modification"
}

Règles absolues :
- Modifie uniquement la commande ciblée.
- Conserve exactement son identifiant id, car d'autres étapes peuvent y faire référence.
- Ne crée aucune commande supplémentaire.
- Ne modifie pas la zone de travail.
- Garde tous les champs utiles de la commande actuelle qui ne sont pas concernés par la demande.
- La commande renvoyée doit respecter la référence DroMap fournie.
- N'ajoute aucun texte en dehors du JSON.`;

const COMMAND_REFERENCE = `RÉFÉRENCE COMPACTE DES COMMANDES
Chaque commande contient au minimum {"id":"identifiant-unique","type":"...","explanation":"..."}. Les champs absents sont ignorés.

Vue et cadrage
- fit_view : bounds? ou coordinate? ou selector? ; zoom?
- set_basemap : basemapId
- set_country_neighbors : active

Calques DroMap
- create_layer : layerName
- set_active_layer : layerRef (id, nom ou id d'une commande create_layer)
- configure_layer : layerRef, layerName?, visible?, opacity?, locked?, active?
- reorder_layer : layerRef, layerDirection="up"|"down"
- delete_layer : layerRef

GeoJSON et bâtiments
- import_geojson_catalog : geoJsonCatalogId, layerName?, geoJsonPrecision="original"|"intermediate"|"light"
- import_geojson_url : geoJsonUrl HTTPS, layerName?, geoJsonPrecision?
- create_geojson_layer : geoJsonData (FeatureCollection GeoJSON), layerName?, geoJsonPrecision?
- configure_geojson_layer : geoJsonLayerRef, layerName?, visible?, opacity?, locked?, geoJsonPrecision?, geoJsonStyle={strokeColor,strokeWeight,strokeOpacity,fillColor,fillOpacity,markerSize,dashStyle}
- reorder_geojson_layer : geoJsonLayerRef, layerDirection
- delete_geojson_layer : geoJsonLayerRef
- convert_geojson_to_dromap : geoJsonLayerRef, layerName?
- convert_dromap_to_geojson : layerRef (uniquement un calque provenant d'un GeoJSON)
- import_buildings : buildingMode="geojson"|"dromap", buildingSelectionMode="all"|"named", buildingQueries?=[noms exacts], place? ou bounds? pour la zone de recherche automatique, layerName?, maxFeatures?. En mode named, DroMap filtre d'abord par nom puis utilise la géolocalisation du lieu pour retrouver l'emprise correspondante.

Marqueurs, textes, traits et zones
- create_custom_marker_svg : label, customMarkerSvg (SVG autonome et sûr)
- delete_custom_marker : customMarkerRef ou label
- create_marker : place ou coordinate, label, legendLabel?, layerRef?, symbolId? ou customMarkerRef?, style?, mapLabelVisibility?
- create_text : place ou coordinate, label=texte affiché, layerRef?, style?
- create_line : coordinates ou places, label?, legendLabel?, layerRef?, lineVariant="straight"|"freehand"|"traced", style?
- create_zone : rings ou coordinates/places, label?, legendLabel?, layerRef?, zoneVariant="polygon"|"freehand"|"shape"|"boundary-fill", style?
- create_shape : place ou coordinate, shapeKind="rectangle"|"circle"|"ellipse", bounds? ou style.zoneShapeWidth/zoneShapeHeight, label?, layerRef?, style?
- fill_boundary : place ou coordinate, label?, legendLabel?, layerRef?, style? ; utilise les polygones GeoJSON visibles ou les frontières vectorielles du fond

Cartographie quantitative
- create_proportional_markers : seriesItems, proportionalMethod="area" recommandé, minSize?, maxSize?, symbolId?, layerRef?, style?, mapLabelVisibility?, legendTitle?, section?
- create_proportional_flows : seriesItems avec fromPlace/toPlace ou fromCoordinate/toCoordinate, proportionalMethod="width", minSize?, maxSize?, layerRef?, style?, legendTitle?, section?
- create_choropleth : geoJsonCatalogId ou geoJsonUrl ou geoJsonData, geoJsonJoinProperties, choroplethValues, classes, layerName?, geoJsonStyle?, legendTitle?, section?
seriesItems = [{id,label,place?,coordinate?,fromPlace?,toPlace?,fromCoordinate?,toCoordinate?,value,unit?,date?,category?,color?,symbolId?,sourceTitle?,sourceUrl?}]
choroplethValues = [{key,label?,value,unit?,sourceTitle?,sourceUrl?}]
classes = [{min?,max?,label,fillColor,fillOpacity}]

Modification des objets
selector = {featureIds?,labelContains?,legendLabelContains?,layerName?,featureType?="marker"|"line"|"zone"|"text",sourceType?="geojson",all?}
- update_features : selector obligatoire, label?, legendLabel?, symbolId?, customMarkerRef?, style?, mapLabelVisibility?, locked?, geometryLocked?
- duplicate_features : selector obligatoire
- reorder_features : selector obligatoire, layerDirection="up"|"down"
- delete_features : selector obligatoire

Légende et éléments cartographiques
- configure_legend : legendTitle?, legendPosition="left"|"right"|"bottom"|"map", exportFormat="auto"|"16-9"|"4-3"|"a4-landscape"|"a4-portrait"|"square", legendBackgroundColor?, legendSideWidth?, legendBottomHeight?, legendTitleFontSize?, legendItemFontSize?, legendSectionTitleFontSize?, legendSymbolSize?, legendItemGap?, legendLabelGap?, legendSectionGap?, legendMapBorderEnabled?, legendMapBorderColor?, legendMapBorderWidth?, legendMapBorderRadius?, legendMapPadding?
- add_manual_legend_entry : label, section?, manualLegendSymbol="marker"|"line"|"arrow"|"zone"|"text", symbolId?, style?
- update_manual_legend_entry : manualLegendEntryId, label?, section?, manualLegendSymbol?, symbolId?, style?
- delete_manual_legend_entry : manualLegendEntryId
- configure_legend_group : legendGroupKey, label?, section?, hidden?, orderRefs? (seulement si la clé exacte est fournie dans le contexte)
- configure_feature_legend : orderRefs=[ids de commandes de création ou ids d'objets] et/ou selector ; label? seulement pour un groupe unique ; section?, hidden?. Cette commande résout les vraies clés automatiques après création des objets et crée automatiquement la sous-légende nommée par section si elle n'existe pas encore. Utilise le titre complet, sans abréviation.
- configure_scale : active?, scaleStyle="bar"|"alternating"|"line"|"boxed", scalePosition="top-left"|"top-right"|"bottom-left"|"bottom-right"
- configure_north_arrow : active?, northStyle="classic"|"simple"|"compass"|"needle", northPosition comme ci-dessus
- configure_map_labels : allMapLabelsEnabled?, geoJsonMapLabelsEnabled?, mapLabelScale? (0.5 à 2.5). allMapLabelsEnabled affiche tous les noms saisis ; geoJsonMapLabelsEnabled seulement les objets issus de GeoJSON.
- select_feature : selector ou layerRef contenant l'id d'une commande de création
- clear_selection
- open_export_preview

style peut contenir : color, weight, opacity, fillColor, fillOpacity, dashStyle, zoneStrokeEnabled, zoneFillEnabled, zoneHatchingStyle, zoneHatchingColor, zoneHatchingWeight, zoneHatchingSpacing, zoneDotsEnabled, zoneDotsColor, zoneDotsRadius, zoneDotsSpacing, zoneShapeWidth, zoneShapeHeight, zoneShapeRotation, markerSize, markerFilled, markerRotation, fontSize, textRotation, textBackgroundEnabled, textBackgroundColor, textBackgroundOpacity, textBorderEnabled, textBorderColor, textBorderWidth, arrowStart, arrowEnd, freehandSmoothing.
`;

type InteractionPayload = Record<string, unknown> & {
  error?: { message?: string; status?: string; code?: number };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function asNullableString(value: unknown) {
  const text = asString(value);
  return text || null;
}

function asNumber(value: unknown) {
  const number =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(number) ? number : null;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function asStringArray(value: unknown, maxItems = 200) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, maxItems)
    : [];
}

function asEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] | null {
  return typeof value === "string" && allowed.includes(value as T[number])
    ? (value as T[number])
    : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeCoordinate(value: unknown): DroMapAiCoordinate | null {
  if (!isRecord(value)) return null;
  const lng = asNumber(value.lng);
  const lat = asNumber(value.lat);
  if (lng === null || lat === null) return null;
  return {
    lng: clamp(lng, -360, 360),
    lat: clamp(lat, -85.05112878, 85.05112878),
  };
}

function normalizeCoordinates(value: unknown, maxItems = 5000) {
  return Array.isArray(value)
    ? value
        .map(normalizeCoordinate)
        .filter((item): item is DroMapAiCoordinate => item !== null)
        .slice(0, maxItems)
    : [];
}

function normalizeRings(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((ring) => normalizeCoordinates(ring, 5000))
        .filter((ring) => ring.length >= 3)
        .slice(0, 20)
    : [];
}

function normalizeBounds(value: unknown): DroMapAiBounds | null {
  if (!isRecord(value)) return null;
  const south = asNumber(value.south),
    west = asNumber(value.west),
    north = asNumber(value.north),
    east = asNumber(value.east);
  if (south === null || west === null || north === null || east === null)
    return null;
  return {
    south: clamp(Math.min(south, north), -85.05112878, 85.05112878),
    west: clamp(west, -360, 360),
    north: clamp(Math.max(south, north), -85.05112878, 85.05112878),
    east: clamp(east, -360, 360),
  };
}

function normalizeSelector(value: unknown): DroMapAiFeatureSelector {
  const source = isRecord(value) ? value : {};
  return {
    featureIds: asStringArray(source.featureIds, 1000),
    labelContains: asNullableString(source.labelContains),
    legendLabelContains: asNullableString(source.legendLabelContains),
    layerName: asNullableString(source.layerName),
    featureType: asEnum(source.featureType, FEATURE_TYPES),
    sourceType: source.sourceType === "geojson" ? "geojson" : null,
    all: source.all === true,
  };
}

function normalizeStyle(value: unknown): DroMapAiStylePatch {
  const source = isRecord(value) ? value : {};
  return {
    color: asNullableString(source.color),
    weight: asNumber(source.weight),
    opacity: asNumber(source.opacity),
    fillColor: asNullableString(source.fillColor),
    fillOpacity: asNumber(source.fillOpacity),
    dashStyle: asEnum(source.dashStyle, DASH_STYLES),
    zoneStrokeEnabled: asBoolean(source.zoneStrokeEnabled),
    zoneFillEnabled: asBoolean(source.zoneFillEnabled),
    zoneHatchingStyle: asEnum(source.zoneHatchingStyle, HATCHING_STYLES),
    zoneHatchingColor: asNullableString(source.zoneHatchingColor),
    zoneHatchingWeight: asNumber(source.zoneHatchingWeight),
    zoneHatchingSpacing: asNumber(source.zoneHatchingSpacing),
    zoneDotsEnabled: asBoolean(source.zoneDotsEnabled),
    zoneDotsColor: asNullableString(source.zoneDotsColor),
    zoneDotsRadius: asNumber(source.zoneDotsRadius),
    zoneDotsSpacing: asNumber(source.zoneDotsSpacing),
    zoneShapeWidth: asNumber(source.zoneShapeWidth),
    zoneShapeHeight: asNumber(source.zoneShapeHeight),
    zoneShapeRotation: asNumber(source.zoneShapeRotation),
    markerSize: asNumber(source.markerSize),
    markerFilled: asBoolean(source.markerFilled),
    markerRotation: asNumber(source.markerRotation),
    fontSize: asNumber(source.fontSize),
    textRotation: asNumber(source.textRotation),
    textBackgroundEnabled: asBoolean(source.textBackgroundEnabled),
    textBackgroundColor: asNullableString(source.textBackgroundColor),
    textBackgroundOpacity: asNumber(source.textBackgroundOpacity),
    textBorderEnabled: asBoolean(source.textBorderEnabled),
    textBorderColor: asNullableString(source.textBorderColor),
    textBorderWidth: asNumber(source.textBorderWidth),
    arrowStart: asBoolean(source.arrowStart),
    arrowEnd: asBoolean(source.arrowEnd),
    freehandSmoothing: asNumber(source.freehandSmoothing),
  };
}

function normalizeGeoJsonStyle(value: unknown) {
  const source = isRecord(value) ? value : {};
  return {
    strokeColor: asNullableString(source.strokeColor),
    strokeWeight: asNumber(source.strokeWeight),
    strokeOpacity: asNumber(source.strokeOpacity),
    fillColor: asNullableString(source.fillColor),
    fillOpacity: asNumber(source.fillOpacity),
    markerSize: asNumber(source.markerSize),
    dashStyle: asEnum(source.dashStyle, DASH_STYLES),
  };
}

function normalizeSeriesItems(value: unknown): DroMapAiSeriesItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 500).flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const number = asNumber(item.value);
    const label = asNullableString(item.label);
    if (number === null || !label) return [];
    return [
      {
        id: asNullableString(item.id) ?? `item-${index + 1}`,
        label,
        place: asNullableString(item.place),
        coordinate: normalizeCoordinate(item.coordinate),
        fromPlace: asNullableString(item.fromPlace),
        toPlace: asNullableString(item.toPlace),
        fromCoordinate: normalizeCoordinate(item.fromCoordinate),
        toCoordinate: normalizeCoordinate(item.toCoordinate),
        value: number,
        unit: asNullableString(item.unit),
        date: asNullableString(item.date),
        category: asNullableString(item.category),
        color: asNullableString(item.color),
        symbolId: asNullableString(item.symbolId),
        sourceTitle: asNullableString(item.sourceTitle),
        sourceUrl: asNullableString(item.sourceUrl),
      },
    ];
  });
}

function normalizeClasses(value: unknown): DroMapAiChoroplethClass[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).flatMap((item) => {
    if (!isRecord(item)) return [];
    const label = asNullableString(item.label),
      fillColor = asNullableString(item.fillColor);
    if (!label || !fillColor) return [];
    return [
      {
        min: asNumber(item.min),
        max: asNumber(item.max),
        label,
        fillColor,
        fillOpacity: clamp(asNumber(item.fillOpacity) ?? 0.75, 0, 1),
      },
    ];
  });
}

function normalizeChoroplethValues(value: unknown): DroMapAiChoroplethValue[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5000).flatMap((item) => {
    if (!isRecord(item)) return [];
    const key = asNullableString(item.key),
      number = asNumber(item.value);
    if (!key || number === null) return [];
    return [
      {
        key,
        label: asNullableString(item.label),
        value: number,
        unit: asNullableString(item.unit),
        sourceTitle: asNullableString(item.sourceTitle),
        sourceUrl: asNullableString(item.sourceUrl),
      },
    ];
  });
}

function selectorHasConstraint(selector: DroMapAiFeatureSelector) {
  return (
    selector.all ||
    selector.featureIds.length > 0 ||
    selector.labelContains !== null ||
    selector.legendLabelContains !== null ||
    selector.layerName !== null ||
    selector.featureType !== null ||
    selector.sourceType !== null
  );
}

function blankCommand(
  id: string,
  type: DroMapAiCommandType,
  explanation: string,
): DroMapAiCommand {
  return {
    id,
    type,
    explanation,
    place: null,
    places: [],
    coordinate: null,
    coordinates: [],
    rings: [],
    bounds: null,
    paddingRatio: null,
    zoom: null,
    basemapId: null,
    layerRef: null,
    layerName: null,
    layerDirection: null,
    selector: {
      featureIds: [],
      labelContains: null,
      legendLabelContains: null,
      layerName: null,
      featureType: null,
      sourceType: null,
      all: false,
    },
    label: null,
    legendLabel: null,
    symbolId: null,
    customMarkerRef: null,
    customMarkerSvg: null,
    style: normalizeStyle(null),
    mapLabelVisibility: null,
    lineVariant: null,
    zoneVariant: null,
    shapeKind: null,
    geometryLocked: null,
    visible: null,
    locked: null,
    opacity: null,
    active: null,
    geoJsonCatalogId: null,
    geoJsonUrl: null,
    geoJsonData: null,
    geoJsonLayerRef: null,
    geoJsonPrecision: null,
    geoJsonStyle: normalizeGeoJsonStyle(null),
    geoJsonPropertyName: null,
    geoJsonJoinProperties: [],
    buildingMode: null,
    buildingSelectionMode: null,
    buildingQueries: [],
    maxFeatures: null,
    seriesItems: [],
    proportionalMethod: null,
    minSize: null,
    maxSize: null,
    classes: [],
    choroplethValues: [],
    legendTitle: null,
    legendPosition: null,
    exportFormat: null,
    legendBackgroundColor: null,
    legendSideWidth: null,
    legendBottomHeight: null,
    legendTitleFontSize: null,
    legendItemFontSize: null,
    legendSectionTitleFontSize: null,
    legendSymbolSize: null,
    legendItemGap: null,
    legendLabelGap: null,
    legendSectionGap: null,
    legendMapBorderEnabled: null,
    legendMapBorderColor: null,
    legendMapBorderWidth: null,
    legendMapBorderRadius: null,
    legendMapPadding: null,
    section: null,
    manualLegendEntryId: null,
    manualLegendSymbol: null,
    legendGroupKey: null,
    hidden: null,
    orderRefs: [],
    scaleStyle: null,
    scalePosition: null,
    northStyle: null,
    northPosition: null,
    mapLabelsEnabled: null,
    allMapLabelsEnabled: null,
    geoJsonMapLabelsEnabled: null,
    mapLabelScale: null,
  };
}

function normalizeCommand(
  value: unknown,
  index: number,
  warnings: string[],
): DroMapAiCommand | null {
  if (!isRecord(value)) {
    warnings.push(`Commande ${index + 1} ignorée : format invalide.`);
    return null;
  }
  const type = asEnum(value.type, COMMAND_TYPES);
  if (!type) {
    warnings.push(`Commande ${index + 1} ignorée : type inconnu.`);
    return null;
  }
  const selector = normalizeSelector(value.selector);
  if (
    [
      "update_features",
      "duplicate_features",
      "reorder_features",
      "delete_features",
    ].includes(type) &&
    !selectorHasConstraint(selector)
  ) {
    warnings.push(`Commande ${index + 1} ignorée : sélecteur vide.`);
    return null;
  }
  const command = blankCommand(
    asNullableString(value.id) ?? `commande-${index + 1}`,
    type,
    asNullableString(value.explanation) ?? type,
  );
  return {
    ...command,
    place: asNullableString(value.place),
    places: asStringArray(value.places, 1000),
    coordinate: normalizeCoordinate(value.coordinate),
    coordinates: normalizeCoordinates(value.coordinates),
    rings: normalizeRings(value.rings),
    bounds: normalizeBounds(value.bounds),
    paddingRatio: asNumber(value.paddingRatio),
    zoom: asNumber(value.zoom),
    basemapId: asNullableString(value.basemapId),
    layerRef: asNullableString(value.layerRef),
    layerName: asNullableString(value.layerName),
    layerDirection: asEnum(value.layerDirection, LAYER_DIRECTIONS),
    selector,
    label: asNullableString(value.label),
    legendLabel: asNullableString(value.legendLabel),
    symbolId: asNullableString(value.symbolId),
    customMarkerRef: asNullableString(value.customMarkerRef),
    customMarkerSvg: asNullableString(value.customMarkerSvg),
    style: normalizeStyle(value.style),
    mapLabelVisibility: asEnum(
      value.mapLabelVisibility,
      MAP_LABEL_VISIBILITIES,
    ),
    lineVariant: asEnum(value.lineVariant, LINE_VARIANTS),
    zoneVariant: asEnum(value.zoneVariant, ZONE_VARIANTS),
    shapeKind: asEnum(value.shapeKind, SHAPE_KINDS),
    geometryLocked: asBoolean(value.geometryLocked),
    visible: asBoolean(value.visible),
    locked: asBoolean(value.locked),
    opacity: asNumber(value.opacity),
    active: asBoolean(value.active),
    geoJsonCatalogId: asNullableString(value.geoJsonCatalogId),
    geoJsonUrl: asNullableString(value.geoJsonUrl),
    geoJsonData: isRecord(value.geoJsonData) ? value.geoJsonData : null,
    geoJsonLayerRef: asNullableString(value.geoJsonLayerRef),
    geoJsonPrecision: asEnum(value.geoJsonPrecision, GEOJSON_PRECISIONS),
    geoJsonStyle: normalizeGeoJsonStyle(value.geoJsonStyle),
    geoJsonPropertyName: asNullableString(value.geoJsonPropertyName),
    geoJsonJoinProperties: asStringArray(value.geoJsonJoinProperties, 50),
    buildingMode: asEnum(value.buildingMode, BUILDING_MODES),
    buildingSelectionMode: asEnum(
      value.buildingSelectionMode,
      BUILDING_SELECTION_MODES,
    ),
    buildingQueries: asStringArray(value.buildingQueries, 80),
    maxFeatures: asNumber(value.maxFeatures),
    seriesItems: normalizeSeriesItems(value.seriesItems),
    proportionalMethod: asEnum(value.proportionalMethod, PROPORTIONAL_METHODS),
    minSize: asNumber(value.minSize),
    maxSize: asNumber(value.maxSize),
    classes: normalizeClasses(value.classes),
    choroplethValues: normalizeChoroplethValues(value.choroplethValues),
    legendTitle: asNullableString(value.legendTitle),
    legendPosition: asEnum(value.legendPosition, LEGEND_POSITIONS),
    exportFormat: asEnum(value.exportFormat, EXPORT_FORMATS),
    legendBackgroundColor: asNullableString(value.legendBackgroundColor),
    legendSideWidth: asNumber(value.legendSideWidth),
    legendBottomHeight: asNumber(value.legendBottomHeight),
    legendTitleFontSize: asNumber(value.legendTitleFontSize),
    legendItemFontSize: asNumber(value.legendItemFontSize),
    legendSectionTitleFontSize: asNumber(value.legendSectionTitleFontSize),
    legendSymbolSize: asNumber(value.legendSymbolSize),
    legendItemGap: asNumber(value.legendItemGap),
    legendLabelGap: asNumber(value.legendLabelGap),
    legendSectionGap: asNumber(value.legendSectionGap),
    legendMapBorderEnabled: asBoolean(value.legendMapBorderEnabled),
    legendMapBorderColor: asNullableString(value.legendMapBorderColor),
    legendMapBorderWidth: asNumber(value.legendMapBorderWidth),
    legendMapBorderRadius: asNumber(value.legendMapBorderRadius),
    legendMapPadding: asNumber(value.legendMapPadding),
    section: asNullableString(value.section),
    manualLegendEntryId: asNullableString(value.manualLegendEntryId),
    manualLegendSymbol: asEnum(value.manualLegendSymbol, MANUAL_LEGEND_SYMBOLS),
    legendGroupKey: asNullableString(value.legendGroupKey),
    hidden: asBoolean(value.hidden),
    orderRefs: asStringArray(value.orderRefs, 1000),
    scaleStyle: asEnum(value.scaleStyle, SCALE_STYLES),
    scalePosition: asEnum(value.scalePosition, MAP_ELEMENT_POSITIONS),
    northStyle: asEnum(value.northStyle, NORTH_STYLES),
    northPosition: asEnum(value.northPosition, MAP_ELEMENT_POSITIONS),
    mapLabelsEnabled: asBoolean(value.mapLabelsEnabled),
    allMapLabelsEnabled: asBoolean(value.allMapLabelsEnabled),
    geoJsonMapLabelsEnabled: asBoolean(value.geoJsonMapLabelsEnabled),
    mapLabelScale: asNumber(value.mapLabelScale),
  };
}

function normalizeSources(value: unknown): DroMapAiSource[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 40).flatMap((item) => {
    if (!isRecord(item)) return [];
    const title = asNullableString(item.title),
      url = asNullableString(item.url);
    if (!title || !url) return [];
    return [
      {
        title,
        url,
        publisher: asNullableString(item.publisher),
        accessedAt: asNullableString(item.accessedAt),
        note: asNullableString(item.note),
      },
    ];
  });
}

function normalizeFacts(value: unknown): DroMapAiFact[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).flatMap((item) => {
    if (!isRecord(item)) return [];
    const subject = asNullableString(item.subject),
      metric = asNullableString(item.metric);
    if (!subject || !metric) return [];
    return [
      {
        subject,
        metric,
        value:
          typeof item.value === "number" || typeof item.value === "string"
            ? item.value
            : null,
        unit: asNullableString(item.unit),
        date: asNullableString(item.date),
        location: asNullableString(item.location),
        sourceTitle: asNullableString(item.sourceTitle),
        sourceUrl: asNullableString(item.sourceUrl),
        note: asNullableString(item.note),
      },
    ];
  });
}

function cleanGeminiJsonText(text: string) {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();
}

function extractBalancedJsonCandidates(text: string) {
  const candidates: string[] = [];

  for (let start = 0; start < text.length; start += 1) {
    const opening = text[start];
    if (opening !== "{" && opening !== "[") continue;

    const stack: string[] = [];
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
      const character = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }

      if (character === '"') {
        inString = true;
        continue;
      }

      if (character === "{" || character === "[") {
        stack.push(character);
        continue;
      }

      if (character !== "}" && character !== "]") continue;

      const expectedOpening = character === "}" ? "{" : "[";
      if (stack[stack.length - 1] !== expectedOpening) break;

      stack.pop();
      if (stack.length === 0) {
        candidates.push(text.slice(start, index + 1));
        start = index;
        break;
      }
    }
  }

  return candidates;
}

function parseJsonText(text: string) {
  const cleaned = cleanGeminiJsonText(text);

  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    // Gemini peut ajouter une explication ou un second bloc après le JSON.
  }

  const parsedCandidates: unknown[] = [];
  for (const candidate of extractBalancedJsonCandidates(cleaned)) {
    try {
      parsedCandidates.push(JSON.parse(candidate) as unknown);
    } catch {
      // Ignore uniquement ce candidat et continue avec les suivants.
    }
  }

  const planCandidate = parsedCandidates.find(
    (candidate) => isRecord(candidate) && Array.isArray(candidate.commands),
  );
  if (planCandidate) return planCandidate;

  const researchCandidate = parsedCandidates.find(
    (candidate) =>
      isRecord(candidate) &&
      (Array.isArray(candidate.facts) || Array.isArray(candidate.sources)),
  );
  if (researchCandidate) return researchCandidate;

  const firstCandidate = parsedCandidates[0];
  if (Array.isArray(firstCandidate)) {
    return { commands: firstCandidate };
  }
  if (firstCandidate !== undefined) return firstCandidate;

  const preview = cleaned.slice(0, 1_200);
  console.error("Réponse Gemini brute non exploitable :", preview);
  throw new Error(
    "Gemini a renvoyé une réponse incomplète ou mal formée. Réessaie la même demande.",
  );
}

function normalizePlan(value: unknown): DroMapAiPlan {
  const source = isRecord(value) ? value : {};
  const warnings = asStringArray(source.warnings, 80);
  const commands = (Array.isArray(source.commands) ? source.commands : [])
    .slice(0, MAX_COMMANDS)
    .map((item, index) => normalizeCommand(item, index, warnings))
    .filter((item): item is DroMapAiCommand => item !== null);
  return {
    summary:
      asNullableString(source.summary) ??
      "Plan cartographique préparé par Gemini.",
    warnings,
    facts: normalizeFacts(source.facts),
    sources: normalizeSources(source.sources),
    commands,
  };
}

function extractGenerateContentText(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.candidates)) return "";
  const chunks: string[] = [];
  for (const candidate of payload.candidates) {
    if (
      !isRecord(candidate) ||
      !isRecord(candidate.content) ||
      !Array.isArray(candidate.content.parts)
    )
      continue;
    for (const part of candidate.content.parts) {
      if (isRecord(part) && typeof part.text === "string")
        chunks.push(part.text);
    }
  }
  return chunks.join("").trim();
}

function buildGenerateContentBody(body: Record<string, unknown>) {
  const input = asString(body.input);
  const systemInstruction = asString(body.system_instruction);
  const responseFormat = isRecord(body.response_format)
    ? body.response_format
    : {};
  const mimeType = asString(responseFormat.mime_type) || "application/json";
  const generationConfig = isRecord(body.generation_config)
    ? body.generation_config
    : {};
  const maxOutputTokens = clamp(
    asNumber(generationConfig.max_output_tokens) ?? 8_000,
    512,
    16_000,
  );
  const requestBody: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: input }] }],
    generationConfig: {
      responseMimeType: mimeType,
      maxOutputTokens,
      temperature: 0.1,
    },
  };
  if (systemInstruction) {
    requestBody.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  if (
    Array.isArray(body.tools) &&
    body.tools.some((tool) => isRecord(tool) && tool.type === "google_search")
  ) {
    requestBody.tools = [{ googleSearch: {} }];
  }
  return requestBody;
}

async function callGeminiOnce(
  apiKey: string,
  body: Record<string, unknown>,
  model: string,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${GENERATE_CONTENT_BASE_URL}/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(buildGenerateContentBody(body)),
        signal: controller.signal,
        cache: "no-store",
      },
    );

    const raw = await response.text();
    let payload: InteractionPayload = {};
    if (raw) {
      try {
        payload = JSON.parse(raw) as InteractionPayload;
      } catch {
        if (!response.ok)
          throw new Error(
            `Gemini a renvoyé ${response.status} avec une réponse illisible.`,
          );
        throw new Error("Gemini a renvoyé une réponse non JSON inattendue.");
      }
    }

    if (!response.ok || payload.error) {
      const message =
        payload.error?.message ?? `Gemini a renvoyé ${response.status}.`;
      const error = new Error(message) as Error & {
        status?: number;
        retryable?: boolean;
      };
      error.status = response.status;
      error.retryable =
        response.status === 429 ||
        response.status === 500 ||
        response.status === 503 ||
        response.status === 504;
      throw error;
    }

    const text = extractGenerateContentText(payload);
    if (!text) throw new Error("Gemini n'a renvoyé aucun contenu exploitable.");
    return { text, payload, model };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutError = new Error(
        `Le modèle ${model} a dépassé ${Math.round(REQUEST_TIMEOUT_MS / 1000)} secondes.`,
      ) as Error & { retryable?: boolean };
      timeoutError.retryable = true;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isModelAvailabilityError(status: number, message: string) {
  const normalized = message.toLowerCase();
  return (
    status === 404 ||
    ((status === 400 || status === 403) &&
      normalized.includes("model") &&
      (normalized.includes("not found") ||
        normalized.includes("no longer available") ||
        normalized.includes("not supported") ||
        normalized.includes("unavailable")))
  );
}

function shouldFallbackAfterError(error: unknown) {
  const status =
    isRecord(error) && typeof error.status === "number" ? error.status : 0;
  const message = error instanceof Error ? error.message : String(error);
  const retryable = isRecord(error) && error.retryable === true;
  return retryable || isModelAvailabilityError(status, message);
}

async function callGemini(apiKey: string, body: Record<string, unknown>) {
  const requestedModel = asNullableString(body.model) ?? DEFAULT_MODEL;
  const configuredFallback =
    process.env.DROMAP_GEMINI_FALLBACK_MODEL?.trim() || DEFAULT_FALLBACK_MODEL;
  const candidates = Array.from(
    new Set([requestedModel, configuredFallback]),
  ).filter(Boolean);
  let lastError: unknown = null;

  for (const model of candidates) {
    try {
      return await callGeminiOnce(apiKey, body, model);
    } catch (error) {
      lastError = error;
      if (
        !shouldFallbackAfterError(error) ||
        model === candidates[candidates.length - 1]
      )
        throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(
        "Aucun modèle Gemini compatible n'est disponible pour cette clé API.",
      );
}

function shouldResearch(prompt: string) {
  return /(population|habitant|démograph|demograph|densité|density|pib|gdp|migration|commerce|export|import|production|chômage|histoire|historique|guerre|empire|royaume|frontière|géograph|geograph|fleuve|rivière|riviere|montagne|sommet|altitude|superficie|capitale|métropole|metropole|mer|océan|ocean|lac|climat|relief|langue|religion|ethnie|bataille|traité|traite|alliance|élection|election|résultat|resultat|statistique|nombre|taux|pourcentage|en \d{3,4}|aujourd'hui|actuel|récent|recent|date)/i.test(
    prompt,
  );
}

const RESEARCH_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    facts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          subject: { type: "string" },
          metric: { type: "string" },
          value: { type: ["number", "string", "null"] },
          unit: { type: ["string", "null"] },
          date: { type: ["string", "null"] },
          location: { type: ["string", "null"] },
          sourceTitle: { type: ["string", "null"] },
          sourceUrl: { type: ["string", "null"] },
          note: { type: ["string", "null"] },
        },
        required: [
          "subject",
          "metric",
          "value",
          "unit",
          "date",
          "location",
          "sourceTitle",
          "sourceUrl",
          "note",
        ],
      },
    },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          url: { type: "string" },
          publisher: { type: ["string", "null"] },
          accessedAt: { type: ["string", "null"] },
          note: { type: ["string", "null"] },
        },
        required: ["title", "url", "publisher", "accessedAt", "note"],
      },
    },
  },
  required: ["summary", "facts", "sources"],
};

async function researchPrompt(apiKey: string, model: string, prompt: string) {
  const result = await callGemini(apiKey, {
    model,
    input: `Recherche les données factuelles nécessaires pour créer cette carte : ${prompt}\n\nPrivilégie les sources institutionnelles, statistiques officielles, encyclopédies ou travaux scientifiques. Pour chaque chiffre, indique le périmètre exact, l'année, l'unité et l'URL. Ne confonds pas commune, agglomération et aire métropolitaine. Pour les faits historiques, distingue fait établi, frontière exacte et représentation schématique.`,
    tools: [{ type: "google_search" }],
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: RESEARCH_SCHEMA,
    },
    generation_config: { thinking_level: "medium" },
    store: false,
  });
  const parsed = parseJsonText(result.text);
  return {
    summary: isRecord(parsed) ? asString(parsed.summary) : "",
    facts: isRecord(parsed) ? normalizeFacts(parsed.facts) : [],
    sources: isRecord(parsed) ? normalizeSources(parsed.sources) : [],
  };
}

type FreeResearchEntityRequest = {
  name: string;
  country: string | null;
  kind: "city" | "country" | "region" | "historical" | "other";
};

type FreeResearchWorldBankRequest = {
  countryCode: string;
  indicator: string;
  label: string;
};

type FreeResearchPlan = {
  language: string;
  wikipediaQueries: string[];
  wikidataEntities: FreeResearchEntityRequest[];
  worldBankIndicators: FreeResearchWorldBankRequest[];
};

type FreeResearchBundle = {
  summary: string;
  facts: DroMapAiFact[];
  sources: DroMapAiSource[];
  corpus: Array<{
    title: string;
    url: string;
    text: string;
    publisher: string;
  }>;
  locations?: Array<{
    subject: string;
    coordinate: DroMapAiCoordinate;
  }>;
};

function normalizeFreeResearchPlan(value: unknown): FreeResearchPlan {
  const source = isRecord(value) ? value : {};
  const entities = Array.isArray(source.wikidataEntities)
    ? source.wikidataEntities.slice(0, 15).flatMap((item) => {
        if (!isRecord(item)) return [];
        const name = asNullableString(item.name);
        if (!name) return [];
        const kind =
          asEnum(item.kind, [
            "city",
            "country",
            "region",
            "historical",
            "other",
          ] as const) ?? "other";
        return [{ name, country: asNullableString(item.country), kind }];
      })
    : [];
  const indicators = Array.isArray(source.worldBankIndicators)
    ? source.worldBankIndicators.slice(0, 12).flatMap((item) => {
        if (!isRecord(item)) return [];
        const countryCode = asNullableString(item.countryCode)?.toUpperCase();
        const indicator = asNullableString(item.indicator)?.toUpperCase();
        const label = asNullableString(item.label);
        if (!countryCode || !indicator || !label) return [];
        if (
          !/^[A-Z0-9]{2,4}$/.test(countryCode) ||
          !/^[A-Z0-9._-]{3,30}$/.test(indicator)
        )
          return [];
        return [{ countryCode, indicator, label }];
      })
    : [];
  const language =
    asNullableString(source.language)
      ?.toLowerCase()
      .replace(/[^a-z-]/g, "")
      .slice(0, 8) || "fr";
  return {
    language,
    wikipediaQueries: asStringArray(source.wikipediaQueries, 10),
    wikidataEntities: entities,
    worldBankIndicators: indicators,
  };
}

async function fetchExternalJson(url: string, timeoutMs = 5_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "DroMap/1.0 (cartographic research assistant)",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Source externe ${response.status}.`);
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeKey(value: unknown) {
  return asString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const PLACE_ALIASES: Record<string, string> = {
  marseilles: "Marseille",
  marselle: "Marseille",
  paris: "Paris",
  lyon: "Lyon",
};

function canonicalPlaceName(value: string) {
  return PLACE_ALIASES[normalizeKey(value)] ?? value.trim();
}

function populationMarkerCityNames(prompt: string) {
  const normalized = normalizeKey(prompt);
  if (!/(population|habitant|demograph|nombre d habitants)/.test(normalized))
    return [];
  if (!/(marqueur|cercle|ville|metropole)/.test(normalized)) return [];
  const plan = heuristicFreeResearchPlan(prompt);
  const names = plan.wikidataEntities
    .map((entity) => canonicalPlaceName(entity.name))
    .filter((name) => name.length >= 2);
  return Array.from(new Set(names)).slice(0, 12);
}

function coordinateIsInsideBounds(
  coordinate: DroMapAiCoordinate,
  bounds: DroMapAiBounds,
) {
  const south = Math.min(bounds.south, bounds.north);
  const north = Math.max(bounds.south, bounds.north);
  const west = Math.min(bounds.west, bounds.east);
  const east = Math.max(bounds.west, bounds.east);
  const longitudeCandidates = [
    coordinate.lng,
    coordinate.lng - 360,
    coordinate.lng + 360,
  ];

  return (
    coordinate.lat >= south &&
    coordinate.lat <= north &&
    longitudeCandidates.some(
      (longitude) => longitude >= west && longitude <= east,
    )
  );
}

async function buildPopulationMarkerFastPath(
  prompt: string,
  context: Record<string, unknown>,
  workspaceMode: "manual" | "automatic",
): Promise<DroMapAiPlan | null> {
  const names = populationMarkerCityNames(prompt);
  if (names.length < 2) return null;

  const settled = await Promise.allSettled(
    names.map((name) =>
      fetchWikidataEntity({ name, country: "France", kind: "city" }, "fr"),
    ),
  );
  const facts: DroMapAiFact[] = [];
  const sources: DroMapAiSource[] = [];
  const locations: Array<{ subject: string; coordinate: DroMapAiCoordinate }> =
    [];
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    facts.push(
      ...result.value.facts.filter((fact) =>
        normalizeKey(fact.metric).includes("population"),
      ),
    );
    sources.push(...result.value.sources);
    locations.push(...(result.value.locations ?? []));
  }

  const populationByName = new Map<string, DroMapAiFact>();
  for (const fact of facts) {
    const value =
      typeof fact.value === "number" ? fact.value : asNumber(fact.value);
    if (value === null || value <= 0) continue;
    const key = normalizeKey(fact.subject);
    const existing = populationByName.get(key);
    if (!existing || (fact.date ?? "") > (existing.date ?? "")) {
      populationByName.set(key, { ...fact, value });
    }
  }

  const coordinateByName = new Map<string, DroMapAiCoordinate>();
  for (const location of locations) {
    coordinateByName.set(normalizeKey(location.subject), location.coordinate);
  }

  const matched = names.flatMap((requestedName) => {
    const canonical = canonicalPlaceName(requestedName);
    const requestedKey = normalizeKey(canonical);
    const fact =
      populationByName.get(requestedKey) ??
      Array.from(populationByName.values()).find((candidate) => {
        const factKey = normalizeKey(candidate.subject);
        return factKey.includes(requestedKey) || requestedKey.includes(factKey);
      });
    if (!fact) return [];
    const factKey = normalizeKey(fact.subject);
    const coordinate =
      coordinateByName.get(requestedKey) ??
      coordinateByName.get(factKey) ??
      Array.from(coordinateByName.entries()).find(
        ([key]) => key.includes(requestedKey) || requestedKey.includes(key),
      )?.[1] ??
      null;
    return [{ requestedName: canonical, fact, coordinate }];
  });

  if (matched.length < 2) return null;

  const workspaceBounds = isRecord(context.workspaceBounds)
    ? {
        south: asNumber(context.workspaceBounds.south),
        west: asNumber(context.workspaceBounds.west),
        north: asNumber(context.workspaceBounds.north),
        east: asNumber(context.workspaceBounds.east),
      }
    : null;

  if (workspaceMode === "manual") {
    if (
      !workspaceBounds ||
      Object.values(workspaceBounds).some((value) => value === null)
    ) {
      const error = new Error(
        "Sélectionne puis valide une zone de travail avant d'utiliser le mode manuel de l'assistant IA.",
      ) as Error & { status?: number };
      error.status = 409;
      throw error;
    }

    const normalizedWorkspaceBounds: DroMapAiBounds = {
      south: workspaceBounds.south as number,
      west: workspaceBounds.west as number,
      north: workspaceBounds.north as number,
      east: workspaceBounds.east as number,
    };
    const outsideWorkspace = matched
      .filter((item) => item.coordinate)
      .filter(
        (item) =>
          !coordinateIsInsideBounds(
            item.coordinate as DroMapAiCoordinate,
            normalizedWorkspaceBounds,
          ),
      )
      .map((item) => item.requestedName);
    if (outsideWorkspace.length) {
      const error = new Error(
        `La zone de travail ne contient pas ${outsideWorkspace.join(", ")}. Agrandis ou redessine la zone, valide-la, puis relance l'assistant.`,
      ) as Error & { status?: number };
      error.status = 409;
      throw error;
    }
  }

  const rawCommands: unknown[] = [];

  const existingPopulationLayer = Array.isArray(context.layers)
    ? context.layers.find(
        (layer) =>
          isRecord(layer) &&
          normalizeKey(layer.name) === normalizeKey("Villes — population"),
      )
    : null;
  if (
    isRecord(existingPopulationLayer) &&
    asNullableString(existingPopulationLayer.id)
  ) {
    rawCommands.push({
      id: "nettoyage-ancien-calque-population",
      type: "delete_layer",
      explanation:
        "Remplacer proprement un ancien résultat IA de population au lieu de dupliquer les mêmes villes.",
      layerRef: asString(existingPopulationLayer.id),
    });
  }

  rawCommands.push(
    {
      id: "calque-villes-population",
      type: "create_layer",
      explanation: "Créer un calque dédié aux villes et à leurs populations.",
      layerName: "Villes — population",
    },
    {
      id: "marqueurs-population-villes",
      type: "create_proportional_markers",
      explanation:
        "Créer des cercles dont l'aire est proportionnelle à la population municipale.",
      layerRef: "calque-villes-population",
      proportionalMethod: "area",
      minSize: 28,
      maxSize: 110,
      symbolId: "circle",
      mapLabelVisibility: "show",
      legendTitle: "Population municipale",
      section: "Général",
      style: {
        color: "#dc2626",
        fillColor: "#dc2626",
        opacity: 1,
        fillOpacity: 0.72,
        markerFilled: true,
        weight: 3,
      },
      seriesItems: matched.map(
        ({ requestedName, fact, coordinate }, index) => ({
          id: `population-ville-${index + 1}`,
          label: requestedName,
          place: `${requestedName}, France`,
          coordinate,
          value: fact.value,
          unit: fact.unit ?? "habitants",
          date: fact.date,
          sourceTitle: fact.sourceTitle,
          sourceUrl: fact.sourceUrl,
        }),
      ),
    },
    {
      id: "legende-population-villes",
      type: "configure_legend",
      explanation:
        "Placer à droite une légende adaptée aux cercles proportionnels.",
      legendTitle: "Population municipale",
      legendPosition: "right",
    },
  );

  rawCommands.push({
    id: "recadrage-population-villes",
    type: "fit_view",
    explanation:
      workspaceMode === "manual"
        ? "Recadrer seulement la caméra sur les villes créées, sans modifier la zone validée par l'utilisateur."
        : "Recadrer la caméra sur les villes après la création automatique de la zone de travail.",
    zoom: 7,
  });

  const warnings: string[] = [];
  const commands = rawCommands.flatMap((command, index) => {
    const normalized = normalizeCommand(command, index, warnings);
    return normalized ? [normalized] : [];
  });
  const missing = names.filter(
    (name) =>
      !matched.some(
        (item) => normalizeKey(item.requestedName) === normalizeKey(name),
      ),
  );
  if (missing.length)
    warnings.push(`Population non trouvée pour : ${missing.join(", ")}.`);
  const missingCoordinates = matched
    .filter((item) => !item.coordinate)
    .map((item) => item.requestedName);
  if (missingCoordinates.length)
    warnings.push(
      `Coordonnées structurées non trouvées pour : ${missingCoordinates.join(", ")}. Le géocodage DroMap sera utilisé.`,
    );
  warnings.push(
    "Les populations proviennent de Wikidata : vérifie le périmètre administratif et la date avant un usage académique.",
  );

  return {
    summary:
      workspaceMode === "manual"
        ? `Créer ${matched.length} marqueurs urbains proportionnels dans la zone de travail existante et placer la légende à droite.`
        : `Créer ${matched.length} marqueurs urbains proportionnels, calculer automatiquement une zone autour d'eux et placer la légende à droite.`,
    warnings,
    facts: matched.map((item) => item.fact),
    sources: normalizeSources(sources),
    commands,
  };
}

function compactProjectContextForModel(
  context: Record<string, unknown>,
  prompt: string,
) {
  const terms = normalizeKey(prompt)
    .split(" ")
    .filter((term) => term.length >= 4);
  const features = Array.isArray(context.features)
    ? context.features.slice(0, 80)
    : [];
  const catalog = Array.isArray(context.catalog) ? context.catalog : [];
  const scoredCatalog = catalog
    .map((entry) => {
      if (!isRecord(entry)) return { entry, score: 0 };
      const haystack = normalizeKey(
        [
          entry.title,
          entry.description,
          entry.category,
          entry.geography,
          ...(Array.isArray(entry.keywords) ? entry.keywords : []),
        ].join(" "),
      );
      const score = terms.reduce(
        (total, term) => total + (haystack.includes(term) ? 1 : 0),
        0,
      );
      return { entry, score };
    })
    .sort((a, b) => b.score - a.score)
    .filter((item, index) => item.score > 0 || index < 18)
    .slice(0, 24)
    .map((item) => item.entry);

  return {
    basemapId: context.basemapId ?? null,
    workspaceBounds: context.workspaceBounds ?? null,
    workspaceValidated: context.workspaceValidated === true,
    currentZoom: context.currentZoom ?? null,
    activeLayerId: context.activeLayerId ?? null,
    layers: Array.isArray(context.layers) ? context.layers : [],
    geoJsonLayers: Array.isArray(context.geoJsonLayers)
      ? context.geoJsonLayers
      : [],
    customMarkers: Array.isArray(context.customMarkers)
      ? context.customMarkers
      : [],
    features,
    featureCount: context.featureCount ?? features.length,
    mapLabels: isRecord(context.mapLabels) ? context.mapLabels : {},
    catalog: scoredCatalog,
    legend: isRecord(context.legend) ? context.legend : {},
  };
}

function compactText(value: unknown, maxLength = 4_000) {
  return asString(value).replace(/\s+/g, " ").slice(0, maxLength);
}

function heuristicFreeResearchPlan(prompt: string): FreeResearchPlan {
  const stopWords = new Set([
    "met",
    "mets",
    "fait",
    "fais",
    "crée",
    "cree",
    "change",
    "ajoute",
    "affiche",
    "dimensionne",
    "carte",
    "légende",
    "legende",
    "marqueur",
    "marqueurs",
    "ville",
    "villes",
    "population",
    "droite",
    "gauche",
    "nord",
    "sud",
    "est",
    "ouest",
  ]);
  const matches =
    prompt.match(
      /\b[\p{Lu}À-ÖØ-Þ][\p{L}À-ÖØ-öø-ÿ'’-]*(?:\s+[\p{Lu}À-ÖØ-Þ][\p{L}À-ÖØ-öø-ÿ'’-]*)*/gu,
    ) ?? [];
  const names = Array.from(
    new Set(
      matches
        .map((item) => item.trim())
        .filter((item) => {
          const key = normalizeKey(item);
          return (
            key.length >= 2 && !stopWords.has(key) && !/^dromap$/i.test(item)
          );
        }),
    ),
  ).slice(0, 12);
  const populationRequest = /(population|habitant|démograph|demograph)/i.test(
    prompt,
  );
  return {
    language: "fr",
    wikipediaQueries: [prompt.slice(0, 300)],
    wikidataEntities: names.map((name) => ({
      name,
      country:
        /paris|marseille|marseilles|lyon|bordeaux|lille|toulouse|nice|nantes|strasbourg/i.test(
          name,
        )
          ? "France"
          : null,
      kind: populationRequest ? "city" : "other",
    })),
    worldBankIndicators: [],
  };
}

async function planFreeResearch(
  _apiKey: string,
  _model: string,
  prompt: string,
) {
  // Évite un premier appel Gemini avant la recherche : une seule requête
  // Gemini est nécessaire pour produire le plan final.
  return heuristicFreeResearchPlan(prompt);
}

function wikidataTime(claim: unknown) {
  if (!isRecord(claim) || !isRecord(claim.qualifiers)) return null;
  const values = claim.qualifiers.P585;
  if (!Array.isArray(values)) return null;
  for (const qualifier of values) {
    if (
      !isRecord(qualifier) ||
      !isRecord(qualifier.datavalue) ||
      !isRecord(qualifier.datavalue.value)
    )
      continue;
    const time = asNullableString(qualifier.datavalue.value.time);
    if (time) return time.replace(/^\+/, "").slice(0, 10);
  }
  return null;
}

function wikidataQuantity(claim: unknown) {
  if (
    !isRecord(claim) ||
    !isRecord(claim.mainsnak) ||
    !isRecord(claim.mainsnak.datavalue) ||
    !isRecord(claim.mainsnak.datavalue.value)
  )
    return null;
  const amount = asNumber(claim.mainsnak.datavalue.value.amount);
  return amount;
}

function wikidataCoordinate(claims: unknown): DroMapAiCoordinate | null {
  if (!Array.isArray(claims)) return null;
  for (const claim of claims) {
    if (
      !isRecord(claim) ||
      !isRecord(claim.mainsnak) ||
      !isRecord(claim.mainsnak.datavalue) ||
      !isRecord(claim.mainsnak.datavalue.value)
    )
      continue;
    const latitude = asNumber(claim.mainsnak.datavalue.value.latitude);
    const longitude = asNumber(claim.mainsnak.datavalue.value.longitude);
    if (latitude === null || longitude === null) continue;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)
      continue;
    return { lat: latitude, lng: longitude };
  }
  return null;
}

function latestQuantityClaim(claims: unknown) {
  if (!Array.isArray(claims)) return null;
  const candidates = claims.flatMap((claim) => {
    const value = wikidataQuantity(claim);
    if (value === null) return [];
    return [{ value, date: wikidataTime(claim), claim }];
  });
  candidates.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return candidates[0] ?? null;
}

async function fetchWikidataEntity(
  request: FreeResearchEntityRequest,
  language: string,
): Promise<FreeResearchBundle> {
  const search = await fetchExternalJson(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
      request.country ? `${request.name}, ${request.country}` : request.name,
    )}&language=${encodeURIComponent(language)}&uselang=${encodeURIComponent(language)}&limit=3&format=json&origin=*`,
  );
  const searchResults =
    isRecord(search) && Array.isArray(search.search) ? search.search : [];
  const first = searchResults.find(
    (item) => isRecord(item) && asNullableString(item.id),
  );
  if (!isRecord(first))
    return { summary: "", facts: [], sources: [], corpus: [] };
  const id = asString(first.id);
  const payload = await fetchExternalJson(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(id)}&props=labels|descriptions|claims|sitelinks&languages=${encodeURIComponent(language)}|en&sitefilter=${encodeURIComponent(language)}wiki|enwiki&format=json&origin=*`,
  );
  const entity =
    isRecord(payload) &&
    isRecord(payload.entities) &&
    isRecord(payload.entities[id])
      ? payload.entities[id]
      : null;
  if (!entity) return { summary: "", facts: [], sources: [], corpus: [] };
  const labels = isRecord(entity.labels) ? entity.labels : {};
  const descriptions = isRecord(entity.descriptions) ? entity.descriptions : {};
  const labelRecord = isRecord(labels[language])
    ? labels[language]
    : isRecord(labels.en)
      ? labels.en
      : null;
  const descriptionRecord = isRecord(descriptions[language])
    ? descriptions[language]
    : isRecord(descriptions.en)
      ? descriptions.en
      : null;
  const label = labelRecord
    ? asString(labelRecord.value, request.name)
    : request.name;
  const description = descriptionRecord
    ? asString(descriptionRecord.value)
    : "";
  const url = `https://www.wikidata.org/wiki/${id}`;
  const facts: DroMapAiFact[] = [];
  const claims = isRecord(entity.claims) ? entity.claims : {};
  const coordinate = wikidataCoordinate(claims.P625);
  const population = latestQuantityClaim(claims.P1082);
  if (population) {
    facts.push({
      subject: label,
      metric: "Population",
      value: population.value,
      unit: "habitants",
      date: population.date,
      location: request.country,
      sourceTitle: `Wikidata — ${label}`,
      sourceUrl: url,
      note: "Déclaration de population Wikidata ; vérifier le périmètre administratif et la source primaire indiquée dans la fiche.",
    });
  }
  const area = latestQuantityClaim(claims.P2046);
  if (area) {
    facts.push({
      subject: label,
      metric: "Superficie",
      value: area.value,
      unit: "km²",
      date: area.date,
      location: request.country,
      sourceTitle: `Wikidata — ${label}`,
      sourceUrl: url,
      note: null,
    });
  }
  return {
    summary: label,
    facts,
    sources: [
      {
        title: `Wikidata — ${label}`,
        url,
        publisher: "Wikimedia Foundation / contributeurs Wikidata",
        accessedAt: new Date().toISOString(),
        note: "Données structurées utilisées comme point de départ ; les sources primaires restent à vérifier pour un usage académique.",
      },
    ],
    corpus: [
      {
        title: `Wikidata — ${label}`,
        url,
        publisher: "Wikidata",
        text: compactText(
          `${label}. ${description}. Identifiant ${id}. Population structurée : ${population ? `${population.value} (${population.date ?? "date non indiquée"})` : "non disponible"}. Superficie : ${area ? `${area.value} km²` : "non disponible"}.`,
        ),
      },
    ],
    locations: coordinate ? [{ subject: label, coordinate }] : [],
  };
}

async function fetchWikipediaQuery(
  query: string,
  language: string,
): Promise<FreeResearchBundle> {
  const safeLanguage = /^[a-z]{2,3}$/.test(language) ? language : "fr";
  const payload = await fetchExternalJson(
    `https://${safeLanguage}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=2&prop=extracts|info&exintro=1&explaintext=1&inprop=url&format=json&formatversion=2&origin=*`,
  );
  const pages =
    isRecord(payload) &&
    isRecord(payload.query) &&
    Array.isArray(payload.query.pages)
      ? payload.query.pages
      : [];
  const corpus: FreeResearchBundle["corpus"] = [];
  const sources: DroMapAiSource[] = [];
  for (const page of pages.slice(0, 2)) {
    if (!isRecord(page)) continue;
    const title = asNullableString(page.title);
    const text = compactText(page.extract);
    const fullUrl =
      asNullableString(page.fullurl) ??
      (title
        ? `https://${safeLanguage}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`
        : null);
    if (!title || !fullUrl || !text) continue;
    corpus.push({
      title,
      url: fullUrl,
      text,
      publisher: `${safeLanguage}.wikipedia.org`,
    });
    sources.push({
      title,
      url: fullUrl,
      publisher: "Wikipédia",
      accessedAt: new Date().toISOString(),
      note: "Source de synthèse ; vérifier les références citées dans l'article pour un usage académique.",
    });
  }
  return { summary: query, facts: [], sources, corpus };
}

async function fetchWorldBankIndicator(
  request: FreeResearchWorldBankRequest,
): Promise<FreeResearchBundle> {
  const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(request.countryCode)}/indicator/${encodeURIComponent(request.indicator)}?format=json&per_page=12`;
  const payload = await fetchExternalJson(url);
  const rows =
    Array.isArray(payload) && Array.isArray(payload[1]) ? payload[1] : [];
  const row = rows.find(
    (item) => isRecord(item) && asNumber(item.value) !== null,
  );
  if (!isRecord(row))
    return { summary: "", facts: [], sources: [], corpus: [] };
  const value = asNumber(row.value);
  const country = isRecord(row.country)
    ? asString(row.country.value, request.countryCode)
    : request.countryCode;
  const date = asNullableString(row.date);
  const sourceUrl = `https://data.worldbank.org/indicator/${encodeURIComponent(request.indicator)}?locations=${encodeURIComponent(request.countryCode)}`;
  const fact: DroMapAiFact = {
    subject: country,
    metric: request.label,
    value,
    unit: null,
    date,
    location: country,
    sourceTitle: `Banque mondiale — ${request.label}`,
    sourceUrl,
    note: `Indicateur ${request.indicator}.`,
  };
  return {
    summary: request.label,
    facts: [fact],
    sources: [
      {
        title: `Banque mondiale — ${request.label}`,
        url: sourceUrl,
        publisher: "Banque mondiale",
        accessedAt: new Date().toISOString(),
        note: `Indicateur ${request.indicator}.`,
      },
    ],
    corpus: [
      {
        title: `Banque mondiale — ${request.label}`,
        url: sourceUrl,
        publisher: "Banque mondiale",
        text: `${country}: ${request.label} = ${value ?? "non disponible"}, année ${date ?? "non indiquée"}, indicateur ${request.indicator}.`,
      },
    ],
  };
}

function dedupeResearchBundle(bundle: FreeResearchBundle): FreeResearchBundle {
  const factKeys = new Set<string>();
  const sourceKeys = new Set<string>();
  const corpusKeys = new Set<string>();
  return {
    summary: bundle.summary,
    facts: bundle.facts.filter((fact) => {
      const key = `${normalizeKey(fact.subject)}|${normalizeKey(fact.metric)}|${fact.date ?? ""}|${String(fact.value)}`;
      if (factKeys.has(key)) return false;
      factKeys.add(key);
      return true;
    }),
    sources: bundle.sources.filter((source) => {
      if (sourceKeys.has(source.url)) return false;
      sourceKeys.add(source.url);
      return true;
    }),
    corpus: bundle.corpus
      .filter((item) => {
        if (corpusKeys.has(item.url)) return false;
        corpusKeys.add(item.url);
        return true;
      })
      .slice(0, 20),
  };
}

async function runFreeResearch(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<FreeResearchBundle> {
  const researchPlan = await planFreeResearch(apiKey, model, prompt);
  const jobs: Array<Promise<FreeResearchBundle>> = [];
  for (const entity of researchPlan.wikidataEntities)
    jobs.push(fetchWikidataEntity(entity, researchPlan.language));
  for (const query of researchPlan.wikipediaQueries)
    jobs.push(fetchWikipediaQuery(query, researchPlan.language));
  for (const indicator of researchPlan.worldBankIndicators)
    jobs.push(fetchWorldBankIndicator(indicator));
  const settled = await Promise.allSettled(jobs);
  const merged: FreeResearchBundle = {
    summary: "Recherche gratuite via Wikidata, Wikipédia et Banque mondiale.",
    facts: [],
    sources: [],
    corpus: [],
  };
  for (const item of settled) {
    if (item.status !== "fulfilled") continue;
    merged.facts.push(...item.value.facts);
    merged.sources.push(...item.value.sources);
    merged.corpus.push(...item.value.corpus);
  }
  return dedupeResearchBundle(merged);
}

function removeWorkspaceMutationCommands(
  plan: DroMapAiPlan,
  workspaceMode: "manual" | "automatic",
) {
  const removed = plan.commands.filter((command) =>
    FORBIDDEN_WORKSPACE_COMMANDS.has(command.type),
  );

  if (!removed.length) {
    return;
  }

  plan.commands = plan.commands.filter(
    (command) => !FORBIDDEN_WORKSPACE_COMMANDS.has(command.type),
  );
  plan.warnings.unshift(
    workspaceMode === "manual"
      ? "La zone manuelle est contrôlée uniquement par l'utilisateur : les commandes IA qui tentaient de la modifier ont été supprimées."
      : "En mode automatique, DroMap calcule lui-même la zone après la création des objets : les commandes de zone directes produites par l'IA ont été supprimées.",
  );
}

function ensurePopulationProportionalPlan(prompt: string, plan: DroMapAiPlan) {
  const normalizedPrompt = normalizeKey(prompt);
  if (
    !/(population|habitant|demograph|densite)/.test(normalizedPrompt) ||
    !/(marqueur|cercle|ville|metropole)/.test(normalizedPrompt)
  )
    return;
  if (
    plan.commands.some(
      (command) => command.type === "create_proportional_markers",
    )
  )
    return;
  const bySubject = new Map<string, DroMapAiFact>();
  for (const fact of plan.facts) {
    const value =
      typeof fact.value === "number" ? fact.value : asNumber(fact.value);
    if (
      value === null ||
      value < 0 ||
      !normalizeKey(fact.metric).includes("population")
    )
      continue;
    const subjectKey = normalizeKey(fact.subject);
    const subjectStem = subjectKey
      .replace(/s$/, "")
      .slice(0, Math.min(7, subjectKey.length));
    if (
      !subjectKey ||
      (!normalizedPrompt.includes(subjectKey) &&
        (subjectStem.length < 5 || !normalizedPrompt.includes(subjectStem)))
    )
      continue;
    const current = bySubject.get(subjectKey);
    if (!current || (fact.date ?? "") > (current.date ?? ""))
      bySubject.set(subjectKey, { ...fact, value });
  }
  if (bySubject.size < 2) return;
  const command = normalizeCommand(
    {
      id: "figurés-proportionnels-population",
      type: "create_proportional_markers",
      explanation:
        "Créer des marqueurs dont l'aire est proportionnelle à la population recherchée.",
      proportionalMethod: "area",
      minSize: 24,
      maxSize: 100,
      symbolId: "circle",
      style: { color: "#dc2626", markerFilled: true, weight: 3 },
      mapLabelVisibility: "show",
      legendTitle: "Population",
      section: "Population",
      seriesItems: Array.from(bySubject.values()).map((fact, index) => ({
        id: `population-${index + 1}`,
        label: fact.subject,
        place: fact.location
          ? `${fact.subject}, ${fact.location}`
          : fact.subject,
        value: fact.value,
        unit: fact.unit ?? "habitants",
        date: fact.date,
        sourceTitle: fact.sourceTitle,
        sourceUrl: fact.sourceUrl,
      })),
    },
    0,
    plan.warnings,
  );
  if (!command) return;
  const names = new Set(
    Array.from(bySubject.values()).map((fact) => normalizeKey(fact.subject)),
  );
  plan.commands = plan.commands.filter((existing) => {
    if (existing.type !== "create_marker") return true;
    return !names.has(normalizeKey(existing.label ?? existing.place));
  });
  const firstFitIndex = plan.commands.findIndex(
    (existing) => existing.type === "fit_view",
  );
  if (firstFitIndex >= 0) plan.commands.splice(firstFitIndex, 0, command);
  else plan.commands.push(command);
}

function promptExplicitlyRequestsMarkerSize(prompt: string) {
  const normalized = normalizeKey(prompt);

  if (/\b\d{1,4}\s*(?:px|pixel|pixels)\b/i.test(prompt)) {
    return true;
  }

  return (
    /\b(?:taille|diametre|diamètre|largeur)\b.{0,80}\b(?:marqueur|marqueurs|icone|icones|icône|icônes|pictogramme|pictogrammes|symbole|symboles)\b/i.test(
      prompt,
    ) ||
    /\b(?:marqueur|marqueurs|icone|icones|icône|icônes|pictogramme|pictogrammes|symbole|symboles)\b.{0,80}\b(?:taille|diametre|diamètre|grand|grands|grande|grandes|gros|grosse|grosses|petit|petits|petite|petites)\b/i.test(
      prompt,
    ) ||
    normalized.includes("figurés proportionnels") ||
    normalized.includes("figures proportionnels") ||
    normalized.includes("taille proportionnelle")
  );
}

function removeUnrequestedCategoricalMarkerSizes(
  prompt: string,
  plan: DroMapAiPlan,
) {
  if (promptExplicitlyRequestsMarkerSize(prompt)) {
    return;
  }

  for (const command of plan.commands) {
    if (
      command.type !== "create_marker" &&
      command.type !== "add_manual_legend_entry"
    ) {
      continue;
    }

    if (command.style.markerSize !== null) {
      command.style = {
        ...command.style,
        markerSize: null,
      };
    }
  }
}

function ensureLegendAndViewCommands(prompt: string, plan: DroMapAiPlan) {
  const normalizedPrompt = normalizeKey(prompt);
  const wantsLegend = /legende/.test(normalizedPrompt);
  if (
    wantsLegend &&
    !plan.commands.some((command) => command.type === "configure_legend")
  ) {
    const command = normalizeCommand(
      {
        id: "legende-ia",
        type: "configure_legend",
        explanation: "Configurer la légende demandée.",
        legendTitle: "Légende",
        legendPosition: /droite|right/.test(normalizedPrompt)
          ? "right"
          : /gauche|left/.test(normalizedPrompt)
            ? "left"
            : /bas|bottom/.test(normalizedPrompt)
              ? "bottom"
              : "right",
      },
      plan.commands.length,
      plan.warnings,
    );
    if (command) plan.commands.push(command);
  }
  const createsSpatialObjects = plan.commands.some((command) =>
    [
      "create_marker",
      "create_text",
      "create_line",
      "create_zone",
      "create_shape",
      "fill_boundary",
      "create_proportional_markers",
      "create_proportional_flows",
      "create_choropleth",
      "import_geojson_catalog",
      "import_geojson_url",
      "create_geojson_layer",
      "import_buildings",
    ].includes(command.type),
  );
  if (
    createsSpatialObjects &&
    !plan.commands.some((command) => command.type === "fit_view")
  ) {
    const fit = normalizeCommand(
      {
        id: "recadrage-ia",
        type: "fit_view",
        explanation: "Recadrer la vue sur le résultat créé.",
      },
      plan.commands.length,
      plan.warnings,
    );
    if (fit) plan.commands.push(fit);
  }

  plan.commands = plan.commands.filter(
    (command) => command.type !== "open_export_preview",
  );
}

async function reviseSinglePlanStep(
  apiKey: string,
  model: string,
  body: DroMapAiApiRequest,
  workspaceMode: "manual" | "automatic",
): Promise<DroMapAiApiResponse> {
  const revision = body.stepRevision;
  if (!revision || !isRecord(revision)) {
    throw Object.assign(new Error("Demande de modification d'étape invalide."), {
      status: 400,
    });
  }

  const instruction = asString(revision.instruction).slice(0, 6_000);
  if (!instruction) {
    throw Object.assign(new Error("Indique la modification à apporter à cette étape."), {
      status: 400,
    });
  }

  const normalizedPlan = normalizePlan(revision.plan);
  const requestedIndex = Number.isInteger(revision.commandIndex)
    ? revision.commandIndex
    : -1;
  const commandIndexById = normalizedPlan.commands.findIndex(
    (command) => command.id === asString(revision.commandId),
  );
  const commandIndex =
    commandIndexById >= 0
      ? commandIndexById
      : requestedIndex >= 0 && requestedIndex < normalizedPlan.commands.length
        ? requestedIndex
        : -1;

  if (commandIndex < 0) {
    throw Object.assign(new Error("L'étape à modifier n'existe plus dans le plan."), {
      status: 404,
    });
  }

  const currentCommand = normalizedPlan.commands[commandIndex];
  const previousCommand = normalizedPlan.commands[commandIndex - 1] ?? null;
  const nextCommand = normalizedPlan.commands[commandIndex + 1] ?? null;

  const revisionInput = `${COMMAND_REFERENCE}

MODE DE ZONE : ${workspaceMode === "automatic" ? "AUTOMATIQUE" : "MANUEL"}

CONTEXTE DROMAP ACTUEL :
${JSON.stringify(compactProjectContextForModel(body.context, instruction))}

PLAN GLOBAL — résumé :
${normalizedPlan.summary}

ÉTAPE PRÉCÉDENTE :
${JSON.stringify(previousCommand)}

ÉTAPE À MODIFIER :
${JSON.stringify(currentCommand)}

ÉTAPE SUIVANTE :
${JSON.stringify(nextCommand)}

DEMANDE DE MODIFICATION POUR CETTE SEULE ÉTAPE :
${instruction}

Retourne uniquement le JSON demandé avec une commande complète.`;

  const result = await callGemini(apiKey, {
    model,
    system_instruction: STEP_REVISION_SYSTEM_INSTRUCTIONS,
    input: revisionInput,
    response_format: {
      type: "text",
      mime_type: "application/json",
    },
    generation_config: {
      thinking_level: "low",
    },
    store: false,
  });

  const parsed = parseJsonText(result.text);
  const rawCommand =
    isRecord(parsed) && isRecord(parsed.command) ? parsed.command : parsed;
  const mergedCommand = isRecord(rawCommand)
    ? {
        ...currentCommand,
        ...rawCommand,
        id: currentCommand.id,
        style: isRecord(rawCommand.style)
          ? { ...currentCommand.style, ...rawCommand.style }
          : currentCommand.style,
        selector: isRecord(rawCommand.selector)
          ? { ...currentCommand.selector, ...rawCommand.selector }
          : currentCommand.selector,
        geoJsonStyle: isRecord(rawCommand.geoJsonStyle)
          ? { ...currentCommand.geoJsonStyle, ...rawCommand.geoJsonStyle }
          : currentCommand.geoJsonStyle,
      }
    : rawCommand;
  const revisionWarnings: string[] = [];
  const revisedCommand = normalizeCommand(
    mergedCommand,
    commandIndex,
    revisionWarnings,
  );

  if (!revisedCommand) {
    throw Object.assign(
      new Error(
        revisionWarnings[0] ??
          "Gemini n'a pas produit une commande DroMap exploitable pour cette étape.",
      ),
      { status: 422 },
    );
  }

  if (FORBIDDEN_WORKSPACE_COMMANDS.has(revisedCommand.type)) {
    throw Object.assign(
      new Error("Une étape du plan ne peut pas être transformée en modification de zone."),
      { status: 422 },
    );
  }

  revisedCommand.id = currentCommand.id;
  normalizedPlan.commands[commandIndex] = revisedCommand;
  normalizedPlan.warnings = [
    ...normalizedPlan.warnings,
    ...revisionWarnings,
  ].slice(0, 80);

  return {
    plan: normalizedPlan,
    model: result.model,
    grounded: false,
    revisedCommandId: revisedCommand.id,
  };
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey)
      return NextResponse.json(
        { error: "GEMINI_API_KEY est absente de .env.local." },
        { status: 500 },
      );
    const body = (await request.json()) as DroMapAiApiRequest;
    const prompt = asString(body.prompt).slice(0, MAX_PROMPT_LENGTH);
    if (!prompt)
      return NextResponse.json(
        { error: "La demande est vide." },
        { status: 400 },
      );
    if (!body.context || !isRecord(body.context))
      return NextResponse.json(
        { error: "Contexte DroMap manquant." },
        { status: 400 },
      );
    const workspaceMode =
      body.workspaceMode === "automatic" ? "automatic" : "manual";
    if (
      workspaceMode === "manual" &&
      (body.context.workspaceValidated !== true ||
        !body.context.workspaceBounds)
    ) {
      return NextResponse.json(
        {
          error:
            "Sélectionne puis valide une zone de travail avant d'utiliser le mode manuel de l'assistant IA.",
        },
        { status: 409 },
      );
    }

    const model = process.env.DROMAP_GEMINI_MODEL?.trim() || DEFAULT_MODEL;

    if (body.stepRevision) {
      const revisedResponse = await reviseSinglePlanStep(
        apiKey,
        model,
        body,
        workspaceMode,
      );
      return NextResponse.json(revisedResponse);
    }

    const legacyGrounding = (process.env.DROMAP_GEMINI_GROUNDING ?? "")
      .trim()
      .toLowerCase();
    const configuredResearchMode = (process.env.DROMAP_AI_RESEARCH_MODE ?? "")
      .trim()
      .toLowerCase();
    const researchMode =
      configuredResearchMode ||
      (legacyGrounding === "off"
        ? "off"
        : legacyGrounding === "always"
          ? "google"
          : "free");

    const fastPathPlan = await buildPopulationMarkerFastPath(
      prompt,
      body.context,
      workspaceMode,
    );
    if (fastPathPlan && fastPathPlan.commands.length) {
      const response: DroMapAiApiResponse = {
        plan: fastPathPlan,
        model: "DroMap démographie directe (Wikidata)",
        grounded: true,
      };
      return NextResponse.json(response);
    }

    let research: FreeResearchBundle = {
      summary: "",
      facts: [],
      sources: [],
      corpus: [],
    };
    let grounded = false;

    if (researchMode !== "off" && shouldResearch(prompt)) {
      try {
        if (researchMode === "google") {
          const googleResearch = await researchPrompt(apiKey, model, prompt);
          research = {
            ...googleResearch,
            corpus: [],
          };
        } else {
          research = await runFreeResearch(apiKey, model, prompt);
        }
        grounded =
          research.facts.length > 0 ||
          research.sources.length > 0 ||
          research.corpus.length > 0;
      } catch (error) {
        const provider =
          researchMode === "google"
            ? "Google Search"
            : "Wikidata/Wikipédia/Banque mondiale";
        research.summary = `La recherche ${provider} n'a pas pu être utilisée : ${error instanceof Error ? error.message : "erreur inconnue"}. Le plan sera produit avec le contexte DroMap et les connaissances du modèle.`;
      }
    }

    const planningResearch = {
      summary: research.summary,
      facts: research.facts,
      sources: research.sources,
      corpus: research.corpus.slice(0, 8).map((item) => ({
        title: item.title,
        url: item.url,
        publisher: item.publisher,
        text: item.text.slice(0, 1_800),
      })),
    };

    const planningInput = `${COMMAND_REFERENCE}\n\nMODE DE ZONE : ${workspaceMode === "automatic" ? "AUTOMATIQUE — aucune zone préalable ; DroMap la calculera après création des objets" : "MANUEL — la zone existante est validée et immuable"}\n\nCONTEXTE DROMAP ACTUEL :\n${JSON.stringify(compactProjectContextForModel(body.context, prompt))}\n\nRECHERCHE FACTUELLE :\n${JSON.stringify(planningResearch)}\n\nDEMANDE UTILISATEUR :\n${prompt}\n\nProduis maintenant le JSON final. Utilise uniquement les faits nécessaires. Place les sources et faits effectivement utilisés dans sources/facts.`;
    const result = await callGemini(apiKey, {
      model,
      system_instruction: SYSTEM_INSTRUCTIONS,
      input: planningInput,
      response_format: {
        type: "text",
        mime_type: "application/json",
      },
      generation_config: {
        thinking_level:
          (process.env.DROMAP_GEMINI_THINKING_LEVEL ?? "low")
            .trim()
            .toLowerCase() === "medium"
            ? "medium"
            : "low",
      },
      store: false,
    });
    const plan = normalizePlan(parseJsonText(result.text));
    removeWorkspaceMutationCommands(plan, workspaceMode);

    if (research.summary && !grounded) plan.warnings.unshift(research.summary);

    const mergedFacts = normalizeFacts([...research.facts, ...plan.facts]);
    const factKeys = new Set<string>();
    plan.facts = mergedFacts.filter((fact) => {
      const key = `${normalizeKey(fact.subject)}|${normalizeKey(fact.metric)}|${fact.date ?? ""}|${String(fact.value)}`;
      if (factKeys.has(key)) return false;
      factKeys.add(key);
      return true;
    });

    const mergedSources = normalizeSources([
      ...research.sources,
      ...plan.sources,
    ]);
    const sourceKeys = new Set<string>();
    plan.sources = mergedSources.filter((source) => {
      const key = source.url || normalizeKey(source.title);
      if (sourceKeys.has(key)) return false;
      sourceKeys.add(key);
      return true;
    });

    ensurePopulationProportionalPlan(prompt, plan);
    removeUnrequestedCategoricalMarkerSizes(prompt, plan);
    ensureLegendAndViewCommands(prompt, plan);

    if (!plan.commands.length)
      throw new Error("Gemini n'a produit aucune commande DroMap exploitable.");

    const response: DroMapAiApiResponse = {
      plan,
      model: result.model,
      grounded,
    };
    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Erreur inconnue de l'assistant IA.";
    const status =
      isRecord(error) &&
      typeof error.status === "number" &&
      error.status >= 400 &&
      error.status <= 599
        ? error.status
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
