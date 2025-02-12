import sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs';

const sizes = [192, 256, 384, 512];
const iconDir = path.join(process.cwd(), 'public', 'icons');

async function generateIcons() {
  // アイコンディレクトリの作成
  if (!fs.existsSync(iconDir)) {
    fs.mkdirSync(iconDir, { recursive: true });
  }

  const svgBuffer = fs.readFileSync(path.join(iconDir, 'icon.svg'));

  for (const size of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(iconDir, `icon-${size}x${size}.png`));
  }
}

generateIcons().catch(console.error); 