# notion_bookcase Development Guidelines

Auto-generated from feature plans. Last updated: 2025-11-26

## Active Technologies
- Deno (TypeScript)
- @notionhq/client（官方 Notion SDK）
- deno_dom（HTML 解析）
- rss（RSS 解析）
- dayjs（日期处理）
- jimp（图片拼接）

## Project Structure

```text
src/
├── apis/
│   ├── douban_api.ts
│   ├── goodreads_api.ts
│   └── notion_api.ts
├── generate_cover_wall.ts
├── sync_douban_full.ts
├── sync_douban_rss.ts
├── sync_goodreads_full.ts
├── sync_goodreads_part.ts
├── constants.ts
├── types.ts
└── utils.ts

assets/
deno.json
SPEC.md
PLAN.md
TASKS.md
CHECKLIST.md
CHANGELOGS.md
```

## Commands
- `deno task start:douban:rss` — 豆瓣 RSS 增量同步
- `deno task start:douban:full` — 豆瓣全量同步
- `deno task start:goodreads:full` — Goodreads 全量同步
- `deno task start:goodreads:part` — Goodreads 首页增量同步
- `deno task generate:cover-wall [--width 2400 --targetRowHeight 300 --maxBooks 50 --force]` — 生成已读封面墙（行式紧密布局），签名未变则跳过；本地保存 `assets/cover-wall-<timestamp>.png`
- `deno run -A <script>` — 直接运行任意同步脚本

## Code Style
- 语言：TypeScript（Deno）。使用 ES 模块导入。
- 环境：通过环境变量提供 `NOTION_TOKEN`、`NOTION_BOOK_DATABASE_ID`、`DOUBAN_USER_ID`、`GOODREADS_USER_ID`；数据库存在多个数据源时需提供 `NOTION_BOOK_DATA_SOURCE_ID`；Notion API 版本固定为 `2025-09-03`。
- Notion：客户端初始化时设置 `notionVersion: "2025-09-03"`，页面父级/查询使用 `data_source_id`（非 database_id），多数据源需显式指定。
- 异步：抓取与 Notion 写入需 `await`，避免 fire-and-forget；日期写入前需 `dayjs(...).isValid()`。
- 可靠性：缺失必需环境变量时直接报错退出；豆瓣详情抓取带轻量重试，失败记录后跳过。
- 封面墙：仅使用 Notion 已读条目封面，签名缓存写入 `assets/cover_wall_cache.json`，未变则跳过生成与上传。


## Documents
每次结束，都请更新如下文档内容。
- `AGENTS.md`：开发指南，包含技术栈、项目结构、命令、代码风格、文档更新策略等。
- `SPEC.md`：功能规格，涵盖用户故事、边界条件、成功标准。
- `PLAN.md`：开发计划，涵盖功能优先级、时间表、风险评估。
- `TASKS.md`：任务清单，涵盖任务名称、负责人、优先级、状态。
- `CHECKLIST.md`：检查清单，涵盖检查项、负责人、状态。
- `CHANGELOGS.md`: 更新记录。
