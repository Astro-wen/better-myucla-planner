/**
 * Draws the toolbar icon at each size Chrome asks for.
 *
 * The mark is the product in one picture: a short list with its first row
 * picked out in gold, which is what the extension is for. Geometry is
 * recomputed per size and snapped to whole pixels, because a 16px icon that
 * was scaled down from 128 comes out as grey mush in the toolbar.
 *
 * Usage: node scripts/make-icons.mjs   ->   public/icons/icon-{16,32,48,128}.png
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const BLUE = "#2C5E91";
const BLUE_DEEP = "#1B3C5E";
const GOLD = "#FFD100";
const SIZES = [16, 32, 48, 128];
const out = resolve(import.meta.dirname, "..", "public/icons");
await mkdir(out, { recursive: true });

/** Whole-pixel geometry, so edges land on the grid at every size. */
function geometry(s) {
  const round = (n) => Math.max(1, Math.round(n));
  const bar = round(s * 0.125);            // bar thickness
  const gap = round(s * 0.109);            // space between bars
  const padX = round(s * 0.164);
  const width = s - padX * 2;
  const block = bar * 3 + gap * 2;
  return { bar, gap, padX, width, top: Math.round((s - block) / 2), radius: s <= 16 ? 3 : Math.round(s * 0.22) };
}

const svg = (s) => {
  const g = geometry(s);
  const rows = [0, 1, 2].map((i) => {
    const y = g.top + i * (g.bar + g.gap);
    const fill = i === 0 ? GOLD : "#FFFFFF";
    const opacity = i === 0 ? 1 : 0.88;
    return `<rect x="${g.padX}" y="${y}" width="${g.width}" height="${g.bar}" rx="${g.bar / 2}" fill="${fill}" opacity="${opacity}"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BLUE}"/><stop offset="1" stop-color="${BLUE_DEEP}"/>
    </linearGradient></defs>
    <rect width="${s}" height="${s}" rx="${g.radius}" fill="url(#bg)"/>
    ${rows}
  </svg>`;
};

const browser = await chromium.launch({ executablePath: process.env.BETTER_MYUCLA_CHROMIUM });
const page = await browser.newPage();
for (const s of SIZES) {
  await page.setViewportSize({ width: s, height: s });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>${svg(s)}`
  );
  await page.screenshot({ path: resolve(out, `icon-${s}.png`), omitBackground: true });
  console.log(`icon-${s}.png`, JSON.stringify(geometry(s)));
}
await browser.close();
