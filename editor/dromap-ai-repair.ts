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
