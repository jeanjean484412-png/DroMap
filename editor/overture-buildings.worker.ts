import type { OvertureWorkerMessage, OvertureWorkerRequest } from "./overture-buildings-protocol";
import { downloadOvertureBuildings, enrichBuildingNamesFromOverturePlaces, OvertureBuildingsError } from "./overture-buildings-runtime";

function send(message: OvertureWorkerMessage) {
  self.postMessage(message);
}

self.onmessage = async ({ data }: MessageEvent<OvertureWorkerRequest>) => {
  const onProgress = (message: string) => send({ kind: "progress", message });
  try {
    const result = data.kind === "buildings"
      ? await downloadOvertureBuildings(data.bounds, { maxFeatures: data.maxFeatures, onProgress })
      : await enrichBuildingNamesFromOverturePlaces(data.features, data.bounds, { maxPlaces: data.maxPlaces, onProgress }, true);
    send({ kind: "success", result });
  } catch (error) {
    send({
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
      ...(error instanceof OvertureBuildingsError ? { code: error.code } : {}),
    });
  }
};
