/** Photographs the installed extension card for step 6 of the install guide. */
import { chromium } from "playwright";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const profile = await mkdtemp(resolve(tmpdir(), "card-"));
const dist = resolve(import.meta.dirname, "..", "dist");
const ctx = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.BETTER_MYUCLA_CHROMIUM,
  headless: true,
  viewport: { width: 1100, height: 800 },
  deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`]
});
const p = await ctx.newPage();
await p.goto("chrome://extensions/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1800);
const box = await p.evaluate(() => {
  const item = document
    .querySelector("extensions-manager")?.shadowRoot
    ?.querySelector("extensions-item-list")?.shadowRoot
    ?.querySelector("extensions-item");
  const r = item.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
});
console.log("card box", box);
await p.screenshot({ path: resolve(import.meta.dirname, "..", "site/step-installed.png"), clip: box });
await ctx.close();
