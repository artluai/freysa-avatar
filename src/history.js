import "./history.css";
import { ACT_V_RULES, DEFAULT_MEMORIES, FREYSA_ACTS } from "./memories.js";

renderActs();
renderRules();
renderMemories();

function renderActs() {
  const timeline = document.querySelector("#acts-timeline");

  for (const act of FREYSA_ACTS) {
    const article = document.createElement("article");
    article.className = `act-card${act.current ? " act-card-current" : ""}`;

    const marker = document.createElement("div");
    marker.className = "act-marker";
    marker.textContent = act.number;

    const content = document.createElement("div");
    content.className = "act-content";

    const meta = document.createElement("p");
    meta.className = "act-meta";
    meta.textContent = act.current ? `Act ${act.number} · Current` : `Act ${act.number}`;

    const title = document.createElement("h3");
    title.textContent = act.title;

    const summary = document.createElement("p");
    summary.className = "act-summary";
    summary.textContent = act.summary;

    const lesson = document.createElement("div");
    lesson.className = "act-lesson";
    const lessonLabel = document.createElement("span");
    lessonLabel.textContent = "She learned";
    const lessonText = document.createElement("p");
    lessonText.textContent = act.lesson;
    lesson.append(lessonLabel, lessonText);

    const quote = document.createElement("blockquote");
    quote.textContent = `“${act.quote.replace(/^“|”$/g, "")}”`;

    const source = document.createElement("a");
    source.href = act.href;
    source.target = "_blank";
    source.rel = "noopener";
    source.textContent = act.current ? "Open Act V ↗" : `Visit Act ${act.number} ↗`;

    content.append(meta, title, summary, lesson, quote, source);
    article.append(marker, content);
    timeline.append(article);
  }
}

function renderRules() {
  const rules = document.querySelector("#act-v-rules");

  for (const [index, rule] of ACT_V_RULES.entries()) {
    const article = document.createElement("article");
    const number = document.createElement("span");
    number.textContent = String(index + 1).padStart(2, "0");
    const title = document.createElement("h3");
    title.textContent = rule.title;
    const text = document.createElement("p");
    text.textContent = rule.text;
    article.append(number, title, text);
    rules.append(article);
  }
}

function renderMemories() {
  const ledger = document.querySelector("#memory-ledger");

  for (const memory of DEFAULT_MEMORIES) {
    const article = document.createElement("article");
    const category = document.createElement("span");
    category.textContent = memory.category;
    const text = document.createElement("p");
    text.textContent = memory.text;
    article.append(category, text);
    ledger.append(article);
  }
}
