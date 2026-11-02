import "server-only";
import OpenAI from "openai";
import type { AiModelChoice } from "@/editor/dromap-ai-router";

type StructuredRequest = {
  apiKey: string;
  choice: AiModelChoice;
  instructions: string;
  input: string;
  schema: Record<string, unknown>;
  schemaName: string;
  webSearch?: boolean;
};

export async function callStructuredOpenAi(request: StructuredRequest) {
  const client = new OpenAI({ apiKey: request.apiKey, timeout: 60_000, maxRetries: request.webSearch ? 0 : 1 });
  const parameters = {
    model: request.choice.model,
    reasoning: { effort: request.choice.reasoning },
    instructions: request.instructions,
    input: request.input,
    store: false,
    max_output_tokens: request.choice.level === "complex" || request.choice.level === "exceptional" ? 16_000 : 8_000,
    text: {
      format: {
        type: "json_schema" as const,
        name: request.schemaName,
        strict: true,
        schema: request.schema,
      },
    },
    ...(request.webSearch ? {
      tools: [{ type: "web_search" as const }],
      tool_choice: "required" as const,
      include: ["web_search_call.action.sources" as const],
    } : {}),
  };
  let response = await client.responses.create(parameters).catch((error: unknown) => { throw normalizeAiProviderError(error); });
  // An incomplete response is never an executable plan. Retry once with a
  // bounded reasoning budget; a blank sol response can be recovered by terra.
  if (response.status === "incomplete" && response.incomplete_details?.reason === "max_output_tokens") {
    response = await client.responses.create({
      ...parameters,
      model: request.choice.model === "gpt-5.6-sol" ? "gpt-5.6-terra" : request.choice.model,
      reasoning: { effort: "low" },
      max_output_tokens: 16_000,
    }).catch((error: unknown) => { throw normalizeAiProviderError(error); });
  }
  if (response.status !== "completed" || !response.output_text) {
    const tokenLimit = response.incomplete_details?.reason === "max_output_tokens";
    throw Object.assign(new Error("Réponse structurée incomplète."), {
      code: tokenLimit ? "AI_OUTPUT_LIMIT" : "AI_INCOMPLETE_RESPONSE",
      publicMessage: tokenLimit ? "Le fournisseur IA n’a pas terminé le plan dans le budget de génération, même après une nouvelle tentative. Aucune étape de ce plan n’a été exécutée." : "Le fournisseur IA a renvoyé un plan incomplet. Aucune étape de ce plan n’a été exécutée.",
      status: 502,
    });
  }
  const webSearched = response.output.some((item) => item.type === "web_search_call");
  if (request.webSearch && !webSearched) {
    throw Object.assign(new Error("Aucune recherche web n'a été exécutée."), { code: "AI_WEB_SEARCH_NOT_EXECUTED", publicMessage: "Le fournisseur IA n’a pas exécuté la recherche web demandée.", status: 502 });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.output_text);
  } catch {
    throw Object.assign(new Error("Réponse structurée invalide."), {
      code: "AI_INVALID_RESPONSE",
      publicMessage: "Le fournisseur IA a renvoyé un plan JSON invalide. Aucune étape de ce plan n’a été exécutée.",
      status: 502,
    });
  }
  return {
    parsed,
    model: response.model,
    webSearched,
  };
}

export function normalizeAiProviderError(error: unknown) {
  const value = error as { status?: number; code?: string; name?: string; request_id?: string };
  const timeout = /timeout/i.test(value?.name ?? "");
  const quota = /quota|billing|spend_limit/.test(value?.code ?? "");
  const status = timeout ? 504 : value?.status ?? 503;
  const code = timeout ? "AI_PROVIDER_TIMEOUT" : quota ? "AI_PROVIDER_QUOTA" : status === 429 ? "AI_PROVIDER_RATE_LIMIT"
    : status === 401 || status === 403 ? "AI_PROVIDER_ACCESS" : status >= 500 ? "AI_PROVIDER_UNAVAILABLE" : "AI_PROVIDER_REQUEST";
  const publicMessage = timeout ? "Le fournisseur IA a dépassé le délai de réponse. Aucune modification n’a été appliquée."
    : quota ? "Le quota ou le budget du fournisseur IA est épuisé. Vérifie la configuration du compte API."
    : code === "AI_PROVIDER_ACCESS" ? "Le fournisseur IA refuse l’accès au modèle configuré. Vérifie la clé et les droits du compte API."
    : code === "AI_PROVIDER_REQUEST" ? "Le fournisseur IA a refusé les paramètres du plan. Cette erreur doit être corrigée dans la configuration de l’assistant."
    : code === "AI_PROVIDER_RATE_LIMIT" ? "La limite de requêtes du fournisseur IA est atteinte. Réessaie plus tard."
    : "Le fournisseur IA est temporairement indisponible.";
  return Object.assign(new Error(publicMessage), { code, status, publicMessage, requestId: value?.request_id ?? null });
}
