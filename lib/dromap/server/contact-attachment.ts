import "server-only";
import sharp from "sharp";

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  pdf: "application/pdf", txt: "text/plain", log: "text/plain", json: "application/json", csv: "text/csv",
};

export async function validateContactAttachment(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const contentType = MIME[extension];
  if (!contentType || file.size > 3 * 1024 * 1024) throw new Error("INVALID_ATTACHMENT");
  const content = Buffer.from(await file.arrayBuffer());
  if (contentType.startsWith("image/")) {
    const format = extension === "jpg" ? "jpeg" : extension;
    const hasSignature = format === "png" ? content.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : format === "jpeg" ? content[0] === 255 && content[1] === 216 && content[2] === 255
      : content.toString("ascii", 0, 4) === "RIFF" && content.toString("ascii", 8, 12) === "WEBP";
    if (!hasSignature) throw new Error("INVALID_ATTACHMENT");
    const image = sharp(content, { limitInputPixels: 16_777_216, failOn: "warning" }).timeout({ seconds: 3 });
    const meta = await image.metadata();
    if (meta.format !== format || !meta.width || !meta.height || meta.width > 8192 || meta.height > 8192 || (meta.pages ?? 1) > 1) throw new Error("INVALID_ATTACHMENT");
    await image.raw().toBuffer();
  } else if (extension === "pdf") {
    // Signature/container checks are not an antivirus or a PDF script sanitizer.
    if (content.toString("ascii", 0, 5) !== "%PDF-" || !content.subarray(-2048).includes(Buffer.from("%%EOF"))) throw new Error("INVALID_ATTACHMENT");
  } else {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(content);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error("INVALID_ATTACHMENT");
    if (extension === "json") JSON.parse(text);
  }
  // Never interpolate a caller-supplied MIME header into the SMTP message.
  return { contentType, content };
}
