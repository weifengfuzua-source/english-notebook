import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadReading } from "./lib/reading.mjs";
import {
  loadArticles,
  loadRecords,
  mergeTrackedEntries,
  renderMarkdown,
  validateNotebook,
} from "./lib/notebook.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const DATA = path.join(ROOT, "data");

const articles = await loadArticles(ROOT);
const records = await loadRecords(ROOT);
validateNotebook(articles, records);
const readings = new Map(await Promise.all(articles.filter((article) => !article.draft).map(async (article) => {
  const reading = await loadReading(ROOT, article);
  if (!reading) throw new Error(`${article.file} 缺少逐句翻译和正文批注；请完成精读数据后再发布`);
  return [article.id, reading];
})));

const vocabulary = mergeTrackedEntries({ articles, records, field: "vocabulary" });
const phrases = mergeTrackedEntries({ articles, records, field: "phrases" });
const sentences = mergeTrackedEntries({ articles, records, field: "sentences" });

const publishedArticles = articles
  .filter((article) => !article.draft)
  .sort((a, b) => Number(a.id) - Number(b.id))
  .map((article) => ({
    id: Number(article.id),
    title: article.title,
    slug: article.slug,
    topic: article.topic,
    date: article.date ?? null,
    score: article.score ?? null,
    ...(readings.get(article.id) ? { reading: readings.get(article.id) } : {}),
    sections: article.sections.map((section) => ({
      title: section.title,
      kind: section.kind,
      html: renderMarkdown(section.body),
    })),
  }));

const generated = { vocabulary, phrases, sentences };
await fs.mkdir(DATA, { recursive: true });
for (const [name, value] of Object.entries(generated)) {
  await fs.writeFile(path.join(DATA, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const payload = {
  articles: publishedArticles,
  vocabulary,
  phrases,
  sentences,
};
const assets = ["index.html", "app.js", "styles.css", "reading.js", "reading-text.js"];
const templateSources = await Promise.all(assets.map((name) => fs.readFile(path.join(ROOT, "public", name), "utf8")));
const buildId = crypto.createHash("sha256").update(JSON.stringify(payload)).update(templateSources.join("\n")).digest("hex").slice(0, 12);
payload.buildId = buildId;

await fs.rm(DIST, { recursive: true, force: true });
await fs.cp(path.join(ROOT, "public"), DIST, { recursive: true });
for (const name of assets) {
  const file = path.join(DIST, name);
  const source = await fs.readFile(file, "utf8");
  await fs.writeFile(file, source.replaceAll("__BUILD_ID__", buildId), "utf8");
}
await fs.mkdir(path.join(DIST, "data"), { recursive: true });
await fs.writeFile(path.join(DIST, "data", "site.json"), `${JSON.stringify(payload)}\n`, "utf8");
await fs.writeFile(path.join(DIST, ".nojekyll"), "", "utf8");

const summary = {
  buildId,
  articles: publishedArticles.length,
  drafts: articles.filter((article) => article.draft).length,
  vocabulary: vocabulary.length,
  phrases: phrases.length,
  sentences: sentences.length,
  output: DIST,
};
console.log(JSON.stringify(summary, null, 2));
