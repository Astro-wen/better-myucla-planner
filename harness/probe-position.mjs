/** Does "move to position N" actually land on N, from every starting point? */
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { resolve } from "node:path";

import { fixtureHtml } from "./fixture.mjs";

const root = resolve(import.meta.dirname, "..");

/**
 * Playwright finds its own Chromium after `npx playwright install chromium`.
 * `BETTER_MYUCLA_CHROMIUM` overrides it for sandboxes that ship their own.
 */
const executablePath = process.env.BETTER_MYUCLA_CHROMIUM || undefined;

const PAGE_URL = "https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx";
const css = await readFile(resolve(root, "dist/injected.css"), "utf8");
const js = await readFile(resolve(root, "dist/content.js"), "utf8");

const browser = await chromium.launch({
  executablePath
});
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on("pageerror", (e) => console.log("[exc]", e.message));
await page.route(PAGE_URL, (r) =>
  r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: fixtureHtml(17) })
);

const results = [];
for (const target of [0, 1, 5, 11, 12, 14, 16]) {
  await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: js });
  await page.waitForTimeout(400);

  const landed = await page.evaluate((t) => {
    const table = document.querySelector("#div_landing > table");
    const cards = () => [...table.querySelectorAll(":scope > tbody.courseItem")];
    const mover = cards()[12];
    const key = mover.className.match(/Class(\d+)/)[1];
    const select = mover.querySelector("[data-pl-position]");
    select.value = String(t);
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return new Promise((resolve) =>
      setTimeout(
        () =>
          resolve({
            index: cards().findIndex((c) => c.className.includes(`Class${key}`)),
            shown: select.value,
            options: select.options.length
          }),
        250
      )
    );
  }, target);

  results.push({ from: 12, asked: target, landed: landed.index, chipShows: landed.shown });
}
console.table(results);
await browser.close();
