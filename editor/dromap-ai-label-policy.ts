import type { DroMapAiPlan } from "./dromap-ai-types";

function normalized(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function explicitlyRequestsMapLabels(prompt: string) {
  const text = normalized(prompt);
  if (/\b(sans|masque|cache|supprime|retire)\b.{0,35}\b(etiquettes?|labels?|noms?)\b/.test(text)) return false;
  return /\b(etiquettes?|labels?|noms? des (?:villes|capitales|usines)|avec (?:leurs?|les) noms?|affiche(?:r)? les noms?)\b/.test(text);
}

export function enforceMapLabelDefaults(prompt: string, plan: DroMapAiPlan) {
  const text = normalized(prompt);
  const show = explicitlyRequestsMapLabels(prompt);
  const mentionsLabels = /\b(etiquettes?|labels?|noms? des (?:villes|capitales|usines)|affiche(?:r)? les noms?)\b/.test(text);
  const globallyRequestsLabels = /\b(toutes? les etiquettes?|etiquettes? de la carte|tous les noms? de la carte)\b/.test(text);
  const customSize = /\b(taille|dimension|police|fontsize)\b.{0,30}\b(etiquettes?|labels?|noms?)\b|\b(etiquettes?|labels?|noms?)\b.{0,30}\b(taille|dimension|police|fontsize)\b/.test(text);
  if (!globallyRequestsLabels) plan.commands = plan.commands.filter((command) => command.type !== "configure_map_labels");
  for (const command of plan.commands) {
    if (["create_marker", "create_marker_series", "create_proportional_markers"].includes(command.type)) {
      command.mapLabelVisibility = show ? "show" : "hide";
      if (!customSize) command.style.fontSize = null;
    }
    if (!mentionsLabels && command.type === "update_features") command.mapLabelVisibility = null;
  }
  if (!customSize) {
    for (const command of plan.commands) {
      if (command.type === "configure_map_labels") command.mapLabelScale = null;
    }
  }
}
