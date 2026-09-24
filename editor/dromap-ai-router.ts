import type { DroMapAiProjectContext } from "./dromap-ai-types";

export type AiComplexity = "rapid" | "standard" | "complex" | "exceptional";
export type AiModelChoice = {
  level: AiComplexity;
  model: "gpt-5.6-luna" | "gpt-5.6-terra" | "gpt-5.6-sol";
  reasoning: "low" | "medium" | "high" | "xhigh";
  reasons: string[];
};

export function chooseAiModel(
  prompt: string,
  context: Pick<DroMapAiProjectContext, "featureCount" | "geoJsonLayers">,
  options: { repairing?: boolean; stepRevision?: boolean } = {},
): AiModelChoice {
  const text = prompt.trim().toLocaleLowerCase("fr");
  let score = 0;
  const reasons: string[] = [];
  function add(points: number, reason: string, pattern: RegExp) {
    if (pattern.test(text)) {
      score += points;
      reasons.push(reason);
    }
  }
  if (text.length > 400) { score += 2; reasons.push("demande longue"); }
  else if (text.length > 160) { score += 1; reasons.push("demande détaillée"); }
  if ((text.match(/\b(et|puis|ensuite|aussi|ainsi que)\b/g) ?? []).length >= 2) {
    score += 2; reasons.push("plusieurs actions liées");
  }
  add(5, "carte complète", /\b(fais|crée|cree|construis|réalise|realise)\b.{0,30}\b(carte|atlas)\b/);
  add(4, "bâtiments ou routes", /\b(bâtiments?|batiments?|édifices?|edifices?|autoroutes?|routes?|voirie|réseau routier)\b/);
  add(4, "données et import", /\b(geojson|importe[rz]?|importation|choropl[eè]the|données|statistique|flux proportionnel)\b/);
  add(4, "recherche ou contexte historique", /\b(histoire|historique|guerre|crise|traité|traite|pacte|alliance|otan|actuel|aujourd'hui|ministère|ministere|cherche|recherche)\b/);
  add(4, "marqueur personnalisé", /\b(marqueur personnalisé|pictogramme sur mesure|dessine un symbole)\b/);
  add(2, "légende", /\b(légende|legende)\b/);
  add(1, "composition cartographique", /\b(titre|échelle|echelle|nord|rendu)\b/);
  add(2, "plusieurs lieux", /\b(pays|villes|régions|regions|plusieurs lieux|tous les)\b/);
  add(1, "géométrie spatiale", /\b(zone|frontière|frontiere|portée|portee|tracé|trace|courbe)\b/);
  if (context.featureCount > 100 || context.geoJsonLayers.length > 3) {
    score += 1; reasons.push("projet chargé");
  }
  if (options.stepRevision) score = Math.max(score, 1);
  if (options.repairing) { score += 2; reasons.push("réparation d'un plan"); }

  if (score >= 11 && options.repairing) return {
    level: "exceptional", model: "gpt-5.6-sol", reasoning: "xhigh", reasons,
  };
  if (score >= 6) return {
    level: "complex", model: "gpt-5.6-sol", reasoning: "high", reasons,
  };
  if (score >= 2) return {
    level: "standard", model: "gpt-5.6-terra", reasoning: "medium", reasons,
  };
  return { level: "rapid", model: "gpt-5.6-luna", reasoning: "low", reasons: reasons.length ? reasons : ["action simple"] };
}
