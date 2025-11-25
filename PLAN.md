# Implementation Plan: Notion Bookcase

**Branch**: `[001-notion-sync-stabilize]`  
**Last Updated**: 2025-11-26  
**Related**: `SPEC.md`, `TASKS.md`, `CHECKLIST.md`

## Goals
- 完整同步豆瓣/Goodreads 书架（全量 + 增量）到 Notion，字段齐全、去重、可重复运行。
- 生成“已读封面墙”，拼接 Notion 中已读条目的封面并更新数据库封面，避免无效重跑。
- 兼容 Notion API `2025-09-03` 版本与多数据源数据库，使用 data_source_id 读写。

## Scope
- Sources: 豆瓣（wish/do/collect）、Goodreads（read/currently-reading/to-read）。
- Target: 单一 Notion 数据库（`NOTION_BOOK_DATABASE_ID`），字段映射见 `SPEC.md`；多数据源时需指定 `NOTION_BOOK_DATA_SOURCE_ID`，默认自动发现唯一数据源。
- CLI 入口：Deno 脚本与 `deno task` 任务。

## Technical Stack
- Runtime: Deno (TypeScript, ES modules)
- Core libs: `@notionhq/client`（Notion-Version=2025-09-03，data_source API）、`deno_dom`, `rss`, `dayjs`, `jimp`
- Infra: 环境变量必填校验，轻量重试，幂等去重

## Current Architecture
- `src/apis/*`: 数据抓取与 Notion 封装（查询/创建/更新、文件上传）
- `src/sync_*`: 同步入口（豆瓣全量/RSS，Goodreads 全量/首页增量）
- `src/generate_cover_wall.ts`: 已读封面墙生成（行式紧密布局，签名缓存写入 `assets/cover_wall_cache.json`）与 Notion 数据库封面更新
- `deno.json`: 任务与依赖声明

## Milestones
1) **同步稳定性（done）**  
   - 官方 Notion SDK、全链路 await、环境变量校验、详情抓取重试、去重逻辑落地。
2) **封面墙生成（done）**  
   - 查询 Notion 中“读过”条目 → 取封面 → Jimp 拼接 → Notion 文件上传 → 更新数据库封面。  
   - 缓存签名（参数+page id+cover url），无变更跳过；`--force` 可重建。
   - 生成后的封面墙图片以 `cover-wall-<timestamp>.png` 保存到 `assets/`，便于本地查看或上传失败时留存。
3) **文档与入口（done，持续维护）**  
   - 任务命令：`deno task start:*` 同步；`deno task generate:cover-wall` 生成封面墙。  
   - 持续更新 `SPEC.md`/`TASKS.md`/`CHECKLIST.md`/`AGENTS.md`/`CHANGELOGS.md`。
4) **Notion API 2025-09-03 升级（done）**  
   - 客户端 `notionVersion` 提升为 `2025-09-03`；父级/查询改用 `data_source_id`。  
   - 发现 data source ID：优先读取 `NOTION_BOOK_DATA_SOURCE_ID`，否则从数据库检索；多数据源未指定时拒绝运行。

## Risks & Mitigations
- 源站 DOM 变更/封面缺失 → 宽松解析、缺失字段跳过、日志告警。
- Notion API 失败/限流 → 显式错误+非 0 退出；必要时重试/降低并发。
- 网络抖动 → 轻量重试；无可用封面时任务失败并提示。

## How to Run
- 豆瓣全量：`deno task start:douban:full`
- 豆瓣 RSS 增量：`deno task start:douban:rss`
- Goodreads 全量：`deno task start:goodreads:full`
- Goodreads 首页增量：`deno task start:goodreads:part`
- 封面墙生成：`deno task generate:cover-wall [--width 2400 --targetRowHeight 300 --maxBooks 50 --force]`

## Next Updates
- 如需新增数据源或自动化测试，请在 `TASKS.md` 补充任务并在 `CHECKLIST.md` 追加验收项。
