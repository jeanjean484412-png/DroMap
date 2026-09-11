import "server-only";

import sharp from "sharp";

// Les publications générées par DroMap font au plus 1800 x 1350 pixels.
// Garder une marge pour les anciens rendus, sans accepter les bombes de pixels.
const MAX_DATA_URL_LENGTH = 2_100_000;
const MAX_IMAGE_DIMENSION = 4096;
const MAX_IMAGE_PIXELS = 16_000_000;

export type DecodedImageDataUrl = {
  bytes: Buffer;
  mimeType: "image/jpeg" | "image/webp";
};

type ImageDataUrlOptions = {
  maxLength?: number;
  allowedTypes?: readonly ("jpeg" | "webp")[];
};

export async function decodeSupportedImageDataUrl(
  value: unknown,
  options: ImageDataUrlOptions = {},
): Promise<DecodedImageDataUrl | null> {
  const maxLength = Math.min(options.maxLength ?? MAX_DATA_URL_LENGTH, MAX_DATA_URL_LENGTH);
  if (typeof value !== "string" || value.length > maxLength) return null;
  const match = /^data:image\/(jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(value.trim());
  if (!match) return null;

  try {
    const format = match[1].toLowerCase() as "jpeg" | "webp";
    if (options.allowedTypes && !options.allowedTypes.includes(format)) return null;
    const base64 = match[2].replace(/[\r\n]/g, "");
    const bytes = Buffer.from(base64, "base64");
    if (!bytes.length) return null;
    // Buffer.from est permissif : refuser les données tronquées/non canoniques.
    // Les anciennes représentations sans padding restent acceptées.
    const encoded = bytes.toString("base64");
    if (base64 !== encoded && base64 !== encoded.replace(/=+$/, "")) return null;

    // Vérifier le format AVANT tout décodage natif : une étiquette JPEG/WebP
    // ne doit pas permettre d'envoyer un AVIF, un SVG ou un autre format à sharp.
    const isJpeg = bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isWebp = bytes.length >= 16 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP" &&
      bytes.readUInt32LE(4) === bytes.length - 8;
    if (format === "jpeg" ? !isJpeg : !isWebp) return null;

    const image = sharp(bytes, { failOn: "warning", limitInputPixels: MAX_IMAGE_PIXELS })
      .timeout({ seconds: 3 });
    const metadata = await image.metadata();
    if (
      metadata.format !== format ||
      !metadata.width || !metadata.height ||
      metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION ||
      metadata.width * metadata.height > MAX_IMAGE_PIXELS ||
      (metadata.pages ?? 1) !== 1
    ) return null;

    // Lire aussi les pixels : les seuls en-têtes ne prouvent pas qu'une image
    // est décodable. Ne pas réencoder : les rendus et exports restent identiques.
    await image.raw().toBuffer();
    return { bytes, mimeType: format === "webp" ? "image/webp" : "image/jpeg" };
  } catch {
    return null;
  }
}
