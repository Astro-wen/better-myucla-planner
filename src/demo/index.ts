import { startPlannerLift } from "../content/index";

interface DemoCourse {
  id: string;
  title: string;
  detail: string;
}

const initialCourses: DemoCourse[] = [
  { id: "demo-01", title: "MATH 31A", detail: "LEC 1 · MWF 9:00–9:50" },
  { id: "demo-02", title: "COM SCI 31", detail: "LEC 2 · TR 10:00–11:50" },
  { id: "demo-03", title: "ENGCOMP 3", detail: "LEC 4 · MWF 11:00–11:50" },
  { id: "demo-04", title: "PHYSICS 1A", detail: "LEC 1 · TR 12:30–1:45" },
  { id: "demo-05", title: "LING 1", detail: "LEC 3 · MWF 1:00–1:50" },
  { id: "demo-06", title: "ECON 1", detail: "LEC 2 · TR 2:00–3:15" },
  { id: "demo-07", title: "STATS 10", detail: "LEC 1 · MWF 2:00–2:50" },
  { id: "demo-08", title: "HIST 13B", detail: "LEC 1 · TR 3:30–4:45" },
  { id: "demo-09", title: "ART HIS 20", detail: "LEC 2 · MWF 3:00–3:50" },
  { id: "demo-10", title: "FILM TV 4", detail: "LEC 1 · W 4:00–6:50" },
  { id: "demo-11", title: "ASTR 3", detail: "LEC 2 · TR 5:00–6:15" },
  { id: "demo-12", title: "PSYCH 10", detail: "LEC 4 · MWF 4:00–4:50" }
];

let courses = [...initialCourses];

function renderNativePlanner(): void {
  const root = document.querySelector<HTMLElement>("[data-bf-course-list]");
  if (!root) {
    return;
  }

  const fragment = document.createDocumentFragment();
  courses.forEach((course, index) => {
    const card = document.createElement("article");
    card.dataset.bfCourseCard = "true";
    card.dataset.bfCourseId = course.id;

    const copy = document.createElement("div");
    copy.className = "pl-course-copy";
    const title = document.createElement("h3");
    title.dataset.bfCourseTitle = "true";
    title.textContent = `${index + 1}. ${course.title}`;
    const detail = document.createElement("p");
    detail.textContent = course.detail;
    copy.append(title, detail);

    const actions = document.createElement("div");
    actions.className = "pl-native-actions";

    const upButton = document.createElement("button");
    upButton.type = "button";
    upButton.dataset.bfNativeAction = "up";
    upButton.setAttribute("aria-label", `Move ${course.title} up`);
    upButton.textContent = "↑";
    upButton.disabled = index === 0;
    upButton.addEventListener("click", () => moveNative(course.id, "up"));

    const downButton = document.createElement("button");
    downButton.type = "button";
    downButton.dataset.bfNativeAction = "down";
    downButton.setAttribute("aria-label", `Move ${course.title} down`);
    downButton.textContent = "↓";
    downButton.disabled = index === courses.length - 1;
    downButton.addEventListener("click", () => moveNative(course.id, "down"));

    const enrollButton = document.createElement("button");
    enrollButton.type = "button";
    enrollButton.className = "pl-danger-demo";
    enrollButton.dataset.bfDangerousAction = "enroll";
    enrollButton.textContent = "Enroll (decoy)";
    enrollButton.addEventListener("click", () => {
      window.alert("Safety test failed: reordering should never click this button.");
    });

    actions.append(upButton, downButton, enrollButton);
    card.append(copy, actions);
    fragment.append(card);
  });

  root.replaceChildren(fragment);
}

function moveNative(courseId: string, direction: "up" | "down"): void {
  const currentIndex = courses.findIndex((course) => course.id === courseId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= courses.length) {
    return;
  }

  [courses[currentIndex], courses[targetIndex]] = [courses[targetIndex], courses[currentIndex]];
  renderNativePlanner();

  const liveRegion = document.getElementById("demo-live-region");
  if (liveRegion) {
    liveRegion.textContent = `${courseId} moved ${direction}`;
  }
}

renderNativePlanner();
void startPlannerLift();
