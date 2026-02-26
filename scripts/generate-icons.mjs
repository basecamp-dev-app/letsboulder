import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sourcePath = path.join(__dirname, '..', 'public', 'icon-source.png');
const paddingPercent = 15;
const targets = [
  { name: 'icon-192-maskable.png', size: 192 },
  { name: 'icon-512-maskable.png', size: 512 },
];

async function generateIcons() {
  const metadata = await sharp(sourcePath).metadata();
  console.log(`Source: ${metadata.width}x${metadata.height}`);
  console.log(`Padding: ${paddingPercent}% per side`);

  for (const target of targets) {
    const padPx = Math.round((target.size * paddingPercent) / 100);
    const innerSize = target.size - padPx * 2;
    await sharp(sourcePath)
      .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extend({
        top: padPx,
        bottom: padPx,
        left: padPx,
        right: padPx,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(path.join(__dirname, '..', 'public', target.name));
    console.log(`Generated: ${target.name}`);
  }
}

generateIcons().catch(console.error);
