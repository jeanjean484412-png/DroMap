import type { DroMapAiCoordinate } from "./dromap-ai-types";

export function curvedFlowHandles(from: DroMapAiCoordinate, to: DroMapAiCoordinate): DroMapAiCoordinate[] {
  // Bend in Mercator space, as the editor does, rather than in screen pixels.
  const y = (lat: number) => Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * Math.PI / 360));
  const x1 = from.lng * Math.PI / 180, x2 = to.lng * Math.PI / 180;
  const y1 = y(from.lat), y2 = y(to.lat);
  const x = (x1 + x2) / 2 - (y2 - y1) * 0.2;
  const middleY = (y1 + y2) / 2 + (x2 - x1) * 0.2;
  return [from, { lng: x * 180 / Math.PI, lat: (2 * Math.atan(Math.exp(middleY)) - Math.PI / 2) * 180 / Math.PI }, to];
}
