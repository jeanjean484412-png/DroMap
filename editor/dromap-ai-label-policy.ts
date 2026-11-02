import type { DroMapAiPlan } from "./dromap-ai-types";

function normalized(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function explicitlyRequestsMapLabels(prompt: string) {
  const text = normalized(prompt);
  if (/\b(sans|masque|cache|supprime|retire)\b.{0,35}\b(etiquettes?|labels?|noms?)\b/.test(text)) return false;
  return /\b(etiquettes?|labels?|noms?)\b/.test(text);
}

export function enforceMapLabelDefaults(prompt: string, plan: DroMapAiPlan) {
  const text = normalized(prompt);
  const show = explicitlyRequestsMapLabels(prompt);
  const mentionsLabels = /\b(etiquettes?|labels?|noms?)\b/.test(text);
  const globallyRequestsLabels = /\b(toutes? les etiquettes?|etiquettes? de la carte|tous les noms? de la carte)\b/.test(text);
  const customSize = !/\b(?:taille|police) (?:normale|habituelle|standard)\b/.test(text) && /(?:\b(taille|dimension|police|fontsize)\b.{0,30}\b(etiquettes?|labels?|noms?)\b|\b(etiquettes?|labels?|noms?)\b.{0,30}\b(taille|dimension|police|fontsize)\b)/.test(text);
  if (!globallyRequestsLabels) plan.commands = plan.commands.filter((command) => command.type !== "configure_map_labels");
  for (const command of plan.commands) {
    if (["create_marker", "create_marker_series", "create_proportional_markers", "create_proportional_flows", "create_line", "create_zone", "create_shape", "fill_boundary", "trace_boundary", "import_buildings"].includes(command.type)) {
      const pointCommand = ["create_marker", "create_marker_series", "create_proportional_markers"].includes(command.type);
      const hasPoints = plan.commands.some(item => ["create_marker", "create_marker_series", "create_proportional_markers"].includes(item.type));
      const surfaceNames = /\b(?:noms?|etiquettes?) (?:des |de la |du )?(?:pays|regions?|departements?|zones?|territoires?)\b/.test(text);
      command.mapLabelVisibility = show && (globallyRequestsLabels || pointCommand || surfaceNames || !hasPoints) ? "show" : "hide";
      if (!customSize) command.style.fontSize = null;
    }
    if (!mentionsLabels && command.type === "update_features") command.mapLabelVisibility = null;
  }
  if (/\bcourbes?\b/.test(text) && !/\b(?:sans|pas de|non)\s+(?:fleches?\s+)?courbes?\b/.test(text)) {
    for (const command of plan.commands) {
      if (command.type === "create_proportional_flows") command.lineVariant = "curved";
    }
  }
  if (!customSize) {
    for (const command of plan.commands) {
      if (command.type === "configure_map_labels") command.mapLabelScale = null;
    }
  }
}
