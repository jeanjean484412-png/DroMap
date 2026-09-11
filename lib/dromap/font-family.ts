export const DROMAP_CSS_FONT_FAMILY =
  "var(--font-geist-sans), system-ui, sans-serif";

export function getDromapRuntimeFontFamily() {
  if (typeof document !== "undefined") {
    const configured = window
      .getComputedStyle(document.documentElement)
      .getPropertyValue("--font-geist-sans")
      .trim();
    if (configured) return `${configured}, system-ui, sans-serif`;
  }
  return "system-ui, sans-serif";
}
