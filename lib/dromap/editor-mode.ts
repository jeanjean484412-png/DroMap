export type EditorMode = "navigation" | "workspace-select" | "edit";

export const EDITOR_MODE_LABELS: Record<EditorMode, string> = {
  navigation: "Navigation",
  "workspace-select": "Sélection zone",
  edit: "Édition",
};
