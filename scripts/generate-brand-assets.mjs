import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Toutes les déclinaisons utilisent le SVG approuvé comme source unique.
const source = await readFile(new URL('../public/dromap-logo.svg', import.meta.url));
const output = (path) => new URL(`../${path}`, import.meta.url);
const square = (size) => sharp(source).flatten({ background: '#ffffff' }).resize(size, size, {
  fit: 'contain', background: '#ffffff',
}).png().toBuffer();

for (const [path, size] of [
  ['public/dromap-icon-192.png', 192],
  ['public/dromap-icon-512.png', 512],
  ['app/icon.png', 512],
  ['app/apple-icon.png', 180],
  ['public/dromap-logo-mark-crop.png', 512],
]) await writeFile(output(path), await square(size));
await writeFile(output('public/dromap-logo.png'), await sharp(source).png().toBuffer());

const frames = await Promise.all([16, 32, 48, 256].map(square));
const header = Buffer.alloc(6 + frames.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach((frame, index) => {
  const size = [16, 32, 48, 256][index];
  const entry = 6 + index * 16;
  header[entry] = size % 256;
  header[entry + 1] = size % 256;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await writeFile(output('public/favicon.ico'), Buffer.concat([header, ...frames]));

const logo = await sharp(source).resize(400, 400, { fit: 'inside' }).png().toBuffer();
const caption = Buffer.from('<svg width="1200" height="630"><text x="600" y="525" text-anchor="middle" fill="#1c4355" font-family="sans-serif" font-size="64" font-weight="600">DroMap</text></svg>');
await writeFile(output('public/dromap-share.png'), await sharp({ create: {
  width: 1200, height: 630, channels: 4, background: '#ffffff',
}}).composite([{ input: logo, left: 400, top: 55 }, { input: caption }]).png().toBuffer());
console.log('Logo, icônes, favicon et aperçu de partage générés.');
