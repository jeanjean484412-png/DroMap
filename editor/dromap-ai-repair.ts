import type { DroMapAiPlan } from "./dromap-ai-types";

export function preservePlanRepair(original: DroMapAiPlan, revision: DroMapAiPlan, invalidIds: string[]) {
  const ids = new Set(invalidIds);
  const replacements = new Map(revision.commands.map(command => [command.id, command]));
  const commands = original.commands.map(command => ids.has(command.id) ? replacements.get(command.id) ?? command : command);
  if (ids.has("__intent__")) {
    const existing = new Set(commands.map(command => command.id));
    commands.push(...revision.commands.filter(command => !existing.has(command.id)));
  }
  return { ...original, commands };
}

export async function repairWithValidation<T, TIssue>(options: {
  initial: unknown;
  inspect: (candidate: unknown) => { value: T; issues: TIssue[] };
  repair: (candidate: unknown, issues: TIssue[], attempt: number) => Promise<unknown>;
  maxRepairs?: number;
}) {
  let candidate = options.initial;
  const maxRepairs = options.maxRepairs ?? 2;
  for (let attempt = 0; attempt <= maxRepairs; attempt += 1) {
    const inspected = options.inspect(candidate);
    if (!inspected.issues.length || attempt === maxRepairs) {
      return { ...inspected, repairs: attempt };
    }
    candidate = await options.repair(candidate, inspected.issues, attempt + 1);
  }
  throw new Error("Validation du plan interrompue.");
}
