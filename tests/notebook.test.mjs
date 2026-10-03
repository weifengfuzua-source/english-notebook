import test from "node:test";
import assert from "node:assert/strict";
import { countForms, mergeTrackedEntries, parseFrontMatter, canonicalSection } from "../scripts/lib/notebook.mjs";

test("word and tracked phrase counts are separate and case-insensitive", () => {
  const text = "Chronic comfort comes at the expense of growth. chronic stress may also come at the expense of sleep.";
  assert.equal(countForms(text, ["chronic"]), 2);
  assert.equal(countForms(text, ["at the expense of"]), 2);
  assert.equal(countForms(text, ["expense"]), 2);
});

test("canonical entry merges across articles and deduplicates one repeated error id", () => {
  const articles = [
    { id: 1, title: "One", slug: "one", topic: "社会与民生", sections: [{ kind: "original", body: "Performance matters." }] },
    { id: 2, title: "Two", slug: "two", topic: "教育与科研", sections: [{ kind: "original", body: "Academic performance improves." }] },
  ];
  const records = [
    { articleId: 1, vocabulary: [{ term: "performance", meaning: "表现；成绩；绩效", forms: ["performance"], examples: ["Performance matters."], errors: [{ id: "e1", note: "曾误认：表达能力" }, { id: "e1", note: "曾误认：表达能力" }] }] },
    { articleId: 2, vocabulary: [{ term: "performance", meaning: "表现；成绩；绩效", forms: ["performance"], examples: ["Academic performance improves."], errors: [] }] },
  ];
  const [entry] = mergeTrackedEntries({ articles, records, field: "vocabulary" });
  assert.equal(entry.appearances, 2);
  assert.equal(entry.errorCount, 1);
  assert.deepEqual(entry.topics, ["社会与民生", "教育与科研"]);
  assert.equal(entry.sources.length, 2);
});

test("front matter and flexible section aliases remain lightweight", () => {
  const parsed = parseFrontMatter("---\nid: 2\ntitle: Quiet Quitting\ndraft: true\n---\n\n## 错题复盘\n内容");
  assert.equal(parsed.data.id, 2);
  assert.equal(parsed.data.draft, true);
  assert.equal(canonicalSection("本篇暴露的新薄弱点"), "weaknesses");
  assert.equal(canonicalSection("必须整块认识的词组"), "phrases");
  assert.equal(canonicalSection("全文最重要的逻辑关系"), "logic");
});
