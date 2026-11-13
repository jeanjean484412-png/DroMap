import type { encodeProject } from "./project-payload-codec";
import type { DromapProject } from "./product";

type EncodedProject = Awaited<ReturnType<typeof encodeProject>>;

export function encodeProjectInWorker(project: DromapProject): Promise<EncodedProject> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./project-payload.worker.ts", import.meta.url), {
      type: "module",
      name: "dromap-project-payload",
    });
    function cleanup() {
      clearTimeout(timeout);
      worker.terminate();
    }
    function fail() {
      cleanup();
      reject(new Error("Encodage du projet en arrière-plan indisponible."));
    }
    const timeout = setTimeout(fail, 30_000);
    worker.onmessage = (event: MessageEvent<EncodedProject | null>) => {
      if (!event.data) {
        fail();
        return;
      }
      cleanup();
      resolve(event.data);
    };
    worker.onerror = fail;
    worker.onmessageerror = fail;
    try {
      worker.postMessage(project);
    } catch {
      fail();
    }
  });
}
