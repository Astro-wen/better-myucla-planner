/** Screenshot the extension popup at its real width. */
import { chromium } from "playwright";
import { resolve } from "node:path";

/**
 * Playwright finds its own Chromium after `npx playwright install chromium`.
 * `BETTER_MYUCLA_CHROMIUM` overrides it for sandboxes that ship their own.
 */
const executablePath = process.env.BETTER_MYUCLA_CHROMIUM || undefined;

const browser = await chromium.launch({
  executablePath
});
const page = await (await browser.newContext({ viewport: { width: 340, height: 900 } })).newPage();
await page.goto("file://" + resolve(import.meta.dirname, "../dist/popup.html"));
await page.evaluate(() => {
  document.getElementById("toggle").checked = true;
  document.getElementById("state").textContent = "On. Active on the Class Planner page.";
  document.getElementById("keep-alive").checked = true;
  document.getElementById("cap").value = "60";
  document.getElementById("cap-row").hidden = false;
});
await page.waitForTimeout(200);
await page.screenshot({ path: resolve(import.meta.dirname, "shots/popup.png"), fullPage: true });
console.log("ok");
await browser.close();
