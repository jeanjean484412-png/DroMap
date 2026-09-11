import "server-only";

import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import ipaddr from "ipaddr.js";

export function isPublicAddress(address: string) {
  try {
    // process convertit aussi ::ffff:127.0.0.1 et ::ffff:7f00:1 en IPv4.
    const parsed = ipaddr.process(address);
    return parsed.range() === "unicast";
  } catch { return false; }
}

export async function readPublicUrl(url: URL, maxBytes: number, timeoutMs: number) {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
    hostname === "localhost" || /\.(local|internal)$/i.test(hostname)) {
    throw new Error("Cette adresse ne peut pas être importée.");
  }
  const signal = AbortSignal.timeout(timeoutMs);
  const addresses = ipaddr.isValid(hostname)
    ? [{ address: hostname, family: ipaddr.parse(hostname).kind() === "ipv4" ? 4 : 6 }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(entry => !isPublicAddress(entry.address))) {
    throw new Error("Cette adresse ne peut pas être importée.");
  }
  const selected = addresses.find(entry => entry.family === 4) ?? addresses[0];
  signal.throwIfAborted();
  return new Promise<string>((resolve, reject) => {
    // Connexion à l'adresse déjà contrôlée, sans seconde résolution DNS.
    // L'URL d'origine conserve Host/SNI et la validation du certificat TLS.
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      agent: false, signal,
      lookup: (_hostname, options, callback) => {
        if (typeof options === "object" && options.all) callback(null, [selected]);
        else callback(null, selected.address, selected.family);
      },
      headers: { Accept: "application/geo+json,application/json,text/json;q=0.9,*/*;q=0.1", "Accept-Encoding": "identity", "User-Agent": "DroMap/1.0 AI GeoJSON importer" },
    }, response => {
      if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
        response.destroy(); reject(new Error("La source GeoJSON est momentanément indisponible.")); return;
      }
      const encoding = response.headers["content-encoding"]?.toLowerCase() ?? "identity";
      if (Number(response.headers["content-length"] ?? 0) > maxBytes ||
        !["identity", "gzip", "deflate", "br"].includes(encoding)) {
        response.destroy(); reject(new Error("Le fichier est trop volumineux ou son encodage est invalide.")); return;
      }
      const chunks: Buffer[] = [];
      let received = 0;
      const decoded = encoding === "gzip" ? response.pipe(createGunzip())
        : encoding === "deflate" ? response.pipe(createInflate())
        : encoding === "br" ? response.pipe(createBrotliDecompress()) : response;
      let wireBytes = 0;
      response.on("data", (chunk: Buffer) => {
        wireBytes += chunk.length;
        if (wireBytes > maxBytes) {
          response.destroy(); decoded.destroy(); reject(new Error("Le fichier dépasse la limite de 25 Mo."));
        }
      });
      decoded.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > maxBytes) {
          response.destroy(); decoded.destroy(); reject(new Error("Le fichier dépasse la limite de 25 Mo.")); return;
        }
        chunks.push(chunk);
      });
      response.on("error", error => { decoded.destroy(); reject(error); });
      decoded.on("error", error => { response.destroy(); reject(error); });
      response.on("aborted", () => { decoded.destroy(); reject(new Error("Téléchargement GeoJSON interrompu.")); });
      decoded.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    request.on("error", reject);
    request.end();
  });
}
