import fs from "node:fs/promises";
import path from "node:path";

export const TOPICS = [
  "社会与民生",
  "教育与科研",
  "科技与互联网",
  "环境与可持续发展",
  "经济与商业",
  "文化与艺术",
  "医疗与健康",
];

export function parseFrontMatter(source) {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) return { data: {}, body: normalized };
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) return { data: {}, body: normalized };
  const block = normalized.slice(4, end);
  const data = {};
  for (const rawLine of block.split("\n")) {
    const match = rawLine.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else if (/^\d+$/.test(value)) {
      value = Number(value);
    } else if (/^(true|false)$/i.test(value)) {
      value = value.toLowerCase() === "true";
    } else if (value === "null" || value === "") {
      value = null;
    }
    data[match[1]] = value;
  }
  return { data, body: normalized.slice(end + 5) };
}

export function serializeFrontMatter(data, body) {
  const keys = ["id", "title", "slug", "topic", "date", "score", "draft"];
  const lines = ["---"];
  for (const key of keys) {
    if (!(key in data) || data[key] === null || data[key] === "") continue;
    const value = typeof data[key] === "string" && /[:#]/.test(data[key]) ? JSON.stringify(data[key]) : String(data[key]);
    lines.push(`${key}: ${value}`);
  }
  lines.push("---", "", body.trim(), "");
  return lines.join("\n");
}

export function canonicalSection(title) {
  const key = title.replace(/[一二三四五六七八九十0-9、.．｜|:：\s～~-]/g, "").toLowerCase();
  if (/(文章)?原文|全文|original/.test(key)) return "original";
  if (/主线|主旨|核心逻辑|文章逻辑|概览/.test(key)) return "summary";
  if (/错题|错误|误认|错因|复盘/.test(key)) return "mistakes";
  if (/重点词汇|熟词僻义|单词|词汇/.test(key)) return "vocabulary";
  if (/词组|词块|固定搭配|高价值表达|必须整块/.test(key)) return "phrases";
  if (/句式|结构|长难句/.test(key)) return "sentences";
  if (/逻辑关系/.test(key)) return "logic";
  if (/薄弱点|提醒/.test(key)) return "weaknesses";
  if (/最值得背|速记|总结/.test(key)) return "takeaways";
  return "other";
}

export function parseSections(body) {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const sections = [];
  let current = { title: "导言", kind: "intro", body: [] };
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      if (current.body.join("\n").trim()) sections.push({ ...current, body: current.body.join("\n").trim() });
      current = { title: heading[1].trim(), kind: canonicalSection(heading[1]), body: [] };
    } else if (!/^#\s+/.test(line)) {
      current.body.push(line);
    }
  }
  if (current.body.join("\n").trim()) sections.push({ ...current, body: current.body.join("\n").trim() });
  return sections;
}

export function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function replaceAnnotations(markdown) {
  const classes = { v: "term", p: "phrase", e: "mistake", s: "pattern" };
  return markdown.replace(/\[\[([vpes]):([^\]]+?)\]\]/g, (_, type, text) => `<mark class="${classes[type]}">${htmlEscape(text.trim())}</mark>`);
}

function renderInline(source) {
  let html = htmlEscape(source);
  html = html.replace(/\[\[([vpes]):([^\]]+?)\]\]/g, (_, type, text) => {
    const classes = { v: "term", p: "phrase", e: "mistake", s: "pattern" };
    return `<mark class="${classes[type]}">${text.trim()}</mark>`;
  });
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|#[^\s)]+)\)/g, '<a href="$2">$1</a>');
  return html;
}

export function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const output = [];
  let paragraph = [];
  let list = null;
  let quote = [];
  let code = null;

  const flushParagraph = () => {
    if (paragraph.length) output.push(`<p>${renderInline(paragraph.join(" ").trim())}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) output.push(`<${list.type}>${list.items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${list.type}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) output.push(`<blockquote>${quote.map((line) => `<p>${renderInline(line)}</p>`).join("")}</blockquote>`);
    quote = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (code !== null) {
      if (/^```/.test(line)) {
        output.push(`<pre><code>${htmlEscape(code.join("\n"))}</code></pre>`);
        code = null;
      } else code.push(line);
      continue;
    }
    if (/^```/.test(line)) {
      flushParagraph(); flushList(); flushQuote(); code = [];
      continue;
    }
    if (!line.trim()) {
      flushParagraph(); flushList(); flushQuote();
      continue;
    }
    const heading = line.match(/^(#{3,6})\s+(.+)$/);
    if (heading) {
      flushParagraph(); flushList(); flushQuote();
      const level = heading[1].length;
      output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushParagraph(); flushList();
      quote.push(line.replace(/^>\s?/, ""));
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (bullet || ordered) {
      flushParagraph(); flushQuote();
      const type = bullet ? "ul" : "ol";
      if (list && list.type !== type) flushList();
      if (!list) list = { type, items: [] };
      list.items.push((bullet || ordered)[1]);
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flushParagraph(); flushList(); flushQuote(); output.push("<hr>");
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph(); flushList(); flushQuote();
  if (code !== null) output.push(`<pre><code>${htmlEscape(code.join("\n"))}</code></pre>`);
  return output.join("\n");
}

export function stripMarkdown(markdown) {
  return markdown
    .replace(/\[\[[vpes]:([^\]]+?)\]\]/g, "$1")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(value) {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `reading-${Date.now()}`;
}

export function normalizeForScan(value) {
  return stripMarkdown(value)
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[–—-]/g, " ")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value) {
  return normalizeForScan(value).match(/[a-z]+(?:'[a-z]+)*/g) ?? [];
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function countForms(text, forms) {
  const normalized = normalizeForScan(text);
  const tokens = tokenize(text);
  let total = 0;
  for (const rawForm of forms?.length ? forms : []) {
    const form = normalizeForScan(rawForm);
    if (!form) continue;
    if (!form.includes(" ")) {
      total += tokens.filter((token) => token === form).length;
      continue;
    }
    const pattern = escapeRegex(form).replace(/\\ /g, "\\s+").replace(/ /g, "\\s+");
    const matches = normalized.match(new RegExp(`(?<![a-z])${pattern}(?![a-z])`, "g"));
    total += matches?.length ?? 0;
  }
  return total;
}

export async function loadArticles(root) {
  const dir = path.join(root, "content", "articles");
  const names = (await fs.readdir(dir)).filter((name) => name.endsWith(".md")).sort();
  const articles = [];
  for (const name of names) {
    const source = await fs.readFile(path.join(dir, name), "utf8");
    const { data, body } = parseFrontMatter(source);
    const sections = parseSections(body);
    articles.push({ ...data, file: name, body, sections });
  }
  return articles;
}

export async function loadRecords(root) {
  const dir = path.join(root, "content", "records");
  const names = (await fs.readdir(dir)).filter((name) => name.endsWith(".json")).sort();
  return Promise.all(names.map(async (name) => ({
    file: name,
    ...(JSON.parse(await fs.readFile(path.join(dir, name), "utf8"))),
  })));
}

export function mergeTrackedEntries({ articles, records, field }) {
  const published = articles.filter((article) => !article.draft);
  const articleById = new Map(published.map((article) => [Number(article.id), article]));
  const recordByArticle = new Map(records.map((record) => [Number(record.articleId), record]));
  const catalog = new Map();

  for (const record of records) {
    const article = articleById.get(Number(record.articleId));
    if (!article) continue;
    for (const raw of record[field] ?? []) {
      const key = raw.term.trim().toLowerCase();
      if (!catalog.has(key)) {
        catalog.set(key, {
          term: raw.term.trim(),
          meaning: raw.meaning?.trim() ?? "",
          meanings: [],
          forms: new Set(),
          topics: new Set(),
          examples: [],
          errors: new Map(),
          noteSources: new Set(),
        });
      }
      const entry = catalog.get(key);
      if (raw.meaning?.trim() && raw.meaning.trim() !== entry.meaning) entry.meanings.push(raw.meaning.trim());
      for (const form of raw.forms?.length ? raw.forms : [raw.term]) entry.forms.add(form);
      entry.topics.add(article.topic);
      entry.noteSources.add(article.slug);
      for (const example of raw.examples ?? []) {
        const sentence = typeof example === "string" ? example : example.text;
        const signature = `${article.slug}\u0000${sentence}`;
        if (!entry.examples.some((item) => item.signature === signature)) {
          entry.examples.push({ signature, text: sentence, articleId: article.id, articleTitle: article.title, slug: article.slug });
        }
      }
      for (const error of raw.errors ?? []) {
        if (!error.id) throw new Error(`${record.file}: ${raw.term} has an error without a stable id`);
        entry.errors.set(error.id, { ...error, articleId: article.id, articleTitle: article.title, slug: article.slug });
      }
    }
  }

  const output = [];
  for (const entry of catalog.values()) {
    let appearances = 0;
    const sources = [];
    for (const article of published) {
      const original = article.sections.filter((section) => section.kind === "original").map((section) => section.body).join("\n");
      const count = original ? countForms(original, [...entry.forms]) : 0;
      const noted = recordByArticle.get(Number(article.id))?.[field]?.some((item) => item.term.trim().toLowerCase() === entry.term.toLowerCase());
      if (count > 0 || noted) {
        sources.push({ id: article.id, title: article.title, slug: article.slug, count });
        entry.topics.add(article.topic);
      }
      appearances += count;
    }
    output.push({
      term: entry.term,
      meaning: entry.meaning,
      meanings: [...new Set(entry.meanings)].filter(Boolean),
      forms: [...entry.forms],
      appearances,
      errorCount: entry.errors.size,
      errors: [...entry.errors.values()],
      topics: [...entry.topics].sort((a, b) => TOPICS.indexOf(a) - TOPICS.indexOf(b)),
      examples: entry.examples.map(({ signature, ...rest }) => rest),
      sources,
    });
  }
  return output.sort((a, b) => a.term.localeCompare(b.term, "en"));
}

export function validateNotebook(articles, records) {
  const problems = [];
  const ids = new Set();
  const slugs = new Set();
  for (const article of articles) {
    if (!Number.isInteger(Number(article.id))) problems.push(`${article.file}: id must be an integer`);
    if (ids.has(Number(article.id))) problems.push(`${article.file}: duplicate id ${article.id}`);
    ids.add(Number(article.id));
    if (!article.slug) problems.push(`${article.file}: missing slug`);
    if (slugs.has(article.slug)) problems.push(`${article.file}: duplicate slug ${article.slug}`);
    slugs.add(article.slug);
    if (!article.draft && !TOPICS.includes(article.topic)) problems.push(`${article.file}: invalid topic ${article.topic}`);
  }
  const errorIds = new Set();
  for (const record of records) {
    for (const field of ["vocabulary", "phrases", "sentences"]) {
      for (const item of record[field] ?? []) {
        if (!item.term || !item.meaning) problems.push(`${record.file}: ${field} entry requires term and meaning`);
        for (const error of item.errors ?? []) {
          if (errorIds.has(error.id)) problems.push(`${record.file}: duplicate error id ${error.id}`);
          errorIds.add(error.id);
        }
      }
    }
  }
  if (problems.length) throw new Error(`Notebook validation failed:\n- ${problems.join("\n- ")}`);
}

export function findTitle(raw) {
  const front = parseFrontMatter(raw);
  if (front.data.title) return String(front.data.title);
  const heading = raw.match(/^#\s+(.+)$/m)?.[1] ?? raw.match(/《([^》]+)》/)?.[1] ?? "";
  return heading
    .replace(/英语一?精读\s*\d*\s*[｜|:：-]?\s*/i, "")
    .trim();
}

export function extractId(raw) {
  const front = parseFrontMatter(raw);
  if (front.data.id) return Number(front.data.id);
  const match = raw.match(/英语一?精读\s*0*(\d+)/i);
  return match ? Number(match[1]) : null;
}

export function formatId(id) {
  return String(id).padStart(3, "0");
}
