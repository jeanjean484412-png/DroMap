import type {
  downloadOvertureBuildings,
  enrichBuildingNamesFromOverturePlaces,
  OvertureBuildingsError,
  OvertureBuildingsResult,
  OvertureBuildingNameEnrichmentResult,
} from "./overture-buildings-runtime";

export type OvertureWorkerRequest =
  | { kind: "buildings"; bounds: Parameters<typeof downloadOvertureBuildings>[0]; maxFeatures: number }
  | { kind: "names"; bounds: Parameters<typeof enrichBuildingNamesFromOverturePlaces>[1]; features: Parameters<typeof enrichBuildingNamesFromOverturePlaces>[0]; maxPlaces?: number };

export type OvertureWorkerResult = OvertureBuildingsResult | OvertureBuildingNameEnrichmentResult;

export type OvertureWorkerMessage =
  | { kind: "progress"; message: string }
  | { kind: "success"; result: OvertureWorkerResult }
  | { kind: "error"; message: string; code?: OvertureBuildingsError["code"] };
