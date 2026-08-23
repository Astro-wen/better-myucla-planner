/**
 * Regenerates the two `chrome://extensions` screenshots used by the install
 * guide in `site/`: the page before Developer mode is on, and after.
 *
 * Chrome will not let a normal automation session open `chrome://` pages, so
 * this launches its own persistent profile with `dist/` already side-loaded.
 * The Developer mode switch sits inside shadow DOM; Playwright pierces it.
 *
 * Usage:  npm run build && node harness/chrome-extensions-page.mjs
 * Writes: harness/shots/ext-off.png, harness/shots/ext-on.png
 *
 * The site images are cropped from these by hand, so a rerun does not
 * overwrite anything in `site/`.
 */

import { chromium } from "playwright";
import { resolve } from "node:path";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const shots = resolve(root, "harness/shots");
await mkdir(shots, { recursive: true });

const profile = await mkdtemp(resolve(tmpdir(), "better-myucla-profile-"));
const context = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.BETTER_MYUCLA_CHROMIUM || undefined,
  headless: true,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`]
});

const page = await context.newPage();
try {
  await page.goto("chrome://extensions/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(shots, "ext-off.png") });
  console.log("opened chrome://extensions, title:", await page.title());

  const toggle = page
    .locator("extensions-manager")
    .locator("extensions-toolbar")
    .locator("#devMode");
  console.log("Developer mode toggle found:", await toggle.count());
  await toggle.click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: resolve(shots, "ext-on.png") });
  console.log("Developer mode on; screenshots written to harness/shots/");
} catch (error) {
  console.log("failed:", error.message.split("\n")[0]);
} finally {
  await context.close();
}
