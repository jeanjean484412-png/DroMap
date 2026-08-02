"use client";

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { ImageOverlay, Pane, Rectangle, useMap } from "react-leaflet";

import type { DromapBasemapConfig } from "@/lib/dromap/basemap";
import {
  DROMAP_FULL_WORLD_WORKSPACE_BOUNDS,
  toLatLngBounds,
} from "@/lib/dromap/workspace-bounds";
import { useEditorTestWorldSnapshotStore } from "@/stores/editor-test-world-snapshot";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

import {
  getWorldBasemapSnapshot,
  type WorldBasemapSnapshot,
} from "./world-basemap-snapshot";

const WORLD_SNAPSHOT_PANE = "dromapWorldBasemapSnapshotPane";
const WORLD_FIT_PADDING: [number, number] = [32, 32];

export function WorldBasemapSnapshotLayer({
  basemap,
}: {
  basemap: DromapBasemapConfig;
}) {
  const map = useMap();
  const workspaceBasemapBaseZoom = useEditorTestWorkspaceStore(
    (state) => state.workspaceBasemapBaseZoom,
  );
  const setWorldSnapshotStatus = useEditorTestWorldSnapshotStore(
    (state) => state.setWorldSnapshotStatus,
  );
  const [snapshot, setSnapshot] = useState<WorldBasemapSnapshot | null>(null);
  const [hasError, setHasError] = useState(false);
  const worldBoundsExpression = useMemo(
    () => toLatLngBounds(DROMAP_FULL_WORLD_WORKSPACE_BOUNDS),
    [],
  );

  useEffect(() => {
    let isCancelled = false;
    const worldBounds = L.latLngBounds(worldBoundsExpression);
    const automaticDetailZoom = map.getBoundsZoom(
      worldBounds,
      false,
      L.point(WORLD_FIT_PADDING[0] * 2, WORLD_FIT_PADDING[1] * 2),
    );
    const detailLeafletZoom =
      typeof workspaceBasemapBaseZoom === "number" &&
      Number.isFinite(workspaceBasemapBaseZoom)
        ? workspaceBasemapBaseZoom
        : automaticDetailZoom;

    setSnapshot(null);
    setHasError(false);
    setWorldSnapshotStatus({
      basemapId: basemap.id,
      status: "loading",
    });

    getWorldBasemapSnapshot(basemap, detailLeafletZoom)
      .then((nextSnapshot) => {
        if (isCancelled) {
          return;
        }

        setSnapshot(nextSnapshot);
        setHasError(false);
        setWorldSnapshotStatus({
          basemapId: basemap.id,
          status: "ready",
        });
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }

        const errorMessage =
          error instanceof Error
            ? error.message
            : "Impossible de préparer le fond monde.";

        console.error("Fond monde figé impossible à générer :", error);
        setSnapshot(null);
        setHasError(true);
        setWorldSnapshotStatus({
          basemapId: basemap.id,
          status: "error",
          errorMessage,
        });
      });

    return () => {
      isCancelled = true;
    };
  }, [
    basemap,
    map,
    setWorldSnapshotStatus,
    workspaceBasemapBaseZoom,
    worldBoundsExpression,
  ]);

  if (hasError) {
    return null;
  }

  return (
    <Pane
      name={WORLD_SNAPSHOT_PANE}
      style={{ zIndex: 200, pointerEvents: "none" }}
    >
      <Rectangle
        bounds={worldBoundsExpression}
        pathOptions={{
          stroke: false,
          fill: true,
          fillColor: basemap.exportBackground,
          fillOpacity: 1,
          interactive: false,
        }}
      />

      {snapshot ? (
        <ImageOverlay
          key={`${basemap.id}-${snapshot.url}`}
          url={snapshot.url}
          bounds={worldBoundsExpression}
          opacity={1}
          interactive={false}
          crossOrigin="anonymous"
          zIndex={200}
        />
      ) : null}
    </Pane>
  );
}
