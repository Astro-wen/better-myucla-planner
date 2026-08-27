/**
 * A local stand-in for the real Class Planner page.
 *
 * It reproduces the structure recorded in docs/MYUCLA_CONTRACT.md — the
 * `#div_landing > table` with `tbody.courseItem` cards, interleaved
 * `tbody.course_divider` spacers, the `td.linkPanelRight` ordering panel, and
 * the native move buttons with their exact class names, ids, titles and inline
 * `courseListAction(...)` handlers — so the production adapter's strict
 * contract passes against it.
 *
 * Everything in here is invented. No real plan, no real student.
 */

const TRACKER = "ctl00_MainContent_planClassListView_clCommandFieldTracker";
const COMMAND = "ctl00_MainContent_planClassListView_clCommandField";

export const COURSES = [
  { subject: "Russian", number: "C124C", title: "Studies in Russian Literature: Chekhov", status: "waitlist", statusText: "Waitlist: 0 of 5 Taken", days: "TR", time: "12:30pm-1:45pm", location: "Royce Hall 152", units: "4.0", instructor: "Furman, Y.", rating: "5.0", color: "#b5cf6b", final: "Consult instructor for method of evaluation" },
  { subject: "French", number: "1", title: "Elementary French", status: "closed", statusText: "Closed Class Full (28)", days: "TR", time: "9:30am-10:45am", location: "Online", units: "4.0", instructor: "Von Zur Muehlen, E<br>Rushing, R.A.", rating: "N/A", color: "#e8262b", final: "Consult instructor for method of evaluation" },
  { subject: "Statistics", number: "C161", title: "Introduction to Machine Learning and Artificial Intelligence", status: "open", statusText: "Open: 12 of 150 Left", days: "MW", time: "10:00am-11:15am", location: "Franz Hall 1178", units: "4.0", instructor: "Wu, Y.N.", rating: "4.2", color: "#7b2d8e", final: "Monday December 7, 2026 8am-11am", finalNote: "Check back on 11/23/2026 (Monday of 9th week) for final exam location", conflicts: ["STATS 100A"] },
  { subject: "Com Sci", number: "35L", title: "Software Construction", status: "closed", statusText: "Closed Class Full (120)", days: "MW", time: "2:00pm-3:50pm", location: "Boelter Hall 3400", units: "3.0", instructor: "Eggert, P.R.", rating: "3.4", color: "#2b7fb8", final: "Wednesday December 9, 2026 3pm-6pm", finalNote: "Check back on 11/23/2026 (Monday of 9th week) for final exam location" },
  { subject: "Ling", number: "1", title: "Introduction to Study of Language", status: "open", statusText: "Open: 40 of 250 Left", days: "TR", time: "11:00am-12:15pm", location: "Haines Hall 39", units: "5.0", instructor: "Sportiche, D.", rating: "4.8", color: "#3f9c5b", final: "Thursday December 10, 2026 8am-11am", finalNote: "Check back on 11/23/2026 (Monday of 9th week) for final exam location" },
  { subject: "Math", number: "33B", title: "Differential Equations", status: "waitlist", statusText: "Waitlist: 3 of 10 Taken", days: "MWF", time: "9:00am-9:50am", location: "MS 5117", units: "4.0", instructor: "Liu, C.", rating: "3.1", color: "#d98f2a", final: "Friday December 11, 2026 8am-11am", finalNote: "Check back on 11/23/2026 (Monday of 9th week) for final exam location", conflicts: ["PHYSICS 1B"] },
  { subject: "Physics", number: "1B", title: "Physics for Scientists and Engineers: Oscillations", status: "open", statusText: "Open: 8 of 200 Left", days: "MWF", time: "9:00am-9:50am", location: "Young CS50", units: "5.0", instructor: "Arisaka, K.", rating: "2.9", color: "#8c8c8c", final: "Friday December 11, 2026 8am-11am", finalNote: "Check back on 11/23/2026 (Monday of 9th week) for final exam location", conflicts: ["MATH 33B"] },
  { subject: "Psych", number: "10", title: "Introductory Psychology", status: "closed", statusText: "Closed Class Full (400)", days: "TR", time: "2:00pm-3:15pm", location: "Fowler A103B", units: "4.0", instructor: "Fried, I.", rating: "4.4", color: "#c45ca0", final: "Tuesday December 8, 2026 3pm-6pm", finalNote: "Check back on 11/23/2026 (Monday of 9th week) for final exam location" },
  { subject: "Econ", number: "11", title: "Microeconomic Theory", status: "enrolled", statusText: "Enrolled Class Full (250)", days: "MW", time: "12:30pm-1:45pm", location: "Rolfe 1200", units: "4.0", instructor: "Buchholz, T.", rating: "3.8", color: "#4a6fb5", final: "Monday December 7, 2026 11:30am-2:30pm", finalNote: "Check back on 11/23/2026 (Monday of 9th week) for final exam location" },
  { subject: "Art", number: "10", title: "Drawing and Color", status: "open", statusText: "Open: 2 of 20 Left", days: "F", time: "1:00pm-3:50pm", location: "Broad 2160E", units: "4.0", instructor: "Ryman, W.", rating: "4.9", color: "#e0b93f", final: "Consult instructor for method of evaluation" },
  { subject: "Hist", number: "1C", title: "Introduction to Western Civilization", status: "open", statusText: "Open: 55 of 120 Left", days: "TR", time: "3:30pm-4:45pm", location: "Dodd 147", units: "5.0", instructor: "Sabean, D.", rating: "3.6", color: "#6ba43a", final: "Thursday December 10, 2026 3pm-6pm", finalNote: "Check back on 11/23/2026 (Monday of 9th week) for final exam location" },
  { subject: "Chem", number: "14B", title: "Thermodynamics and Electrochemistry", status: "waitlist", statusText: "Waitlist: 12 of 15 Taken", days: "MWF", time: "10:00am-10:50am", location: "Young CS24", units: "4.0", instructor: "Lavelle, L.", rating: "4.1", color: "#2f9e9e", final: "Wednesday December 9, 2026 8am-11am", finalNote: "Check back on 11/23/2026 (Monday of 9th week) for final exam location" },
  { subject: "Anthro", number: "7", title: "Human Evolution", status: "enrolled", statusText: "Enrolled Class Full (180)", days: "TR", time: "8:00am-9:15am", location: "Haines 220", units: "5.0", instructor: "Boyd, R.", rating: "3.3", color: "#a56a3f", final: "Tuesday December 8, 2026 8am-11am", finalNote: "Check back on 11/23/2026 (Monday of 9th week) for final exam location" },
  { subject: "Economics", number: "172", title: "Economic and Legal Issues for Startups", status: "closed", statusText: "Closed Class Full (36)", days: "MW", time: "3:30pm-4:45pm", location: "Bunche Hall 3153", units: "4.0", instructor: "Metzger, J.", rating: "N/A", color: "#9fc5e8", final: "Friday December 11, 2026 3pm-6pm", finalNote: "Check back on 11/23/2026 (Monday of 9th week) for final exam location", finalNote: "Check back on 11/23/2026 (Monday of 9th week) for final exam location", conflicts: ["EC ENGR M146", "EC ENGR C147A", "MGMT 108"] },
  { subject: "Management", number: "108", title: "Business Law", status: "closed", statusText: "Closed Class Full (60)", days: "MW", time: "3:30pm-4:45pm", location: "Anderson C301", units: "4.0", instructor: "Kim, S.", rating: "3.9", color: "#cc0000", final: "Friday December 11, 2026 3pm-6pm", finalNote: "Check back on 11/23/2026 (Monday of 9th week) for final exam location", conflicts: ["ECON 172"] },
  { subject: "EC Engr", number: "M146", title: "Introduction to Machine Learning", status: "closed", statusText: "Closed Class Full (90)", days: "MW", time: "4:00pm-5:50pm", location: "Boelter 5249", units: "4.0", instructor: "Chang, K.W.", rating: "4.0", color: "#674ea7", final: "Monday December 7, 2026 3pm-6pm", finalNote: "Check back on 11/23/2026 (Monday of 9th week) for final exam location", conflicts: ["ECON 172"] },
  { subject: "Ling", number: "20", title: "Introduction to Linguistic Analysis", status: "open", statusText: "Open: 18 of 60 Left", days: "TR", time: "5:00pm-6:15pm", location: "Bunche 3164", units: "4.0", instructor: "Hyams, N.", rating: "4.6", color: "#38761d", final: "Thursday December 10, 2026 6:30pm-9:30pm", finalNote: "Check back on 11/23/2026 (Monday of 9th week) for final exam location" }
];

const STATUS_ICON = {
  open: '<span class="icon-unlock" style="color:#3f9c5b"></span>',
  waitlist: '<span class="icon-unlock" style="color:#d98f2a"></span>',
  closed: '<span class="icon-lock" style="color:#cc0000"></span>',
  enrolled: '<span class="icon-ok-sign" style="color:#2b7fb8"></span>'
};

function classId(index) {
  return String(26440000 + index * 12345);
}

function command(direction, id) {
  const action = direction === "up" ? "moveupClass" : "movedownClass";
  return `courseListAction($(&quot;.maincontentpanel&quot;)[0].id, &quot;${TRACKER}&quot;, &quot;${COMMAND}&quot;, &quot;${action}|${id}!0&quot;); return false;`;
}

function conflictPopover(codes) {
  if (!codes || codes.length === 0) return "";
  const items = codes.map((code) => `&lt;li&gt;${code}&lt;/li&gt;`).join("");
  const content =
    `&lt;div class=&quot;popover_section_title warning light&quot;&gt;Warning: Time Conflicts&lt;/div&gt;` +
    `&lt;ul class=&#39;bulleted_list&#39;&gt;${items}&lt;/ul&gt;`;
  return `<a href="#" class="uit-clickover-bottom" data-content="${content}" title="Time Conflict Info" aria-label="Time Conflict Info"><span class="icon-warning-sign"></span></a>`;
}

function card(course, index, total) {
  const id = classId(index);
  const first = index === 0;
  const last = index === total - 1;
  // The live page puts the exam line and the location advisory in one
  // inline-block span separated by a bare `<br>`, so `textContent` runs them
  // together: "8am-11amCheck back on ...". Keep that shape here or a parser
  // written against this fixture will not survive the real page.
  const finalNote = course.finalNote || "";
  return `
  <tbody class="Class${id} courseItem itemClass${first ? " firstClass" : ""}">
    <tr>
      <td class="SubjectAreaName_ClassName">
        <p>Class ${index + 1}: ${course.subject}</p>
        <p>${course.number} - ${course.title}</p>
      </td>
      <td class="linkPanelRight" rowspan="2">
        <div class="OrderingButtons">
          <span class="colorswatch" style="background:${course.color}"></span>
          <button id="muClass${id}" class="link moveupClass"
            title="Move this Class up in the list" aria-label="Move this Class up in the list"
            onclick="${command("up", id)}"
            style="visibility:${first ? "hidden" : "visible"}"><span class="icon-circle-arrow-up"></span></button>
          <button id="mdClass${id}" class="link movedownClass"
            title="Move this Class down in the list" aria-label="Move this Class down in the list"
            onclick="${command("down", id)}"
            style="visibility:${last ? "hidden" : "visible"}"><span class="icon-circle-arrow-down"></span></button>
        </div>
      </td>
    </tr>
    <tr>
      <td>
        <div class="final_exam_info exam_conflict"><span style="font-weight: bold; ">Final Exam:</span> <span style="display: inline-block; vertical-align: top;">${course.final}<br>${finalNote ? `${finalNote}<br>` : ""}</span>${conflictPopover(course.conflicts)}</div>
      </td>
    </tr>
    <tr>
      <td colspan="2">
        <table class="coursetable">
          <tr>
            <th class="changecol">Change</th><th>Section</th><th>Status</th><th>Info</th>
            <th>Days</th><th>Time</th><th>Location</th><th>Units</th><th>Instructor</th>
          </tr>
          <tr>
            <td class="changecol"><a href="#" class="edit"><span class="icon-pencil"></span></a></td>
            <td><a href="#">Lec 1</a></td>
            <td>${STATUS_ICON[course.status]}${course.statusText}</td>
            <td>${course.conflicts ? '<span class="icon-warning-sign" style="color:#e0a53f"></span>' : '<span class="icon-info-sign" style="color:#2b7fb8"></span>'}</td>
            <td><a href="#">${course.days}</a></td>
            <td>${course.time}</td>
            <td>${course.location.includes("Online") ? '<a href="#">Online</a>' : course.location}</td>
            <td>${course.units}</td>
            <td class="hide-small">${course.instructor} <span class="rating ${course.rating === "N/A" ? "na" : "ok"}">${course.rating}</span></td>
          </tr>
        </table>
      </td>
    </tr>
  </tbody>
  <tbody class="course_divider"><tr><td colspan="2">&nbsp;</td></tr></tbody>`;
}

export function fixtureHtml(count = COURSES.length) {
  const list = COURSES.slice(0, count);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>UCLA Class Planner</title>
<style>
  body { margin:0; background:#fff; color:#4e4e4e; font-family: Verdana, Geneva, sans-serif; font-size:12px; }
  .pagehead { padding:14px 24px; border-bottom:3px solid #0055a6; }
  .pagehead h1 { margin:0; color:#0055a6; font-size:22px; font-weight:600; }
  .maincontentpanel { padding: 14px 24px 60px; }
  #div_landing > table { width:100%; border-collapse:collapse; }
  tbody.course_divider td { height:14px; padding:0; }
  td.SubjectAreaName_ClassName { padding:6px 8px 0; vertical-align:top; }
  td.SubjectAreaName_ClassName p { margin:0 0 2px; color:#0055a6; font-size:15px; font-weight:bold; }
  td.SubjectAreaName_ClassName p + p { margin:0 0 4px; color:#0055a6; font-size:15px; font-weight:bold; }
  td.linkPanelRight { padding:6px 8px 0; text-align:right; vertical-align:top; white-space:nowrap; }
  .OrderingButtons { display:inline-block; text-align:right; white-space:nowrap; }
  /* Stand-ins for MyUCLA's iwe_icon_fonts.css, so layout can be judged. */
  [class^="icon-"], [class*=" icon-"] { display:inline-block; font-style:normal; }
  .icon-circle-arrow-up::before { content:"⬆"; }
  .icon-circle-arrow-down::before { content:"⬇"; }
  .icon-reorder::before { content:"≡"; }
  .icon-double-angle-up::before { content:"«"; transform:rotate(90deg); display:inline-block; }
  .icon-tag::before { content:"◇"; }
  .icon-chevron-down::before { content:"⌄"; }
  .icon-ellipsis-horizontal::before { content:"⋯"; }
  .icon-arrow-up::before { content:"↑"; }
  .icon-arrow-down::before { content:"↓"; }
  .icon-warning-sign::before { content:"⚠"; }
  .icon-lock::before { content:"🔒"; }
  .icon-unlock::before { content:"🔓"; }
  .icon-ok-sign::before { content:"✓"; }
  .icon-info-sign::before { content:"ℹ"; }
  .icon-pencil::before { content:"✎"; }
  .icon-minus-sign::before { content:"⊖"; }
  .colorswatch { display:inline-block; width:44px; height:22px; border:1px solid #767676; border-radius:2px; }
  .OrderingButtons button.link { border:0; background:none; padding:0; color:#204e91; font-size:17px; cursor:pointer; }
  .final_exam_info { padding:2px 8px 6px; border-left:3px solid #d6d6d6; margin-left:2px; }
  .final_exam_note { padding-left:76px; }
  table.coursetable { width:100%; margin:4px 0 0; border-collapse:collapse; }
  table.coursetable th { padding:5px 8px; background:#ebebeb; color:#4e4e4e; font-size:12px; text-align:left; }
  table.coursetable th.changecol { background:#24528f; color:#fff; }
  table.coursetable td { padding:6px 8px; background:#fff; }
  table.coursetable td.changecol { background:#e7eef7; text-align:center; }
  table.coursetable a { color:#073198; }
  .rating { display:inline-block; padding:2px 7px; border-radius:3px; color:#fff; font-weight:bold; }
  .rating.ok { background:#3f9c5b; }
  .rating.na { background:#4a90c4; }
  select { width:220px; } input { width:206px; }
  .classPlanner_SectionTitle { padding:5px; border-radius:7px; background:#2C5E91; color:#fff; font-family: ProximaNova, Verdana, sans-serif; font-size:14px; }
  .classPlanner_SectionTitle button.link { border:0; background:none; color:#fff; font-family:inherit; font-size:14px; cursor:pointer; padding:0; }
  .removeall { margin:10px 0; text-align:center; }
  .removeall a { color:#073198; }
  #gridDiv { position:relative; display:flex; gap:0; padding:8px 0 16px; }
  .hourbox { width:40px; font-size:11px; color:#4e4e4e; }
  .timebox { position:relative; width:130px; height:200px; border-left:1px solid #ccc; }
  .planneritembox { position:absolute; overflow:hidden; box-sizing:border-box; border:1px solid #9ba7c4; font-size:14px; text-align:center; }
</style>
</head>
<body>
<form id="aspnetForm" method="post" action="/ClassPlanner/ClassPlan.aspx">
  <div class="pagehead"><h1>Class Planner</h1></div>
  <div class="maincontentpanel" id="main_wrapper">
    <label>Term
      <select id="ctl00_MainContent_termSessionChooser_TermChooser">
        <option value="26F" selected>Fall 2026</option>
      </select>
    </label>
    <input id="ctl00_MainContent_planIDField" type="hidden" value="1234567" />
    <div id="ctl00_MainContent_panelGrid"><div id="gridDiv" class="sgChecked">
      <div class="hourbox">8<sup>AM</sup></div>
      <div class="timebox">
        <div class="planneritembox" style="top:0px;height:48px;left:0;width:120px;background:#ecf8f9">ENGR 216<br class="hide-small"><span class="hide-above-small"> &middot; </span>Lec 1<br class="hide-small"><span class="hide-above-small"> &middot; </span><span class="icon-warning-sign planConflict"></span>Physics and Astronomy Building 1425</div>
        <div class="planneritembox" style="top:60px;height:86px;left:0;width:120px;background:#f6ecf9">MCD BIO 60<br class="hide-small"><span class="hide-above-small"> &middot; </span>Lec 1<br class="hide-small"><span class="hide-above-small"> &middot; </span>Bunche Hall 3153</div>
        <div class="planneritembox smallitem" style="top:150px;height:34px;left:0;width:58px;background:#eef0fa">MGMT 170<br class="hide-small"><span class="hide-above-small"> &middot; </span>Lec 1<br class="hide-small"><span class="hide-above-small"> &middot; </span>Entrepreneurs Hall C314</div>
      </div>
    </div></div>
    <div id="ctl00_MainContent_classPlanPanel">
      <section class="classPlanner_ClassesInPlanSection">
      <div id="plannerSectionClip" class="classPlanner_SectionTitle">
        <button type="button" class="link planSectionToggle"><span class="icon-minus-sign"></span><span>Class Plan</span></button>
      </div>
      <div id="panelPlan"><p class="removeall"><a href="#">Remove All</a> Classes from Current Plan</p><div id="div_landing"><table>
        ${list.map((course, index) => card(course, index, list.length)).join("")}
      </table></div></div>
      </section>
    </div>
  </div>
</form>
</body>
</html>`;
}
