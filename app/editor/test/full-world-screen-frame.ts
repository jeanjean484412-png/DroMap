import type L from "leaflet";

export type FullWorldBoundsNumbers = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type FullWorldScreenFrame = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

/**
 * Projection écran courante de la zone géographique « Monde entier ».
 *
 * Elle dépend volontairement du zoom et du déplacement Leaflet, exactement
 * comme le rectangle d’une zone tracée manuellement. Le bouton Monde ne fait
 * donc qu’automatiser la sélection des bornes ; il ne fige jamais le cadre à
 * l’écran.
 */
export function getFullWorldScreenFrame(
  map: L.Map,
  bounds: FullWorldBoundsNumbers,
): FullWorldScreenFrame {
  const size = map.getSize();
  const northWest = map.latLngToContainerPoint([bounds.north, bounds.west]);
  const southEast = map.latLngToContainerPoint([bounds.south, bounds.east]);
  const rawLeft = Math.min(northWest.x, southEast.x);
  const rawRight = Math.max(northWest.x, southEast.x);
  const rawTop = Math.min(northWest.y, southEast.y);
  const rawBottom = Math.max(northWest.y, southEast.y);
  const left = Math.max(0, Math.min(size.x, rawLeft));
  const right = Math.max(0, Math.min(size.x, rawRight));
  const top = Math.max(0, Math.min(size.y, rawTop));
  const bottom = Math.max(0, Math.min(size.y, rawBottom));

  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

export function isContainerPointInsideFullWorldFrame(
  point: { x: number; y: number },
  frame: FullWorldScreenFrame,
) {
  return (
    point.x >= frame.left &&
    point.x <= frame.right &&
    point.y >= frame.top &&
    point.y <= frame.bottom
  );
}
