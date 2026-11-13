"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getLoadedMarkerCatalog, loadMarkerSymbolCatalog, subscribeMarkerCatalog } from "./marker-symbol";

function getServerCatalog() {
  return undefined;
}

function subscribeToNothing() {
  return () => undefined;
}

export function useMarkerSymbolCatalog(needed: boolean) {
  const catalog = useSyncExternalStore(
    needed ? subscribeMarkerCatalog : subscribeToNothing,
    getLoadedMarkerCatalog,
    getServerCatalog,
  );
  useEffect(() => {
    if (needed && !catalog) {
      void loadMarkerSymbolCatalog().catch((error) => console.error("DroMap: bibliothèque de symboles indisponible", error));
    }
  }, [catalog, needed]);
  return catalog;
}
