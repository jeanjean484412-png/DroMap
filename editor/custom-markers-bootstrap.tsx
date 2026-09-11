"use client";

import { useEffect } from "react";

import { useEditorCustomMarkersStore } from "@/stores/editor-custom-markers";
import { useDromapProductRuntime } from "@/components/dromap-product/product-runtime";

export function CustomMarkersBootstrap() {
  const runtime = useDromapProductRuntime();
  const loadFromStorage = useEditorCustomMarkersStore(
    (state) => state.loadFromStorage,
  );
  const setLibraryPersistenceEnabled = useEditorCustomMarkersStore(
    (state) => state.setLibraryPersistenceEnabled,
  );

  useEffect(() => {
    const persistenceEnabled =
      !runtime.enabled || runtime.capabilities.canSaveCustomMarkersToLibrary;
    setLibraryPersistenceEnabled(persistenceEnabled);
    if (persistenceEnabled) {
      loadFromStorage();
    }
  }, [
    loadFromStorage,
    runtime.capabilities.canSaveCustomMarkersToLibrary,
    runtime.enabled,
    setLibraryPersistenceEnabled,
  ]);

  return null;
}
