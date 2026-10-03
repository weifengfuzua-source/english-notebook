import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadArticles } from "../scripts/lib/notebook.mjs";
import { validateReading, loadReading, createReadingDraft } from "../scripts/lib/reading.mjs";
import { annotationStart } from "../public/reading-text.js";
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
  assert.equal((await loadReading(root, articles.find((item) => Number(item.id) === 2))).articleId, 2);
});

test("Text 2 has complete contextual reading without fabricated sample sentences", async () => {
  const article = (await loadArticles(root)).find((item) => Number(item.id) === 2);
  const reading = await loadReading(root, article);
  assert.equal(reading.units.length, 27);
  assert.equal((renderReading(reading).match(/class="unit-translation"/g) || []).length, 27);
  const annotations = reading.units.flatMap((unit) => unit.annotations);
  for (const term of ["validate managers", "labor force", "hours worked", "stand in for", "chronic"]) {
    assert.ok(annotations.some((annotation) => annotation.text.toLowerCase() === term));
  }
  assert.ok(!reading.units.some((unit) => unit.english.includes("no less willing")));
  assert.match(reading.units.find((unit) => unit.id === "10").translation, /部分原因/);
  assert.match(reading.units.find((unit) => unit.id === "25").translation, /可能/);
  assert.match(reading.units.find((unit) => unit.id === "26").translation, /往往/);
  const unit = reading.units.find((item) => item.id === "17");
  const annotation = unit.annotations.find((item) => item.text === "evidence");
  assert.equal(annotation.occurrence, 1);
  assert.equal(annotationStart(unit.english, annotation), unit.english.indexOf("evidence"));
  const ambiguous = structuredClone(reading);
  delete ambiguous.units.find((item) => item.id === "17").annotations.find((item) => item.text === "evidence").occurrence;
  assert.throws(() => validateReading(ambiguous, article), /位置不唯一/);
});

test("Scaffolds preserve originals and cannot pass as completed readings", () => {
  const article = { id: 3, sections: [{ kind: "original", body: "Chronic stress matters. It can change sleep.\n\nTake off slowly." }] };
  const draft = createReadingDraft(article);
  assert.equal(draft.units.length, 3);
  assert.equal(draft.groups.length, 2);
  assert.equal(draft.units.map((unit) => unit.english).join(" "), "Chronic stress matters. It can change sleep. Take off slowly.");
  assert.throws(() => validateReading(draft, article), /缺少可点击批注/);
  assert.throws(() => createReadingDraft({ id: 3, sections: [] }), /缺少完整原文/);
  assert.equal(annotationStart("evidence and evidence", { text: "evidence", occurrence: 2 }), 13);
  assert.equal(annotationStart("evidence", { text: "evidence", occurrence: 2 }), -1);
  assert.equal(annotationStart("evidence", { text: "evidence", occurrence: 0 }), -1);
});

test("Sentence translations retain explicit modality and frequency", async () => {
  const reading = JSON.parse(await fs.readFile(new URL("../content/readings/001-comfort-and-discomfort.json", import.meta.url), "utf8"));
  assert.match(reading.units.find((unit) => unit.id === "03").translation, /可以.*往往/);
  assert.match(reading.units.find((unit) => unit.id === "13").translation, /往往/);
  assert.match(reading.units.find((unit) => unit.id === "20").translation, /常/);
  assert.match(reading.units.find((unit) => unit.id === "22").translation, /可以/);
  assert.match(reading.units.find((unit) => unit.id === "30").translation, /可以/);
});
