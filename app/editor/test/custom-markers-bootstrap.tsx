"use client";

import { useEffect } from "react";

import { useEditorTestCustomMarkersStore } from "@/stores/editor-test-custom-markers";

export function CustomMarkersBootstrap() {
  const loadFromStorage = useEditorTestCustomMarkersStore(
    (state) => state.loadFromStorage,
  );

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  return null;
}
