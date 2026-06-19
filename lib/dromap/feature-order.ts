import type { DroMapFeature } from "@/lib/dromap/feature";

export type DroMapFeatureDrawOrderAction =
  | "bring-forward"
  | "send-backward"
  | "bring-to-front"
  | "send-to-back";

const FEATURE_ORDER_STEP = 1000;

function isZoneFeature(feature: DroMapFeature) {
  return feature.properties.type === "zone";
}

function getFeatureLayerRenderOrder(feature: DroMapFeature) {
  const order = feature.properties.layerRenderOrder;

  return typeof order === "number" && Number.isFinite(order) ? order : 0;
}

function getExplicitFeatureOrder(feature: DroMapFeature) {
  const order = feature.properties.order;

  if (typeof order !== "number" || !Number.isFinite(order)) {
    return null;
  }

  return order;
}

function getNonZoneFeatureDrawOrder(feature: DroMapFeature, index = 0) {
  const explicitOrder = getExplicitFeatureOrder(feature);

  if (explicitOrder !== null) {
    return explicitOrder;
  }

  return (index + 1) * FEATURE_ORDER_STEP;
}

export function getFeatureDrawOrder(feature: DroMapFeature, index = 0) {
  if (isZoneFeature(feature)) {
    return index / 1000;
  }

  return getNonZoneFeatureDrawOrder(feature, index);
}

export function getFeaturesByDrawOrder(features: DroMapFeature[]) {
  return features
    .map((feature, index) => ({ feature, index }))
    .sort((a, b) => {
      const layerOrderDiff =
        getFeatureLayerRenderOrder(a.feature) -
        getFeatureLayerRenderOrder(b.feature);

      if (layerOrderDiff !== 0) {
        return layerOrderDiff;
      }

      const aIsZone = isZoneFeature(a.feature);
      const bIsZone = isZoneFeature(b.feature);

      if (aIsZone && !bIsZone) {
        return -1;
      }

      if (!aIsZone && bIsZone) {
        return 1;
      }

      if (aIsZone && bIsZone) {
        return a.index - b.index;
      }

      const orderDiff =
        getNonZoneFeatureDrawOrder(a.feature, a.index) -
        getNonZoneFeatureDrawOrder(b.feature, b.index);

      if (orderDiff !== 0) {
        return orderDiff;
      }

      return a.index - b.index;
    })
    .map((item) => item.feature);
}

function setFeatureOrder(feature: DroMapFeature, order: number): DroMapFeature {
  if (feature.properties.order === order) {
    return feature;
  }

  return {
    ...feature,
    properties: {
      ...feature.properties,
      order,
    },
  };
}

function removeFeatureOrder(feature: DroMapFeature): DroMapFeature {
  if (feature.properties.order === undefined) {
    return feature;
  }

  const nextProperties = { ...feature.properties };
  delete nextProperties.order;

  return {
    ...feature,
    properties: nextProperties,
  };
}

function normalizeNonZoneFeatureOrders(features: DroMapFeature[]) {
  return getFeaturesByDrawOrder(features)
    .filter((feature) => !isZoneFeature(feature))
    .map((feature, index) =>
      setFeatureOrder(feature, (index + 1) * FEATURE_ORDER_STEP),
    );
}

/**
 * Donne un ordre explicite à tous les objets non-zone.
 * Les zones restent volontairement sans ordre manipulable : elles sont
 * toujours rendues derrière tous les autres objets, dans l'éditeur comme
 * dans la preview et dans le PNG.
 */
export function normalizeFeatureDrawOrdersForPersistence(
  features: DroMapFeature[],
) {
  const normalizedNonZoneFeaturesById = new Map(
    normalizeNonZoneFeatureOrders(features).map((feature) => [
      feature.id,
      feature,
    ]),
  );

  return features.map((feature) => {
    if (isZoneFeature(feature)) {
      return removeFeatureOrder(feature);
    }

    return normalizedNonZoneFeaturesById.get(feature.id) ?? feature;
  });
}

export function reorderFeatureDrawOrder(
  features: DroMapFeature[],
  featureId: string,
  action: DroMapFeatureDrawOrderAction,
) {
  const normalizedFeatures = normalizeFeatureDrawOrdersForPersistence(features);
  const selectedFeature = normalizedFeatures.find(
    (feature) => feature.id === featureId,
  );

  if (!selectedFeature || isZoneFeature(selectedFeature)) {
    return features;
  }

  const normalizedNonZoneFeatures = normalizeNonZoneFeatureOrders(
    normalizedFeatures,
  );
  const selectedIndex = normalizedNonZoneFeatures.findIndex(
    (feature) => feature.id === featureId,
  );

  if (selectedIndex < 0) {
    return features;
  }

  const nextNonZoneFeatures = [...normalizedNonZoneFeatures];
  const [selectedNonZoneFeature] = nextNonZoneFeatures.splice(selectedIndex, 1);

  if (!selectedNonZoneFeature) {
    return features;
  }

  const insertionIndex =
    action === "send-to-back" || action === "send-backward"
      ? 0
      : nextNonZoneFeatures.length;

  nextNonZoneFeatures.splice(insertionIndex, 0, selectedNonZoneFeature);

  const updatedNonZoneFeaturesById = new Map(
    nextNonZoneFeatures.map((feature, index) => [
      feature.id,
      setFeatureOrder(feature, (index + 1) * FEATURE_ORDER_STEP),
    ]),
  );

  return normalizedFeatures.map((feature) => {
    if (isZoneFeature(feature)) {
      return removeFeatureOrder(feature);
    }

    return updatedNonZoneFeaturesById.get(feature.id) ?? feature;
  });
}

export function getFeatureOrderLabel(feature: DroMapFeature, index: number) {
  if (isZoneFeature(feature)) {
    return "arrière-plan fixe";
  }

  return `${Math.round(getFeatureDrawOrder(feature, index))}`;
}
