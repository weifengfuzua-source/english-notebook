import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  TOPICS,
  canonicalSection,
  extractId,
  findTitle,
  formatId,
  loadArticles,
  parseFrontMatter,
  serializeFrontMatter,
  slugify,
} from "./lib/notebook.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INBOX = path.join(ROOT, "inbox", "new-reading.md");
const RAW = await fs.readFile(INBOX, "utf8");
if (!RAW.trim() || RAW.includes("<!-- paste-reading-here -->")) {
  throw new Error("inbox/new-reading.md 仍是空模板；请先粘贴完整精读总结。 ");
}

function argValue(name) {
  const direct = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function sectionize(raw) {
  const { body } = parseFrontMatter(raw);
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const sections = [];
  let current = { title: "精读记录", kind: "other", lines: [] };
  const push = () => {
    const content = current.lines.join("\n").trim();
    if (content) sections.push({ ...current, content });
  };
  for (const line of lines) {
    const markdown = line.match(/^#{1,3}\s+(.+?)\s*$/)?.[1];
    const chinese = line.match(/^(?:[一二三四五六七八九十]+|\d+)[、.．]\s*(.+?)\s*$/)?.[1];
    const candidate = markdown || chinese;
    if (candidate && canonicalSection(candidate) !== "other") {
      push();
      current = { title: candidate, kind: canonicalSection(candidate), lines: [] };
    } else if (!/^#\s+/.test(line) && !/^《.*》$/.test(line.trim())) {
      current.lines.push(line);
    }
  }
  push();
  return sections;
}

const DISPLAY_TITLES = {
  original: "原文",
  summary: "文章主线",
  mistakes: "错题复盘",
  vocabulary: "重点词汇与熟词僻义",
  phrases: "高价值词块",
  sentences: "可迁移句式",
  logic: "全文重要逻辑关系",
  weaknesses: "本篇暴露的薄弱点",
  takeaways: "最值得背的表达",
};

function cleanLine(line) {
  return line
    .replace(/^\s*#{1,6}\s+/, "")
    .replace(/^\s*(?:[-*]>?|>?)\s*/, "")
    .replace(/^\d+[.)、．]\s*/, "")
    .replace(/[*_`]/g, "")
    .trim();
}

const ERROR_PATTERN = /曾误成|误成|曾误认|误认成|曾误译|误译成|错译成|之前.{0,12}(?:当成|翻成|理解成)|我.{0,10}(?:翻成|理解成)/;

function parseEntryStart(line, kind) {
  const cleaned = cleanLine(line);
  const arrow = cleaned.match(/^([A-Za-z][A-Za-z'()+/\s.-]{0,72}?)\s*(?:→|=|:|：)\s*(.+)$/);
  if (arrow && arrow[1].trim().split(/\s+/).length <= 9) return { term: arrow[1].trim(), meaning: arrow[2].trim() };
  const numbered = cleaned.match(/^([A-Za-z][A-Za-z'()+/\s.-]{0,72})$/);
  if (numbered && numbered[1].trim().split(/\s+/).length <= (kind === "sentences" ? 12 : 8)) return { term: numbered[1].trim(), meaning: "" };
  if (kind === "sentences" && /[A-Za-z]/.test(cleaned) && /\+|\bA\b|\bB\b|to do|V-ing/.test(cleaned) && cleaned.length < 90) return { term: cleaned, meaning: "" };
  return null;
}

function extractEntries(section, articleId) {
  const lines = section.content.split("\n");
  const entries = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    const context = current.context.join(" ").trim();
    if (!current.meaning) {
      const meaningLine = current.context.map(cleanLine).find((line) => /[\u4e00-\u9fff]/.test(line) && !/^(?:例|例如)[:：]/.test(line));
      current.meaning = meaningLine || "待人工确认释义";
    }
    const examples = current.context
      .filter((line) => /^\s*>/.test(line) && /[A-Za-z]{3}/.test(line))
      .map((line) => cleanLine(line));
    const explicitError = current.context.map(cleanLine).find((line) => ERROR_PATTERN.test(line));
    const errors = explicitError ? [{
      id: `${formatId(articleId)}-${slugify(current.term)}-${crypto.createHash("sha1").update(explicitError).digest("hex").slice(0, 8)}`,
      note: explicitError,
    }] : [];
    entries.push({ term: current.term, meaning: current.meaning, forms: [current.term], examples, errors });
    current = null;
  };
  for (const line of lines) {
    const start = parseEntryStart(line, section.kind);
    if (start) {
      flush();
      current = { ...start, context: [] };
    } else if (current && line.trim()) {
      current.context.push(line);
    }
  }
  flush();
  const deduped = new Map();
  for (const entry of entries) {
    const key = entry.term.toLowerCase();
    if (!deduped.has(key)) deduped.set(key, entry);
    else {
      const saved = deduped.get(key);
      saved.examples = [...new Set([...saved.examples, ...entry.examples])];
      const errorMap = new Map([...saved.errors, ...entry.errors].map((error) => [error.id, error]));
      saved.errors = [...errorMap.values()];
    }
  }
  return [...deduped.values()];
}

function attachErrorsFromAllSections(sections, record, articleId) {
  const collections = [record.vocabulary, record.phrases, record.sentences];
  const byTerm = new Map();
  for (const collection of collections) {
    for (const entry of collection) byTerm.set(entry.term.toLowerCase(), entry);
  }
  const terms = [...byTerm.keys()].sort((a, b) => b.length - a.length);
  for (const section of sections) {
    for (const rawLine of section.content.split("\n")) {
      const note = cleanLine(rawLine);
      if (!ERROR_PATTERN.test(note)) continue;
      const lower = note.toLowerCase();
      const term = terms.find((candidate) => lower === candidate || lower.startsWith(`${candidate}：`) || lower.startsWith(`${candidate}:`) || lower.startsWith(`${candidate} `));
      if (!term) continue;
      const entry = byTerm.get(term);
      const id = `${formatId(articleId)}-${slugify(entry.term)}-${crypto.createHash("sha1").update(note).digest("hex").slice(0, 8)}`;
      if (!entry.errors.some((error) => error.id === id)) entry.errors.push({ id, note });
    }
  }
}

const existing = await loadArticles(ROOT);
const title = findTitle(RAW);
if (!title) throw new Error("无法识别文章标题。请保留《英语一精读 02｜Title》或一级标题。 ");
let id = extractId(RAW);
const desiredSlug = slugify(title);
const draftMatch = existing.find((article) => article.draft && (Number(article.id) === id || article.slug === desiredSlug));
if (!id) id = draftMatch ? Number(draftMatch.id) : Math.max(0, ...existing.map((article) => Number(article.id))) + 1;

const front = parseFrontMatter(RAW).data;
const explicitTopic = argValue("topic") || front.topic || RAW.match(/^主题\s*[:：]\s*(.+)$/m)?.[1]?.trim();
const topic = explicitTopic || draftMatch?.topic;
if (!TOPICS.includes(topic)) throw new Error(`请用 --topic 指定七大主题之一：${TOPICS.join("、")}`);

const slug = draftMatch?.slug || desiredSlug;
const collision = existing.find((article) => !article.draft && (Number(article.id) === id || article.slug === slug));
if (collision) throw new Error(`文章 ${collision.file} 已存在；为避免覆盖，请修改编号或标题。`);

const sections = sectionize(RAW);
const articleBody = [
  `# ${title}`,
  ...sections.map((section) => `## ${DISPLAY_TITLES[section.kind] || section.title}\n\n${section.content.trim()}`),
].join("\n\n");
const date = front.date || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
const metadata = { id, title, slug, topic, date, score: front.score ?? null, draft: false };

const record = { articleId: id, vocabulary: [], phrases: [], sentences: [] };
for (const section of sections) {
  if (section.kind === "vocabulary") record.vocabulary.push(...extractEntries(section, id));
  if (section.kind === "phrases") record.phrases.push(...extractEntries(section, id));
  if (section.kind === "sentences") record.sentences.push(...extractEntries(section, id));
}
attachErrorsFromAllSections(sections, record, id);

const base = `${formatId(id)}-${slug}`;
await fs.writeFile(path.join(ROOT, "content", "articles", `${base}.md`), serializeFrontMatter(metadata, articleBody), "utf8");
await fs.writeFile(path.join(ROOT, "content", "records", `${base}.json`), `${JSON.stringify(record, null, 2)}\n`, "utf8");

const archiveDir = path.join(ROOT, "inbox", "archive");
await fs.mkdir(archiveDir, { recursive: true });
let archive = path.join(archiveDir, `${date}-${base}.md`);
if (await fs.stat(archive).then(() => true, () => false)) archive = path.join(archiveDir, `${date}-${base}-${Date.now()}.md`);
await fs.writeFile(archive, RAW, "utf8");
await fs.writeFile(INBOX, "# 新精读收件箱\n\n<!-- paste-reading-here -->\n\n把下一篇 ChatGPT 精读总结完整粘贴到这里。\n", "utf8");

const build = spawnSync(process.execPath, [path.join(ROOT, "scripts", "build.mjs")], { cwd: ROOT, encoding: "utf8" });
if (build.status !== 0) throw new Error(`文章已保存，但构建失败：\n${build.stderr || build.stdout}`);
console.log(JSON.stringify({ article: `${base}.md`, record: `${base}.json`, archive: path.relative(ROOT, archive), extracted: { vocabulary: record.vocabulary.length, phrases: record.phrases.length, sentences: record.sentences.length }, build: JSON.parse(build.stdout) }, null, 2));
