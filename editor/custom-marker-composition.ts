import type { DroMapDrawnMarkerElement as Element } from "@/stores/editor-custom-markers";
import { measureMarkerText } from "./custom-marker-font";

export function markerElementBounds(element: Element) {
  if (element.type === "shape" || element.type === "text") {
    const cx = element.x + element.width / 2,
      cy = element.y + element.height / 2;
    const a = (element.rotation * Math.PI) / 180;
    const size =
      element.type === "text" &&
      !element.backgroundEnabled &&
      !element.borderEnabled
        ? measureMarkerText(element)
        : element;
    const w =
      Math.abs(Math.cos(a) * size.width) + Math.abs(Math.sin(a) * size.height);
    const h =
      Math.abs(Math.sin(a) * size.width) + Math.abs(Math.cos(a) * size.height);
    return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
  }
  const points =
    element.type === "path"
      ? element.points
      : [
          { x: element.x1, y: element.y1 },
          { x: element.x2, y: element.y2 },
        ];
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function translateMarkerElement(
  element: Element,
  dx: number,
  dy: number,
): Element {
  if (element.type === "shape" || element.type === "text")
    return { ...element, x: element.x + dx, y: element.y + dy };
  if (element.type === "path") {
    const move = (p: { x: number; y: number }) => ({
      x: p.x + dx,
      y: p.y + dy,
    });
    return {
      ...element,
      points: element.points.map(move),
      rawPoints: element.rawPoints?.map(move),
    };
  }
  return {
    ...element,
    x1: element.x1 + dx,
    x2: element.x2 + dx,
    y1: element.y1 + dy,
    y2: element.y2 + dy,
  };
}

export type MarkerAlignment =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "centerX"
  | "centerY";
export function alignMarkerElements(
  elements: Element[],
  ids: string[],
  direction: MarkerAlignment,
): Element[] {
  const selected = elements.filter((e) => ids.includes(e.id));
  if (!selected.length) return elements;
  // A group is one alignment unit: never pull its children apart.
  const units = new Map<string, Element[]>();
  for (const e of selected) {
    const key = e.groupId ?? e.id;
    units.set(key, [...(units.get(key) ?? []), e]);
  }
  const unitBounds = new Map(
    Array.from(units, ([key, items]) => {
      const boxes = items.map(markerElementBounds);
      const x = Math.min(...boxes.map((b) => b.x)),
        y = Math.min(...boxes.map((b) => b.y));
      return [
        key,
        {
          x,
          y,
          width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
          height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
        },
      ];
    }),
  );
  const bounds = [...unitBounds.values()];
  const left = Math.min(...bounds.map((b) => b.x)),
    right = Math.max(...bounds.map((b) => b.x + b.width));
  const top = Math.min(...bounds.map((b) => b.y)),
    bottom = Math.max(...bounds.map((b) => b.y + b.height));
  return elements.map((e) => {
    if (!ids.includes(e.id)) return e;
    const b = unitBounds.get(e.groupId ?? e.id)!;
    const x = units.size === 1 ? 180 : (left + right) / 2;
    const y = units.size === 1 ? 180 : (top + bottom) / 2;
    return translateMarkerElement(
      e,
      direction === "left"
        ? left - b.x
        : direction === "right"
          ? right - b.x - b.width
          : direction === "centerX"
            ? x - b.x - b.width / 2
            : 0,
      direction === "top"
        ? top - b.y
        : direction === "bottom"
          ? bottom - b.y - b.height
          : direction === "centerY"
            ? y - b.y - b.height / 2
            : 0,
    );
  });
}

export function markerElementLabel(e: Element) {
  if (e.groupId) return "Groupe";
  if (e.type === "text") return e.text || "Texte";
  if (e.type === "shape")
    return e.symbolId
      ? "Symbole"
      : {
          circle: "Cercle",
          ellipse: "Ellipse",
          rectangle: "Rectangle",
          triangle: "Triangle",
          diamond: "Losange",
          star: "Étoile",
        }[e.shape];
  return e.type === "arrow" || e.arrowEnd
    ? "Flèche"
    : e.type === "path" && e.closed
      ? "Polygone"
      : e.type === "path" && e.lineVariant === "curved"
        ? "Trait courbe"
      : "Ligne";
}
