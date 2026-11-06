import { DROMAP_BETA, DROMAP_BETA_PROJECT_LIMIT } from "./release-mode";

export function hasReachedDromapProjectQuota(state: {
  userMode: string;
  accountPlan: string;
  projects: readonly { status: string }[];
}) {
  // The server independently checks the plan stored in the billing account.
  return DROMAP_BETA &&
    !(state.userMode === "authenticated" && state.accountPlan === "tester") &&
    state.projects.filter((project) => project.status !== "trashed").length >= DROMAP_BETA_PROJECT_LIMIT;
}
