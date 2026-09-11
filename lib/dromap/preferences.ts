import type { DromapBasemapId } from "@/lib/dromap/basemap";
export type DromapProjectSortPreference = "updated-desc" | "name-asc" | "created-desc";
export type DromapDashboardViewPreference = "grid" | "list";
export type DromapQuickStartBasemapPreference =
  | "openfreemap-liberty"
  | "openfreemap-positron"
  | "blank-white";
export type DromapScaleUnitsPreference = "metric" | "imperial";

export type DromapResolvedPreferences = {
  projectSort: DromapProjectSortPreference;
  dashboardView: DromapDashboardViewPreference;
  skipProjectSetup: boolean;
  quickStartBasemapId: DromapQuickStartBasemapPreference;
  quickStartCreateLayer1: boolean;
  scaleUnits: DromapScaleUnitsPreference;
  reduceMotion: boolean;
};

export function resolveDromapPreferences(
  preferences: Record<string, unknown> | null | undefined,
): DromapResolvedPreferences {
  const source = preferences ?? {};

  const projectSort =
    source.projectSort === "name-asc" || source.projectSort === "created-desc"
      ? source.projectSort
      : "updated-desc";
  const dashboardView = source.dashboardView === "list" ? "list" : "grid";
  const quickStartBasemapId =
    source.quickStartBasemapId === "openfreemap-positron" ||
    source.quickStartBasemapId === "blank-white"
      ? source.quickStartBasemapId
      : "openfreemap-liberty";
  const scaleUnits = source.scaleUnits === "imperial" ? "imperial" : "metric";


  return {
    projectSort,
    dashboardView,
    skipProjectSetup: source.skipProjectSetup === true,
    quickStartBasemapId,
    quickStartCreateLayer1: source.quickStartCreateLayer1 !== false,
    scaleUnits,
    reduceMotion: source.reduceMotion === true,
  };
}

export function isQuickStartBasemapId(value: DromapBasemapId): value is DromapQuickStartBasemapPreference {
  return (
    value === "openfreemap-liberty" ||
    value === "openfreemap-positron" ||
    value === "blank-white"
  );
}
