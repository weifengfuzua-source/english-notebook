import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadArticles, parseFrontMatter, serializeFrontMatter } from "./lib/notebook.mjs";
import { createReadingDraft, loadReading } from "./lib/reading.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [action] = process.argv.slice(2);
const idPosition = process.argv.indexOf("--id");
const id = Number(idPosition >= 0 ? process.argv[idPosition + 1] : NaN);
if (!["prepare", "check", "publish"].includes(action) || !Number.isInteger(id)) throw new Error("用法：node scripts/reading.mjs prepare|check|publish --id 3");
const article = (await loadArticles(root)).find((item) => Number(item.id) === id);
if (!article) throw new Error(`找不到文章 ${id}`);
const output = path.join(root, "content", "readings", article.file.replace(/\.md$/, ".json"));

if (action === "prepare") {
  await fs.mkdir(path.dirname(output), { recursive: true });
  const draft = createReadingDraft(article);
  await fs.writeFile(output, `${JSON.stringify(draft, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(JSON.stringify({ file: output, units: draft.units.length, status: "待核对分句、补全翻译和批注" }, null, 2));
} else {
  const reading = await loadReading(root, article);
  if (!reading) throw new Error("缺少逐句数据，请先 prepare 并补全翻译与批注");
  if (action === "publish") {
    const articlePath = path.join(root, "content", "articles", article.file);
    const originalSource = await fs.readFile(articlePath, "utf8");
    const { data, body } = parseFrontMatter(originalSource);
    if (data.draft) await fs.writeFile(articlePath, serializeFrontMatter({ ...data, draft: false }, body), "utf8");
    const build = spawnSync(process.execPath, [path.join(root, "scripts", "build.mjs")], { cwd: root, encoding: "utf8" });
    if (build.status !== 0) {
      if (data.draft) await fs.writeFile(articlePath, originalSource, "utf8");
      throw new Error(`构建失败，保留原发布状态：\n${build.stderr || build.stdout}`);
    }
    console.log(build.stdout.trim());
  }
  console.log(JSON.stringify({ articleId: id, units: reading.units.length, annotations: reading.units.reduce((sum, unit) => sum + unit.annotations.length, 0), status: action === "publish" ? "已完成本地发布，可验收后提交推送" : "原文、翻译和批注检查通过" }, null, 2));
}
