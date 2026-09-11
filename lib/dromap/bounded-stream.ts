/** Limits apply to bytes actually read, including decoded HTTP/gzip bodies. */
export function limitStream(stream: ReadableStream<Uint8Array>, maxBytes: number, signal?: AbortSignal) {
  let total = 0;
  return stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      total += chunk.byteLength;
      if (total > maxBytes) throw new Error("BODY_TOO_LARGE");
      controller.enqueue(chunk);
    },
  }), { signal });
}

export async function readBoundedBytes(stream: ReadableStream<Uint8Array> | null, maxBytes: number, signal?: AbortSignal) {
  if (!stream) return new Uint8Array();
  return new Uint8Array(await new Response(limitStream(stream, maxBytes, signal)).arrayBuffer());
}
