// Rasterises icons/icon.svg to the PNG sizes the manifest declares.
// Run once after changing the SVG: pnpm --filter @shortlisted/extension icons
import sharp from "sharp";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "icons");
const svg = readFileSync(path.join(root, "icon.svg"));

for (const size of [16, 48, 128]) {
  await sharp(svg).resize(size, size).png().toFile(path.join(root, `${size}.png`));
  console.log(`icons/${size}.png`);
}
