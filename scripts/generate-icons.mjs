import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ICONS_DIR = resolve(ROOT, "icons");

async function renderPng({ srcSvgPath, outPngPath, size }) {
  const svg = await readFile(srcSvgPath, "utf8");
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    background: "transparent",
  });
  const png = resvg.render().asPng();
  await mkdir(dirname(outPngPath), { recursive: true });
  await writeFile(outPngPath, png);
}

async function main() {
  await mkdir(ICONS_DIR, { recursive: true });

  const iconSvg = resolve(ICONS_DIR, "icon.svg");
  const maskableSvg = resolve(ICONS_DIR, "maskable.svg");

  await Promise.all([
    renderPng({ srcSvgPath: iconSvg, outPngPath: resolve(ICONS_DIR, "icon-192.png"), size: 192 }),
    renderPng({ srcSvgPath: iconSvg, outPngPath: resolve(ICONS_DIR, "icon-512.png"), size: 512 }),
    renderPng({ srcSvgPath: maskableSvg, outPngPath: resolve(ICONS_DIR, "maskable-192.png"), size: 192 }),
    renderPng({ srcSvgPath: maskableSvg, outPngPath: resolve(ICONS_DIR, "maskable-512.png"), size: 512 }),
    renderPng({ srcSvgPath: iconSvg, outPngPath: resolve(ICONS_DIR, "apple-touch-icon.png"), size: 180 }),
  ]);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

