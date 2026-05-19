import type L from "leaflet";

type MapNavigationSnapshot = {
  dragging: boolean;
  scrollWheelZoom: boolean;
  doubleClickZoom: boolean;
  boxZoom: boolean;
  keyboard: boolean;
  touchZoom: boolean;
};

let snapshot: MapNavigationSnapshot | null = null;

function readSnapshot(map: L.Map): MapNavigationSnapshot {
  return {
    dragging: map.dragging.enabled(),
    scrollWheelZoom: map.scrollWheelZoom.enabled(),
    doubleClickZoom: map.doubleClickZoom.enabled(),
    boxZoom: map.boxZoom.enabled(),
    keyboard: map.keyboard.enabled(),
    touchZoom: map.touchZoom.enabled(),
  };
}

/** Désactive pan/zoom clavier/souris/tactile (mode édition figé). */
export function freezeMapNavigation(map: L.Map): void {
  if (snapshot) return;

  snapshot = readSnapshot(map);

  map.dragging.disable();
  map.scrollWheelZoom.disable();
  map.doubleClickZoom.disable();
  map.boxZoom.disable();
  map.keyboard.disable();
  map.touchZoom.disable();
}

/** Restaure l’état de navigation enregistré avant le gel. */
export function unfreezeMapNavigation(map: L.Map): void {
  if (!snapshot) return;

  if (snapshot.dragging) map.dragging.enable();
  else map.dragging.disable();

  if (snapshot.scrollWheelZoom) map.scrollWheelZoom.enable();
  else map.scrollWheelZoom.disable();

  if (snapshot.doubleClickZoom) map.doubleClickZoom.enable();
  else map.doubleClickZoom.disable();

  if (snapshot.boxZoom) map.boxZoom.enable();
  else map.boxZoom.disable();

  if (snapshot.keyboard) map.keyboard.enable();
  else map.keyboard.disable();

  if (snapshot.touchZoom) map.touchZoom.enable();
  else map.touchZoom.disable();

  snapshot = null;
}
