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
  const client = new OpenAI({ apiKey: request.apiKey, timeout: 48_000, maxRetries: 0 });
  const response = await client.responses.create({
    model: request.choice.model,
    reasoning: { effort: request.choice.reasoning },
    instructions: request.instructions,
    input: request.input,
    store: false,
    max_output_tokens: request.choice.level === "complex" || request.choice.level === "exceptional" ? 14_000 : 8_000,
    text: {
      format: {
        type: "json_schema",
        name: request.schemaName,
        strict: true,
        schema: request.schema,
      },
    },
    ...(request.webSearch ? { tools: [{ type: "web_search" as const }] } : {}),
  });
  if (response.status !== "completed" || !response.output_text) {
    throw Object.assign(new Error("Réponse structurée incomplète."), {
      code: "AI_INCOMPLETE_RESPONSE",
      status: 502,
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.output_text);
  } catch {
    throw Object.assign(new Error("Réponse structurée invalide."), {
      code: "AI_INVALID_RESPONSE",
      status: 502,
    });
  }
  return {
    parsed,
    model: response.model,
    webSearched: response.output.some((item) => item.type === "web_search_call"),
  };
}
