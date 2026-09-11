import DOMPurify from "dompurify";

export function sanitizeMarkerSvg(markup: string): string | null {
  if (markup.length > 2_000_000 || typeof DOMPurify.sanitize !== "function") return null;
  const fragment = DOMPurify.sanitize(markup, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["style", "foreignObject", "image", "use", "a", "animate", "animateMotion", "animateTransform", "set"],
    FORBID_ATTR: ["style", "href", "xlink:href"],
    RETURN_DOM_FRAGMENT: true,
  });
  const svg = fragment.firstElementChild;
  if (!svg || svg.localName !== "svg") return null;
  for (const element of [svg, ...Array.from(svg.querySelectorAll("*"))]) {
    for (const name of ["fill", "stroke", "filter", "clip-path", "mask", "cursor"]) {
      const value = element.getAttribute(name);
      if (value && /url|\\|[<>]/i.test(value) && !/^url\(#[a-zA-Z0-9_-]+\)$/.test(value)) {
        element.removeAttribute(name);
      }
    }
  }
  return svg.outerHTML;
}
