import { getDromapRuntimeFontFamily } from "@/lib/dromap/font-family";
import type { DroMapDrawnMarkerTextElement } from "@/stores/editor-custom-markers";

let pending: Promise<string> | undefined;

export function getMarkerTextFontFamily() {
  // Next's metric-adjusted local fallback is for HTML layout, not SVG text.
  // Use Geist when available and the same native sans fallback in Fabric/SVG.
  return getDromapRuntimeFontFamily()
    .split(",")
    .filter((family) => !family.includes("Fallback"))
    .join(",");
}

export function measureMarkerText(element: DroMapDrawnMarkerTextElement) {
  const lines = element.text.split("\n");
  const measure =
    typeof document !== "undefined"
      ? document.createElement("canvas").getContext("2d")
      : null;
  if (measure)
    measure.font = `${element.fontWeight ?? 700} ${element.fontSize}px ${getMarkerTextFontFamily()}`;
  return {
    width: Math.max(
      1,
      ...lines.map(
        (line) =>
          measure?.measureText(line).width ??
          line.length * element.fontSize * 0.6,
      ),
    ),
    height: element.fontSize * 1.16 * lines.length,
  };
}

/** SVG images cannot inherit the page's web fonts. Embed the same local font. */
export function loadMarkerFontCss(): Promise<string> {
  return (pending ??= (async () => {
    await document.fonts.ready;
    const families = getMarkerTextFontFamily()
      .split(",")
      .map((family) => family.trim().replace(/["']/g, ""));
    const faces: CSSFontFaceRule[] = [];
    const visited = new Set<CSSStyleSheet>();
    function visit(sheet: CSSStyleSheet) {
      if (visited.has(sheet)) return;
      visited.add(sheet);
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        return;
      }
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSImportRule && rule.styleSheet)
          visit(rule.styleSheet);
        if (
          rule instanceof CSSFontFaceRule &&
          families.includes(
            rule.style
              .getPropertyValue("font-family")
              .replace(/["']/g, "")
              .trim(),
          )
        )
          faces.push(rule);
      }
    }
    Array.from(document.styleSheets).forEach(visit);
    // With no downloadable face (offline development), both renderers use
    // the same native sans fallback; do not block a valid composition.
    return (
      await Promise.all(
        faces.map(async (face) => {
          const src = face.style.getPropertyValue("src");
          const match = src.match(/url\(["']?([^"')]+)["']?\)/);
          if (!match) return face.cssText;
          const url = new URL(
            match[1],
            face.parentStyleSheet?.href ?? location.href,
          );
          if (url.origin !== location.origin)
            throw new Error("La police doit provenir de DroMap.");
          const response = await fetch(url);
          if (!response.ok)
            throw new Error("Impossible de préparer la police du marqueur.");
          const blob = await response.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          return face.cssText.replace(src, `url("${dataUrl}") format("woff2")`);
        }),
      )
    ).join("\n");
  })().catch((error) => {
    pending = undefined;
    throw error;
  }));
}
