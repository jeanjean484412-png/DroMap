import "server-only";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { supabaseRestFetch } from "@/lib/dromap/server/supabase-rest";
import { readBoundedBytes } from "@/lib/dromap/bounded-stream";

// Keep large legitimate map imports usable, while bounding compression bombs.
export const MAX_PRIVATE_PAYLOAD_BYTES = 512 * 1024 * 1024;

export async function measureStoredPayload(path: string, token: string, count: number, encoding: "base64" | "gzip-base64") {
  let encodedBytes = 0;
  async function* decodedChunks() {
    let carry = "";
    for (let offset = 0; offset < count; offset += 4) {
      const response = await supabaseRestFetch(`${path}&select=chunk_index,chunk_data&order=chunk_index.asc&offset=${offset}&limit=${Math.min(4, count - offset)}`, token, { signal });
      if (!response.ok) throw new Error("INCOMPLETE_PAYLOAD");
      const rows = JSON.parse(new TextDecoder().decode(await readBoundedBytes(response.body, 11_000_000))) as Array<{ chunk_index: number; chunk_data: string }>;
      if (!Array.isArray(rows) || rows.length !== Math.min(4, count-offset)) throw new Error("INCOMPLETE_PAYLOAD");
      for (const [index, row] of rows.entries()) {
        if (row.chunk_index !== offset+index || typeof row.chunk_data !== "string" || !/^[A-Za-z0-9+/=\s]+$/.test(row.chunk_data)) throw new Error("INVALID_PAYLOAD");
        encodedBytes += row.chunk_data.length;
        if (encodedBytes > MAX_PRIVATE_PAYLOAD_BYTES) throw new Error("BODY_TOO_LARGE");
        const data = carry + row.chunk_data.replace(/\s/g, "");
        const size = data.length - data.length % 4;
        const part = data.slice(0, size);
        if (part.includes("=") && offset+index !== count-1) throw new Error("INVALID_PAYLOAD");
        if (part) yield Buffer.from(part, "base64");
        carry = data.slice(size);
      }
    }
    if (carry) {
      if (carry.length === 1 || carry.includes("=")) throw new Error("INVALID_PAYLOAD");
      yield Buffer.from(carry, "base64");
    }
  }
  let bytes = 0;
  async function consume(source: AsyncIterable<Buffer>) {
    for await (const chunk of source) {
      bytes += chunk.byteLength;
      if (bytes > MAX_PRIVATE_PAYLOAD_BYTES) throw new Error("BODY_TOO_LARGE");
    }
  }
  const signal = AbortSignal.timeout(45_000);
  const source = Readable.from(decodedChunks());
  if (encoding === "gzip-base64") await pipeline(source, createGunzip(), consume, { signal });
  else await pipeline(source, consume, { signal });
  if (!bytes) throw new Error("INVALID_PAYLOAD");
  return bytes;
}
