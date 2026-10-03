import fs from "node:fs/promises";
import path from "node:path";
import { stripMarkdown } from "./notebook.mjs";
import { annotationStart } from "../../public/reading-text.js";

export function validateReading(reading, article) {
  if (reading.articleId !== Number(article.id)) throw new Error("逐句数据的 articleId 不匹配");
  if (!reading.units?.length) throw new Error("逐句数据不能为空");
  if (!reading.units.some((unit) => unit.annotations?.length)) throw new Error("正文缺少可点击批注");
  const ids = new Set();
  const groups = new Set(reading.groups.map((group) => group.id));
  for (const unit of reading.units) {
    if (!unit.id || ids.has(unit.id)) throw new Error(`阅读单元 ID 重复：${unit.id}`);
    ids.add(unit.id);
    if (!unit.english?.trim() || !unit.translation?.trim()) throw new Error(`${unit.id} 缺少英文或翻译`);
    if (!Array.isArray(unit.annotations)) throw new Error(`${unit.id} 缺少 annotations 数组`);
    if (!groups.has(unit.group)) throw new Error(`${unit.id} 段落编号不存在`);
    const occupied = [];
    for (const annotation of unit.annotations) {
      const start = annotationStart(unit.english, annotation);
      const end = start + annotation.text.length;
      if (!annotation.text || start < 0) throw new Error(`${unit.id} 批注未出现在原句中：${annotation.text}`);
      if (annotation.occurrence === undefined && unit.english.indexOf(annotation.text, end) >= 0) throw new Error(`${unit.id} 批注位置不唯一：${annotation.text}，请指定 occurrence`);
      if (!annotation.meaning || !annotation.context || !annotation.note) throw new Error(`${unit.id} 批注释义不完整`);
      if (!["vocabulary", "phrase", "structure", "error"].includes(annotation.type)) throw new Error(`${unit.id} 批注类型无效`);
      if (occupied.some(([a, b]) => start < b && end > a)) throw new Error(`${unit.id} 批注重叠`);
      occupied.push([start, end]);
    }
  }
  const source = article.sections.filter((section) => section.kind === "original").map((section) => section.body).join(" ");
  const readingText = reading.units.map((unit) => unit.english).join(" ");
  if (stripMarkdown(source) !== stripMarkdown(readingText)) throw new Error("逐句英文与 Markdown 原文不一致，可能有遗漏或改写");
  return reading;
}

export async function loadReading(root, article) {
  const filename = article.file.replace(/\.md$/, ".json");
  let source;
  try { source = await fs.readFile(path.join(root, "content", "readings", filename), "utf8"); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  return validateReading(JSON.parse(source), article);
}

export function createReadingDraft(article) {
  const originals = article.sections.filter((section) => section.kind === "original");
  if (!originals.length) throw new Error("缺少完整原文；请先提供原文，不能用总结例句重建全文");
  const paragraphs = originals.flatMap((section) => section.body.split(/\n\s*\n/).map(stripMarkdown).filter(Boolean));
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  let id = 0;
  return {
    articleId: Number(article.id),
    groups: paragraphs.map((_, index) => ({ id: index + 1, title: `第 ${index + 1} 段` })),
    units: paragraphs.flatMap((paragraph, index) => [...segmenter.segment(paragraph)].map(({ segment }) => ({
      id: String(++id).padStart(2, "0"), group: index + 1, english: segment.trim(), translation: "", annotations: [],
    }))),
  };
}
