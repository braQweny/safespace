/**
 * Generuje favicon z jednego źródła: `public/favicon.svg` (ostry w każdej
 * skali), `public/favicon.png` (32 px, zapas dla starszych przeglądarek) i
 * `public/apple-touch-icon.png` (180 px, bez zaokrągleń — iOS nakłada własną
 * maskę). Uruchom: `node scripts/generate-favicon.mjs`.
 *
 * Znak: ten sam łuk co w nagłówku aplikacji (`M4.5 21.5V12a7.5 7.5 0 0 1 15 0v9.5Z`
 * w siatce 24) przeskalowany do siatki 64 — drzwi do cichego pokoju, jasny
 * papier na zieleni marki. Bez detali, które giną przy 16 px.
 */
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const BRAND = "#2d6a5e";
const BRAND_DEEP = "#1c4a42";
const PAPER = "#f5f1e9";
const BRAND_SOFT = "#d9e7e0";

function buildSvg({ rounded }) {
  const tile = rounded
    ? `<rect width="64" height="64" rx="16" fill="${BRAND}"/>`
    : `<rect width="64" height="64" fill="${BRAND}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <title>SafeSpace</title>
  ${tile}
  <path d="M14 52V26a18 18 0 0 1 36 0v26Z" fill="${PAPER}"/>
  <path d="M20 52V27a12 12 0 0 1 24 0v25" fill="none" stroke="${BRAND_SOFT}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M14 52h36" stroke="${BRAND_DEEP}" stroke-width="2.5" stroke-linecap="round"/>
</svg>
`;
}

const rounded = buildSvg({ rounded: true });
const square = buildSvg({ rounded: false });

writeFileSync("public/favicon.svg", rounded);
await sharp(Buffer.from(rounded)).resize(32, 32).png({ compressionLevel: 9 }).toFile("public/favicon.png");
await sharp(Buffer.from(square)).resize(180, 180).png({ compressionLevel: 9 }).toFile("public/apple-touch-icon.png");

const previewPath = process.argv[2];
if (previewPath) {
  await sharp(Buffer.from(rounded)).resize(256, 256).png().toFile(previewPath);
}

console.log("favicon files written to public/");
