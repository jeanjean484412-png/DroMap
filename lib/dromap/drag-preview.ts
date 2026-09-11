import type L from "leaflet";

export const DROMAP_FEATURE_BODY_DRAG_PREVIEW_EVENT =
  "dromap:feature-body-drag-preview";

export type FeatureBodyDragPreviewDetail = {
  featureId: string;
  sourceLayer: L.Layer;
  latDelta: number;
  lngDelta: number;
  /** Déplacement écran cumulé depuis le dernier frame de preview. */
  containerDeltaX?: number;
  containerDeltaY?: number;
  refreshEditHandles?: boolean;
};

export function dispatchFeatureBodyDragPreview(
  detail: FeatureBodyDragPreviewDetail,
): void {
  if (
    typeof window === "undefined" ||
    !Number.isFinite(detail.latDelta) ||
    !Number.isFinite(detail.lngDelta)
  ) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<FeatureBodyDragPreviewDetail>(
      DROMAP_FEATURE_BODY_DRAG_PREVIEW_EVENT,
      { detail },
    ),
  );
}
