# English Notebook

一个内容驱动、可长期追加并可部署到 GitHub Pages 的考研英语精读笔记本。

它只做三件事：保存文章语境、合并词汇与词块、沉淀可迁移句式。没有账号、数据库、背词打卡或学习管理功能。

## 目录结构

```text
english-notebook/
├─ content/
│  ├─ articles/          # 文章 Markdown，人可以直接阅读和修改
│  └─ records/           # 每篇文章的结构化学习记录与真实错误
├─ data/                 # 自动汇总的词汇、词块、句式数据
├─ inbox/
│  ├─ new-reading.md     # 每天把新的 GPT 精读总结粘贴到这里
│  └─ archive/           # ingest 后保留的原始输入
├─ public/               # 网站模板、样式和交互逻辑
├─ scripts/              # ingest、build、local server
├─ tests/                # 统计和解析规则测试
├─ dist/                 # build 生成的 GitHub Pages 成品
└─ .github/workflows/    # push 到 main 后自动部署 Pages
```

## 本地运行

本项目没有第三方运行依赖，只需要 Node.js 22 或更新版本。

```powershell
node scripts/build.mjs
node scripts/serve.mjs
```

然后访问 `http://127.0.0.1:4173/`。

如果本机 npm 可用，也可以运行：

```powershell
npm run build
npm run serve
```

完整检查：

```powershell
node --test tests/*.test.mjs
node scripts/build.mjs
```

## 每天添加一篇精读

1. 把 ChatGPT 输出的完整 Markdown 总结粘贴到 `inbox/new-reading.md`，替换占位文字。
2. 执行：

```powershell
node scripts/ingest.mjs --topic 社会与民生
```

3. 脚本会生成规范文章和学习记录，重新统计全部内容，运行检查并构建网站。
4. 原始输入会移动到 `inbox/archive/`，不会删除。
5. 查看生成内容和 Git diff，确认后提交并推送。

主题必须是以下七类之一：

- 社会与民生
- 教育与科研
- 科技与互联网
- 环境与可持续发展
- 经济与商业
- 文化与艺术
- 医疗与健康

解析器允许标题和小节名称有轻微变化，也允许部分小节缺失。它只提取材料中明确列出的词汇、词块、句式和真实误认；不会猜测新的错误。自动结果仍应在提交前人工看一眼，尤其是格式特别自由的新材料。

## 数据规则

- `出现次数`：只扫描文章 front matter 之后的 `## 原文` 内容，大小写不敏感。
- `词块`：按完整短语扫描，不会拆成若干单词计为词块。
- `错误次数`：只来自 `content/records/*.json` 中具有唯一 `id` 的明确错误记录。
- 同一错误即使在总结的多个小节重复出现，只要 `id` 相同，就只计算一次。
- 同一词跨文章、跨主题合并为一个 canonical 条目；主题从来源文章继承。
- `draft: true` 的文章不展示，也不参与统计。

## GitHub Pages 部署

首次发布时，在 GitHub 新建一个空仓库，然后在本目录执行：

```powershell
git init
git branch -M main
git add .
git commit -m "Build English close-reading notebook"
git remote add origin <你的仓库地址>
git push -u origin main
```

在 GitHub 仓库的 **Settings → Pages → Build and deployment** 中，将 Source 设为 **GitHub Actions**。以后每次 push 到 `main`，`.github/workflows/pages.yml` 会自动测试、构建并部署 `dist/`。

网站全部使用相对路径，因此兼容 `https://用户名.github.io/仓库名/` 这种 project site。构建会给数据请求加入内容哈希，并要求浏览器跳过旧缓存，降低更新后继续读到旧数据的概率。

## 内容源与生成物

可以编辑：

- `content/articles/*.md`
- `content/records/*.json`
- `inbox/new-reading.md`
- `public/index.html`
- `public/styles.css`
- `public/app.js`

不要手工编辑：

- `data/vocabulary.json`
- `data/phrases.json`
- `data/sentences.json`
- `dist/**`

这些文件都由 `node scripts/build.mjs` 重建。也不要删除 `content/records` 里的错误 `id`；它是错误去重的依据。

## 当前内容状态

- `001 Comfort & Discomfort`：完整内容，参与展示和统计。
- `002 Quiet Quitting`：仅有等待原始精读总结的草稿壳，`draft: true`，不参与展示或统计。

