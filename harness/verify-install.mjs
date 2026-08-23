/**
 * Walks the install guide exactly as a student would, against the real
 * release zip, and reports what Chrome ends up with.
 */
import { chromium } from "playwright";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { fixtureHtml } from "./fixture.mjs";

const DIST = process.env.BETTER_MYUCLA_DIST || "/tmp/rel/unpacked/dist"; // step 5: the folder they pick
const PAGE = "https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx"; // step 7
const profile = await mkdtemp(resolve(tmpdir(), "student-"));

const ctx = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.BETTER_MYUCLA_CHROMIUM,
  headless: true,
  viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`]
});

const report = {};

// Steps 2-6: chrome://extensions shows the card, with no error badge.
const ext = await ctx.newPage();
await ext.goto("chrome://extensions/", { waitUntil: "domcontentloaded" });
await ext.waitForTimeout(1500);
report.step6 = await ext.evaluate(() => {
  const mgr = document.querySelector("extensions-manager");
  const list = mgr?.shadowRoot?.querySelector("extensions-item-list");
  const item = list?.shadowRoot?.querySelector("extensions-item");
  const sr = item?.shadowRoot;
  return {
    cardVisible: !!sr,
    name: sr?.querySelector("#name")?.textContent?.trim() || null,
    version: sr?.querySelector("#version")?.textContent?.trim() || null,
    enabled: sr?.querySelector("#enableToggle")?.getAttribute("aria-pressed") === "true",
    errorsShown: !!sr?.querySelector("#errors-button:not([hidden])")
  };
});

// Step 7: open Class Planner and see whether the new buttons are really there.
const page = await ctx.newPage();
page.on("pageerror", (e) => (report.pageError = e.message));
await page.route(PAGE, (r) =>
  r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: fixtureHtml(17) })
);
await page.goto(PAGE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
report.step7 = await page.evaluate(() => ({
  toolbarMounted: !!document.querySelector(".pl-host-bar, #planner-lift-bar, [data-pl-action='toggle-all']"),
  dragHandles: document.querySelectorAll("[data-pl-action='drag']").length,
  sendToTopButtons: document.querySelectorAll("[data-pl-action='top']").length,
  positionDropdowns: document.querySelectorAll("[data-pl-position]").length,
  noteButtons: document.querySelectorAll("[data-pl-action='tag']").length,
  classesOnPage: document.querySelectorAll("#div_landing > table > tbody.courseItem").length
}));

// Does a move actually work end to end, unsaved?
report.moveWorks = await page.evaluate(() => {
  const cards = () => [...document.querySelectorAll("#div_landing > table > tbody.courseItem")];
  const before = cards()[12].className.match(/Class(\d+)/)[1];
  cards()[12].querySelector("[data-pl-action='top']").click();
  return new Promise((res) =>
    setTimeout(() => res(cards()[0].className.includes(`Class${before}`)), 700)
  );
});
report.saveBarAppears = await page.evaluate(
  () => !!document.querySelector("#planner-lift-actionbar, .pl-actionbar")
);

await ext.screenshot({ path: "harness/shots/verify-card.png", clip: { x: 0, y: 120, width: 1280, height: 300 } });
console.log(JSON.stringify(report, null, 2));
await ctx.close();
