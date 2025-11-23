# Implementation Plan: Douban/Goodreads → Notion Sync

**Branch**: `[001-notion-sync-stabilize]` | **Date**: 2025-11-23 | **Spec**: `Spec.md`  
**Input**: Feature specification from `Spec.md`

## Summary
- 需求：将豆瓣与 Goodreads 的读书数据（全量与增量）同步到指定 Notion 数据库，字段完整、去重且可重复运行。
- 技术路径：Deno 脚本抓取/解析源站 HTML 或 RSS，使用官方 `@notionhq/client` 写入数据库；全链路 await、环境变量必填校验、详情抓取重试与失败日志化。

## Technical Context

**Language/Version**: Deno (TypeScript)  
**Primary Dependencies**: `deno_dom`(HTML 解析), `rss`(RSS 解析), `dayjs`(日期), `@notionhq/client`(官方 Notion SDK)  
**Storage**: Notion 数据库（通过 `NOTION_BOOK_DATABASE_ID` 指定）  
**Testing**: 手动/脚本运行验证（缺少自动化测试，NEEDS CLARIFICATION）  
**Target Platform**: CLI（Deno），可由 GitHub Actions 调度  
**Project Type**: 单体脚本项目  
**Performance Goals**: 幂等去重，无重复写入；增量任务 < 1 分钟完成为佳  
**Constraints**: 依赖豆瓣/Goodreads DOM 结构和网络稳定性；需等待所有异步写入完成  
**Scale/Scope**: 个人/小规模书目（几十到几千条）

## Constitution Check
- 无项目宪章文件，默认不适用强制 Gate。

## Project Structure

### Documentation (this feature)
```text
Spec.md               # 功能描述（现有）
Plan.md               # 实施计划（本文件）
feature_spec.md       # 按模板生成的 Feature Spec
```

### Source Code (repository root)
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
deno.json            # 任务与依赖映射
```

**Structure Decision**: 单体脚本项目，所有同步逻辑集中在 `src/`，以 Deno task 方式运行。

## Complexity Tracking
| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| None | N/A | N/A |
