import { encodeProject } from "./project-payload-codec";
import type { DromapProject } from "./product";

self.addEventListener("message", async (event: MessageEvent<DromapProject>) => {
  try {
    self.postMessage(await encodeProject(event.data));
  } catch {
    self.postMessage(null);
  }
});
