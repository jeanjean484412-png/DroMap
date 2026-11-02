import type { DroMapAiFact, DroMapAiSource } from "@/editor/dromap-ai-types";

type CorpusItem = { url: string; text: string };
const normalize = (text: string) => text.replace(/\s+/g, " ").trim().toLocaleLowerCase();

// Fallback search hits are candidates, not proof. Keep only facts backed by
// an actual passage retrieved from the same URL, never a model-invented URL.
export function filterResearchEvidence(facts: DroMapAiFact[], sources: DroMapAiSource[], corpus: CorpusItem[]) {
  const verified = facts.filter(fact => fact.sourceUrl && fact.note && normalize(fact.note).length >= 20 &&
    corpus.some(item => item.url === fact.sourceUrl && normalize(item.text).includes(normalize(fact.note!))));
  const urls = new Set(verified.map(fact => fact.sourceUrl));
  return { facts: verified, sources: sources.filter(source => urls.has(source.url)) };
}
