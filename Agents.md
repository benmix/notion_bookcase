# notion_bookcase Development Guidelines

Auto-generated from feature plans. Last updated: 2025-11-23

## Active Technologies
- Deno (TypeScript)
- @notionhq/client（官方 Notion SDK）
- deno_dom（HTML 解析）
- rss（RSS 解析）
- dayjs（日期处理）

## Project Structure

```text
src/
├── apis/
│   ├── douban_api.ts
│   ├── goodreads_api.ts
│   └── notion_api.ts
├── sync_douban_full.ts
├── sync_douban_rss.ts
├── sync_goodreads_full.ts
├── sync_goodreads_part.ts
├── constants.ts
├── types.ts
└── utils.ts

assets/
deno.json
Spec.md
Plan.md
Task.md
Checklist.md
```

## Commands
- `deno task start:douban:rss` — 豆瓣 RSS 增量同步
- `deno task start:douban:full` — 豆瓣全量同步
- `deno task start:goodreads:full` — Goodreads 全量同步
- `deno task start:goodreads:part` — Goodreads 首页增量同步
- `deno run -A <script>` — 直接运行任意同步脚本

## Code Style
- 语言：TypeScript（Deno）。使用 ES 模块导入。
- 环境：通过环境变量提供 `NOTION_TOKEN`、`NOTION_BOOK_DATABASE_ID`、`DOUBAN_USER_ID`、`GOODREADS_USER_ID`。
- 异步：抓取与 Notion 写入需 `await`，避免 fire-and-forget；日期写入前需 `dayjs(...).isValid()`。
- 可靠性：缺失必需环境变量时直接报错退出；豆瓣详情抓取带轻量重试，失败记录后跳过。


## Documents
每次结束，都请更新如下文档内容。
- `Agents.md`：开发指南，包含技术栈、项目结构、命令、代码风格、文档更新策略等。
- `Spec.md`：功能规格，涵盖用户故事、边界条件、成功标准。
- `Plan.md`：开发计划，涵盖功能优先级、时间表、风险评估。
- `Task.md`：任务清单，涵盖任务名称、负责人、优先级、状态。
- `Checklist.md`：检查清单，涵盖检查项、负责人、状态。
- `Changelog.md`: 更新记录。
