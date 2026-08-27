/**
 * Loads the built extension against a local stand-in for the Class Planner and
 * drives it, so injected UI and motion can be checked without a real account.
 *
 * Usage:  node harness/run.mjs [scenario] [--count=17] [--out=harness/shots]
 *
 * Scenarios:
 *   idle      first paint, nothing touched
 *   position  change one card's position control and screenshot the result
 *   top       press "move to top" on an off-screen card
 *   finals    open the final exam week panel and read what it placed
 */

import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

import { fixtureHtml } from "./fixture.mjs";

/**
 * Playwright finds its own Chromium after `npx playwright install chromium`.
 * `BETTER_MYUCLA_CHROMIUM` overrides it for sandboxes that ship their own.
 */
const executablePath = process.env.BETTER_MYUCLA_CHROMIUM || undefined;

const PAGE_URL = "https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx";
const root = resolve(import.meta.dirname, "..");

const args = process.argv.slice(2);
const scenario = args.find((value) => !value.startsWith("--")) || "idle";
const flag = (name, fallback) => {
  const hit = args.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const count = Number(flag("count", "17"));
const outDir = resolve(root, flag("out", "harness/shots"));

await mkdir(outDir, { recursive: true });

const css = await readFile(resolve(root, "dist/injected.css"), "utf8");
const js = await readFile(resolve(root, "dist/content.js"), "utf8");

const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

page.on("console", (message) => {
  if (message.type() === "error") console.log("[page error]", message.text());
});
page.on("pageerror", (error) => console.log("[page exception]", error.message));

await page.route(PAGE_URL, (route) =>
  route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: fixtureHtml(count) })
);

await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
// The optional "tidy up MyUCLA's own layout" switch is off by default, so the
// tidy scenario has to stand in for extension storage that has it on.
if (scenario === "tidy") {
  await page.evaluate(() => {
    window.chrome = {
      storage: {
        local: {
          get: async (key) =>
            key === "plannerLift.layout.v1" ? { [key]: { tidy: true } } : {},
          set: async () => undefined,
          remove: async () => undefined
        },
        onChanged: { addListener: () => undefined, removeListener: () => undefined }
      }
    };
  });
}
await page.addStyleTag({ content: css });
await page.addScriptTag({ content: js });
await page.waitForTimeout(600);

const shot = async (name) => {
  const file = resolve(outDir, `${scenario}-${name}.png`);
  await page.screenshot({ path: file });
  console.log("screenshot", file);
};

/** Where the page is scrolled, and where a given card sits on screen. */
const probe = (index) =>
  page.evaluate((i) => {
    const cards = [...document.querySelectorAll("#div_landing > table > tbody.courseItem")];
    const node = cards[i];
    return {
      scrollY: Math.round(window.scrollY),
      cardTop: node ? Math.round(node.getBoundingClientRect().top) : null,
      order: cards.map((c) => (c.querySelector(".pl-code")?.textContent || "").trim())
    };
  }, index);

if (scenario === "idle") {
  await shot("top");
  await page.evaluate(() => window.scrollTo(0, 2400));
  await page.waitForTimeout(200);
  await shot("scrolled");
}

if (scenario === "position" || scenario === "top") {
  // A real 17-course plan opens expanded, so each card is ~200px tall and any
  // move of more than two places leaves the viewport.
  await page.evaluate(() => {
    const toggle = document.querySelector('[data-pl-action="toggle-all"]');
    if (toggle && /Expand/.test(toggle.textContent)) toggle.click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 2600));
  await page.waitForTimeout(250);

  const before = await probe(12);
  console.log("before", before);
  await shot("before");

  if (scenario === "position") {
    await page.evaluate(() => {
      const cards = [...document.querySelectorAll("#div_landing > table > tbody.courseItem")];
      const select = cards[12].querySelector("[data-pl-position]");
      select.value = "1";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  } else {
    await page.evaluate(() => {
      const cards = [...document.querySelectorAll("#div_landing > table > tbody.courseItem")];
      cards[12].querySelector('[data-pl-action="top"]').click();
    });
  }

  await page.waitForTimeout(700);
  await page.screenshot({ path: "harness/shots/" + scenario + "-bottom.png", clip: { x: 0, y: 620, width: 1440, height: 280 } });
  const after = await probe(1);
  console.log("after", after);
  await shot("after");
  console.log("scroll moved by", after.scrollY - before.scrollY);
}

if (scenario === "default" || scenario === "tidy") {
  await page.evaluate(() => {
    const t = document.querySelector('[data-pl-action="toggle-all"]');
    if (t && /Expand/.test(t.textContent)) t.click();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.waitForTimeout(200);
  await shot("list");
  console.log(
    await page.evaluate(() => ({
      headlines: document.querySelectorAll("[data-pl-headline]").length,
      sharedGrids: document.querySelectorAll("table.coursetable.pl-cols-9").length,
      visibleHeaderRows: [...document.querySelectorAll("table.coursetable tr")].filter(
        (r) => [...r.cells].every((c) => c.tagName === "TH") && r.getClientRects().length > 0
      ).length,
      tidyGridBlocks: document.querySelectorAll('#gridDiv .planneritembox[data-pl-grid="tidy"]').length
    }))
  );
}

if (scenario === "drag") {
  // The case that was impossible before: grab a card near the bottom of a plan
  // taller than the screen and drag it to the very top.
  await page.evaluate(() => {
    const toggle = document.querySelector('[data-pl-action="toggle-all"]');
    if (toggle && /Expand/.test(toggle.textContent)) toggle.click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 2600));
  await page.waitForTimeout(250);

  const grip = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("#div_landing > table > tbody.courseItem")];
    const onScreen = cards.find((c) => {
      const r = c.getBoundingClientRect();
      return r.top > 100 && r.bottom < window.innerHeight;
    });
    const handle = onScreen.querySelector('[data-pl-action="drag"]');
    const r = handle.getBoundingClientRect();
    return {
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
      index: cards.indexOf(onScreen),
      name: (onScreen.querySelector(".pl-code")?.textContent || onScreen.querySelector("p")?.textContent || "").trim().slice(0, 30)
    };
  });
  console.log("grabbing", grip);
  const startScroll = await page.evaluate(() => window.scrollY);

  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  // Walk up to the top edge, then hold there and let the page come to us.
  for (let y = grip.y; y > 40; y -= 60) {
    await page.mouse.move(grip.x, y);
    await page.waitForTimeout(40);
  }
  await page.mouse.move(grip.x, 25);
  await page.waitForTimeout(2500);
  await shot("held-at-edge");
  const held = await page.evaluate(() => window.scrollY);
  await page.mouse.up();
  await page.waitForTimeout(600);

  const landed = await page.evaluate(
    (name) =>
      [...document.querySelectorAll("#div_landing > table > tbody.courseItem")].findIndex(
        (c) => (c.querySelector(".pl-code")?.textContent || "").trim().startsWith(name)
      ),
    grip.name.split(" - ")[0]
  );
  await shot("after");
  console.log({ startScroll, scrollWhileHeld: held, scrolledBy: held - startScroll, fromIndex: grip.index, landedIndex: landed });
}

if (scenario === "finals") {
  await page.click('[data-pl-action="menu"]');
  await page.waitForTimeout(150);
  await page.click('[data-pl-action="finals"]');
  await page.waitForTimeout(500);

  const panel = await page.$("[data-pl-finals]");
  if (!panel) throw new Error("The finals panel did not open.");
  await panel.screenshot({ path: resolve(outDir, "finals-panel.png") });
  console.log("screenshot", resolve(outDir, "finals-panel.png"));

  console.log(
    await page.evaluate(() => {
      const root = document.querySelector("[data-pl-finals]");
      const text = (node) => (node?.textContent || "").replace(/\s+/g, " ").trim();
      return {
        days: [...root.querySelectorAll(".pl-finals-day")].map(text),
        slots: [...root.querySelectorAll(".pl-finals-slot")].map(text),
        placed: [...root.querySelectorAll(".pl-finals-block .pl-finals-code")].map(text),
        tight: [...root.querySelectorAll(".pl-finals-tight")].map(text),
        clash: [...root.querySelectorAll(".pl-finals-clash-note")].map(text),
        enrolled: [...root.querySelectorAll(".pl-finals-enrolled")].map((n) => text(n.querySelector(".pl-finals-code"))),
        unplaced: [...root.querySelectorAll(".pl-finals-rest-item")].map(text),
        // The page must not scroll sideways because of us.
        bodyOverflows: document.body.scrollWidth > document.documentElement.clientWidth
      };
    })
  );

  await shot("page");
}

await browser.close();
