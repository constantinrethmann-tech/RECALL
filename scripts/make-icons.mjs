// Draws the RECALL app icon (same family as KAIROS) and writes all sizes to public/icons.
// Run: npm run icons
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const out = new URL("../public/icons/", import.meta.url);

/** @param {{ rounded: boolean, scale: number }} o */
function svg({ rounded, scale }) {
  const t = `translate(256 256) scale(${scale}) translate(-256 -256)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#14203D"/><stop offset=".55" stop-color="#0A0F1C"/><stop offset="1" stop-color="#05060A"/></radialGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="#8FB3FF" stop-opacity=".5"/><stop offset="1" stop-color="#8FB3FF" stop-opacity="0"/></radialGradient>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#bg)"/>
  <g transform="${t}">
    <path d="M 256 82 A 174 174 0 1 1 96 187" fill="none" stroke="#8FB3FF" stroke-opacity=".9" stroke-width="12" stroke-linecap="round" filter="url(#soft)"/>
    <rect x="200" y="150" width="170" height="220" rx="24" fill="#0B1120" stroke="#E9ECF1" stroke-opacity=".16" stroke-width="8" transform="rotate(9 285 260)"/>
    <rect x="160" y="140" width="170" height="220" rx="24" fill="#0B1120" stroke="#E9ECF1" stroke-opacity=".38" stroke-width="10" transform="rotate(-7 245 250)"/>
    <circle cx="245" cy="250" r="64" fill="url(#glow)"/>
    <circle cx="245" cy="250" r="20" fill="#E9ECF1"/>
    <circle cx="96" cy="187" r="13" fill="#8FB3FF" filter="url(#soft)"/>
  </g>
</svg>`;
}

await mkdir(out, { recursive: true });
const rounded = svg({ rounded: true, scale: 1 });
const square = svg({ rounded: false, scale: 0.92 });
const maskable = svg({ rounded: false, scale: 0.74 });

await writeFile(new URL("favicon.svg", out), rounded);
const png = (source, size, file) => sharp(Buffer.from(source)).resize(size, size).png().toFile(new URL(file, out).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
await png(rounded, 192, "icon-192.png");
await png(rounded, 512, "icon-512.png");
await png(maskable, 512, "icon-maskable-512.png");
await png(square, 180, "apple-touch-icon.png");
console.log("Icons written to public/icons");
