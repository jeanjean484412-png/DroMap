import type L from "leaflet";

const DATA_BELOW_BASEMAP_SYMBOLS_PANE = "dromapDataBelowBasemapSymbolsPane";
export const BASEMAP_SYMBOLS_PANE = "dromapBasemapSymbolsPane";
const DATA_PANE_Z_INDEX = { geojson: "0", features: "1" };

export function getBasemapSymbolsPane(map: L.Map) {
  const pane = map.getPane(BASEMAP_SYMBOLS_PANE) ?? map.createPane(BASEMAP_SYMBOLS_PANE);
  pane.style.zIndex = "420";
  pane.style.pointerEvents = "none";
  return pane;
}

export function getDataBelowBasemapSymbolsPane(map: L.Map, kind: keyof typeof DATA_PANE_Z_INDEX) {
  // Le parent fixe la position du groupe même lorsque l’ordre interne des calques change.
  const parent = map.getPane(DATA_BELOW_BASEMAP_SYMBOLS_PANE) ??
    map.createPane(DATA_BELOW_BASEMAP_SYMBOLS_PANE);
  parent.style.zIndex = "410";
  parent.style.pointerEvents = "none";

  const name = `${DATA_BELOW_BASEMAP_SYMBOLS_PANE}-${kind}`;
  const pane = map.getPane(name) ?? map.createPane(name, parent);
  pane.style.zIndex = DATA_PANE_Z_INDEX[kind];
  pane.style.pointerEvents = "none";
  return pane;
}

export function placeFeaturePane(map: L.Map, name: string, belowBasemapLabels: boolean) {
  const parent = belowBasemapLabels
    ? getDataBelowBasemapSymbolsPane(map, "features")
    : map.getPane("mapPane");
  const pane = map.getPane(name) ?? map.createPane(name, parent);
  if (parent && pane.parentElement !== parent) parent.appendChild(pane);
  return pane;
}
