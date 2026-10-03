import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadArticles } from "../scripts/lib/notebook.mjs";
import { validateReading, loadReading } from "../scripts/lib/reading.mjs";
import { renderReading } from "../public/reading.js";

const root = fileURLToPath(new URL("../", import.meta.url));

test("Article 01 preserves every original sentence, translates every unit, and covers all required inline annotations", async () => {
  const articles = await loadArticles(root);
  const article = articles.find((item) => Number(item.id) === 1);
  const reading = await loadReading(root, article);
  assert.equal(reading.units.length, 32);
  const names = new Set(reading.units.flatMap((unit) => unit.annotations.map((annotation) => annotation.label || annotation.text)));
  for (const required of ["reliance on", "fragile", "ill-equipped", "navigate life", "can be traced to", "digital crutches", "at the expense of", "engagement", "chronic", "seamless navigation", "suppression", "be prone to", "impair", "cognitive", "contribute to", "resilience", "view A as B", "rather than", "neuroplasticity", "adaptability", "stifle", "dismiss A as B", "resist the urge to", "align with", "intentional", "manageable", "tackle", "only to do", "sluggish", "in the long run", "by contrast", "crucible", "confront", "keep sb stuck"]) {
    assert.ok(names.has(required), `Missing annotation: ${required}`);
  }
  const rendered = renderReading(reading);
  assert.equal((rendered.match(/class="unit-translation"/g) || []).length, 32);
  assert.ok(!rendered.includes("<button"), "Marks must look like inline text, not buttons");
  const noTranslation = structuredClone(reading);
  noTranslation.units[0].translation = "";
  assert.throws(() => validateReading(noTranslation, article), /缺少英文或翻译/);
  const missingSentence = structuredClone(reading);
  missingSentence.units.pop();
  assert.throws(() => validateReading(missingSentence, article), /原文不一致/);
  const overlap = structuredClone(reading);
  overlap.units[0].annotations.push({ ...overlap.units[0].annotations[0], text: "reliance" });
  assert.throws(() => validateReading(overlap, article), /重叠/);
  assert.equal(await loadReading(root, articles.find((item) => Number(item.id) === 2)), null);
});

test("Sentence translations retain explicit modality and frequency", async () => {
  const reading = JSON.parse(await fs.readFile(new URL("../content/readings/001-comfort-and-discomfort.json", import.meta.url), "utf8"));
  assert.match(reading.units.find((unit) => unit.id === "03").translation, /可以.*往往/);
  assert.match(reading.units.find((unit) => unit.id === "13").translation, /往往/);
  assert.match(reading.units.find((unit) => unit.id === "20").translation, /常/);
  assert.match(reading.units.find((unit) => unit.id === "22").translation, /可以/);
  assert.match(reading.units.find((unit) => unit.id === "30").translation, /可以/);
});
