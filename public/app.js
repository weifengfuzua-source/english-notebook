import { renderReading, bindReading } from "./reading.js?v=__BUILD_ID__";

const TOPICS = ["社会与民生", "教育与科研", "科技与互联网", "环境与可持续发展", "经济与商业", "文化与艺术", "医疗与健康"];
const main = document.querySelector("main");
const navLinks = [...document.querySelectorAll("[data-route]")];
let notebook;
let selectedTopic = "全部";
let entryMode = "vocabulary";
let query = "";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function routeInfo() {
  const bits = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  return { route: bits[0] || "articles", slug: bits[1] || null };
}

function setActiveNav(route) {
  navLinks.forEach((link) => link.toggleAttribute("aria-current", link.dataset.route === route));
}

function articleList(activeSlug) {
  return `<ul class="article-list">${notebook.articles.map((article) => `
    <li><a href="#/articles/${encodeURIComponent(article.slug)}" ${article.slug === activeSlug ? 'aria-current="page"' : ""}>
      <span class="article-number">READING ${String(article.id).padStart(2, "0")}</span>
      <span class="article-title-small">${escapeHtml(article.title)}</span>
    </a></li>`).join("")}</ul>`;
}

function renderArticles(slug) {
  const article = notebook.articles.find((item) => item.slug === slug) ?? notebook.articles[0];
  if (!article) {
    main.innerHTML = '<div class="empty-state">还没有可展示的文章。</div>';
    return;
  }
  if (!slug || slug !== article.slug) history.replaceState(null, "", `#/articles/${article.slug}`);
  const options = notebook.articles.map((item) => `<option value="${escapeHtml(item.slug)}" ${item.slug === article.slug ? "selected" : ""}>${String(item.id).padStart(2, "0")} · ${escapeHtml(item.title)}</option>`).join("");
  const sectionOrder = article.reading ? [...article.sections.filter((section) => section.kind === "original"), ...article.sections.filter((section) => section.kind !== "original")] : article.sections;
  const sections = sectionOrder.map((section) => article.reading && section.kind === "original" ? renderReading(article.reading) : `
    <section class="article-section" data-kind="${section.kind}">
      <h2>${escapeHtml(section.title)}</h2>
      <div class="prose ${section.kind === "original" ? "reading-text" : ""}">${section.html}</div>
    </section>`).join("");
  main.innerHTML = `
    <div class="article-layout">
      <aside class="article-sidebar" aria-label="文章列表"><h2>ARTICLES</h2>${articleList(article.slug)}</aside>
      <article class="article-page ${article.reading ? "golden-reading" : ""}">
        <label class="mobile-article-select">选择文章
          <select id="article-select">${options}</select>
        </label>
        <header class="article-header">
          <p class="eyebrow">READING ${String(article.id).padStart(2, "0")}</p>
          <h1>${escapeHtml(article.title)}</h1>
          <div class="article-meta"><span class="topic-label">${escapeHtml(article.topic)}</span>${article.date ? `<span>${escapeHtml(article.date)}</span>` : ""}${article.score ? `<span class="score-label">原记录：${escapeHtml(article.score)}</span>` : ""}</div>
        </header>
        ${sections}
      </article>
    </div>`;
  document.querySelector("#article-select")?.addEventListener("change", (event) => { location.hash = `#/articles/${event.target.value}`; });
  if (article.reading) bindReading(document.querySelector(".annotated-reading"), article.reading);
}

function entryMatches(entry) {
  const matchesTopic = selectedTopic === "全部" || entry.topics.includes(selectedTopic);
  const needle = query.trim().toLowerCase();
  const matchesQuery = !needle || `${entry.term} ${entry.meaning} ${entry.meanings.join(" ")} ${entry.errors.map((item) => item.note).join(" ")}`.toLowerCase().includes(needle);
  return matchesTopic && matchesQuery;
}

function renderEntry(entry) {
  const extraMeanings = entry.meanings.length ? `<div class="muted">另见：${escapeHtml(entry.meanings.join("；"))}</div>` : "";
  const errors = entry.errors.length ? `<h3>真实错误记录</h3>${entry.errors.map((error) => `<div class="error-note">${escapeHtml(error.note)} <span class="source-name">— ${escapeHtml(error.articleTitle)}</span></div>`).join("")}` : "";
  const examples = entry.examples.length ? `<h3>遇到的原句</h3><ul>${entry.examples.map((example) => `<li>${escapeHtml(example.text)} <span class="source-name">— ${escapeHtml(example.articleTitle)}</span></li>`).join("")}</ul>` : "";
  const sources = entry.sources.length ? `<h3>来源文章</h3><ul>${entry.sources.map((source) => `<li><a href="#/articles/${encodeURIComponent(source.slug)}">${escapeHtml(source.title)}</a> <span class="source-name">原文出现 ${source.count}</span></li>`).join("")}</ul>` : "";
  return `<details class="entry">
    <summary><span class="entry-title">${escapeHtml(entry.term)}<span class="entry-meaning">${escapeHtml(entry.meaning)}</span></span>
      <span class="entry-stats"><span>出现 ${entry.appearances}</span><span class="${entry.errorCount ? "has-error" : ""}">错误 ${entry.errorCount}</span></span>
    </summary>
    <div class="entry-body">${extraMeanings}${errors}${examples}${sources}</div>
  </details>`;
}

function bindVocabularyControls() {
  document.querySelector("#entry-search")?.addEventListener("input", (event) => { query = event.target.value; updateEntryList(); });
  document.querySelectorAll("[data-topic]").forEach((button) => button.addEventListener("click", () => {
    selectedTopic = button.dataset.topic;
    document.querySelectorAll("[data-topic]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    updateEntryList();
  }));
  document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => {
    entryMode = button.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    updateEntryList();
  }));
}

function updateEntryList() {
  const list = entryMode === "phrases" ? notebook.phrases : notebook.vocabulary;
  const filtered = list.filter(entryMatches);
  const label = entryMode === "phrases" ? "词块" : "词汇";
  document.querySelector("#entry-count").textContent = `共 ${filtered.length} 条${label}。出现次数只扫描文章“原文”；错误次数只来自明确错误记录。`;
  document.querySelector("#entry-list").innerHTML = filtered.length ? filtered.map(renderEntry).join("") : '<div class="empty-state">没有符合条件的条目。</div>';
}

function renderVocabulary() {
  main.innerHTML = `
    <header class="page-heading"><p class="eyebrow">LEXICON</p><h1>词汇</h1><p class="lede">单词与固定词块共用来源统计，但不会混在一起计数。点击条目查看原句、来源和真实错误。</p></header>
    <div class="toolbar">
      <div class="segments" aria-label="条目类型">
        <button class="segment-button" data-mode="vocabulary" aria-pressed="${entryMode === "vocabulary"}">单词</button>
        <button class="segment-button" data-mode="phrases" aria-pressed="${entryMode === "phrases"}">词块</button>
      </div>
      <input id="entry-search" class="search-input" type="search" value="${escapeHtml(query)}" placeholder="搜索词、中文义或错误记录" aria-label="搜索词汇" />
      <div class="topic-filters" aria-label="按主题筛选">${["全部", ...TOPICS].map((topic) => `<button class="filter-button" data-topic="${topic}" aria-pressed="${selectedTopic === topic}">${topic}</button>`).join("")}</div>
    </div>
    <p id="entry-count" class="count-note"></p><div id="entry-list" class="entry-list"></div>`;
  bindVocabularyControls();
  updateEntryList();
}

function renderSentences() {
  main.innerHTML = `
    <header class="page-heading"><p class="eyebrow">TRANSFERABLE PATTERNS</p><h1>句式</h1><p class="lede">这里只保留真正有迁移价值的结构，不扩写成完整语法课。</p></header>
    <p class="count-note">共 ${notebook.sentences.length} 条句式。出现次数来自原文中登记过的实际形式。</p>
    <div class="entry-list">${notebook.sentences.map(renderEntry).join("") || '<div class="empty-state">还没有句式记录。</div>'}</div>`;
}

function render() {
  const { route, slug } = routeInfo();
  setActiveNav(route);
  if (route === "vocabulary") renderVocabulary();
  else if (route === "sentences") renderSentences();
  else renderArticles(slug);
  window.scrollTo({ top: 0, behavior: "instant" });
}

async function start() {
  try {
    const response = await fetch(`./data/site.json?v=__BUILD_ID__`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    notebook = await response.json();
    addEventListener("hashchange", render);
    render();
  } catch (error) {
    main.innerHTML = `<div class="notice warning"><strong>网站数据读取失败。</strong><br>${escapeHtml(error.message)}</div>`;
  }
}

start();
