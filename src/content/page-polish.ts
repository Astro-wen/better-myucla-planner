/**
 * Presentation fixes applied to MyUCLA's own markup.
 *
 * Everything here is reversible, reads only text MyUCLA already rendered, and
 * fails closed: if a node does not match the exact shape recorded in
 * `docs/MYUCLA_CONTRACT.md`, it is left untouched rather than guessed at.
 */

const OWNED_ATTRIBUTE = "data-planner-lift-owned";

/** One meeting block in MyUCLA's weekly grid. */
const GRID_BLOCK = "#gridDiv .planneritembox";
const GRID_DONE = "data-pl-grid";

/**
 * A grid block is `overflow: hidden` at 14px in a box as short as 48px, and its
 * three lines are separated by `<br>`. A long room name therefore wraps and is
 * cut in half by the bottom edge: on a real plan that reads as
 * "Physics and Astronomy Buildin".
 *
 * Wrapping each text run in a block span turns every line into exactly one
 * line, so a name that does not fit ends in an ellipsis instead of a cut. The
 * `<br>` and `.hide-above-small` pair is MyUCLA's own responsive switch and is
 * left in place; the stylesheet only neutralises the `<br>` above the same
 * breakpoint, so small screens keep the layout MyUCLA designed.
 */
export function tidyWeekGrid(doc: Document = document): number {
  let tidied = 0;
  doc.querySelectorAll<HTMLElement>(`${GRID_BLOCK}:not([${GRID_DONE}])`).forEach((block) => {
    const runs = [...block.childNodes].filter(
      (node) => node.nodeType === Node.TEXT_NODE && (node.textContent || "").trim().length > 0
    );
    // Fewer than two runs means this is not the three-line block we know.
    if (runs.length < 2) {
      block.setAttribute(GRID_DONE, "skipped");
      return;
    }

    runs.forEach((run, index) => {
      const line = doc.createElement("span");
      line.className = "pl-gridline";
      line.dataset.plGridline = String(index);
      line.setAttribute(OWNED_ATTRIBUTE, "true");
      run.parentNode?.insertBefore(line, run);
      line.append(run);
    });

    // The full string stays reachable even when a 30px-wide column can only
    // show three characters of it.
    const full = (block.textContent || "").replace(/\s+/g, " ").trim();
    if (full && !block.title) block.title = full;
    block.setAttribute(GRID_DONE, "tidy");
    tidied += 1;
  });
  return tidied;
}

export function restoreWeekGrid(doc: Document = document): void {
  doc.querySelectorAll<HTMLElement>(`${GRID_BLOCK}[${GRID_DONE}]`).forEach((block) => {
    block.querySelectorAll<HTMLElement>(".pl-gridline").forEach((line) => {
      const parent = line.parentNode;
      if (!parent) return;
      while (line.firstChild) parent.insertBefore(line.firstChild, line);
      line.remove();
    });
    block.removeAttribute(GRID_DONE);
    block.removeAttribute("title");
  });
}

export interface CourseHeadline {
  /** Subject plus catalogue number, the string a student actually scans for. */
  code: string;
  title: string;
  ordinal: string;
}

/**
 * MyUCLA splits a class across two paragraphs:
 *
 *     Class 15: Management
 *     170 - Real Estate Finance and Investments
 *
 * Nobody says "Management 170"; they say MGMT 170, and that is what they scan
 * for, search for, and type into the enrollment page. The identity is split
 * across two lines with the title wedged between its halves.
 *
 * Returns null unless both paragraphs match exactly, so an unfamiliar shape is
 * left alone rather than rearranged on a guess.
 */
export function readHeadline(labelHost: HTMLElement): CourseHeadline | null {
  const paragraphs = [...labelHost.querySelectorAll<HTMLElement>(":scope > p")].filter(
    (node) => !node.hasAttribute(OWNED_ATTRIBUTE)
  );
  if (paragraphs.length < 2) return null;

  const head = (paragraphs[0].textContent || "").replace(/\s+/g, " ").trim();
  const body = (paragraphs[1].textContent || "").replace(/\s+/g, " ").trim();

  const headMatch = /^Class\s+(\d+)\s*:\s*(.+)$/i.exec(head);
  const bodyMatch = /^(\S{1,10})\s+-\s+(.+)$/.exec(body);
  if (!headMatch || !bodyMatch) return null;

  const subject = headMatch[2].trim();
  const number = bodyMatch[1].trim();
  const title = bodyMatch[2].trim();
  if (!subject || !number || !title) return null;

  return { code: `${subject} ${number}`, title, ordinal: headMatch[1] };
}

/**
 * Collapses those two paragraphs into one line that leads with the code, and
 * hides the originals rather than rewriting them, so MyUCLA's own text stays
 * intact for the adapter and for `restoreHeadline`.
 */
export function applyHeadline(labelHost: HTMLElement): boolean {
  const parsed = readHeadline(labelHost);
  if (!parsed) {
    labelHost.classList.remove("pl-titled");
    labelHost.querySelector(":scope > [data-pl-headline]")?.remove();
    return false;
  }

  let line = labelHost.querySelector<HTMLElement>(":scope > [data-pl-headline]");
  if (!line) {
    line = document.createElement("p");
    line.className = "pl-headline";
    line.dataset.plHeadline = "true";
    line.setAttribute(OWNED_ATTRIBUTE, "true");
    const code = document.createElement("span");
    code.className = "pl-code";
    const title = document.createElement("span");
    title.className = "pl-course-title";
    line.append(code, title);
    labelHost.prepend(line);
  }

  const code = line.querySelector<HTMLElement>(".pl-code");
  const title = line.querySelector<HTMLElement>(".pl-course-title");
  if (code && code.textContent !== parsed.code) code.textContent = parsed.code;
  if (title && title.textContent !== parsed.title) title.textContent = parsed.title;
  labelHost.classList.add("pl-titled");
  return true;
}

export function restoreHeadline(doc: Document = document): void {
  doc.querySelectorAll<HTMLElement>(".pl-titled").forEach((host) => {
    host.classList.remove("pl-titled");
  });
  doc.querySelectorAll("[data-pl-headline]").forEach((node) => node.remove());
}

const HEAD_ROW = "pl-thead";

/**
 * Every class prints its own nine-column header, so a sixteen-class plan
 * repeats `Change / Section / Status / …` sixteen times: 144 header cells for
 * nine distinct words. Tag the header rows so the stylesheet can quiet them and
 * show only the first one in the list.
 */
export function markHeaderRows(root: HTMLElement): void {
  root.querySelectorAll<HTMLTableElement>("table.coursetable").forEach((table) => {
    let columns = 0;
    [...table.rows].forEach((row) => {
      const cells = [...row.cells];
      const isHeader = cells.length > 1 && cells.every((cell) => cell.tagName === "TH");
      if (isHeader) columns = cells.length;
      row.classList.toggle(HEAD_ROW, isHeader);
    });
    // Every class is its own <table>, so each one sizes its columns from its
    // own content and no two cards line up. A shared grid is only safe when
    // the table is the exact nine-column shape we know; anything else keeps
    // MyUCLA's automatic layout.
    table.classList.toggle("pl-cols-9", columns === 9);
  });
}

export function unmarkHeaderRows(doc: Document = document): void {
  doc.querySelectorAll(`.${HEAD_ROW}`).forEach((row) => row.classList.remove(HEAD_ROW));
  doc.querySelectorAll(".pl-cols-9").forEach((table) => table.classList.remove("pl-cols-9"));
}
