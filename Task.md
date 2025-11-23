# Tasks: Douban/Goodreads → Notion Sync

**Input**: Design documents from root `Spec.md` / `Plan.md` / `feature_spec.md`  
**Prerequisites**: plan.md (required), spec.md (required for user stories)

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 豆瓣同步, US2 Goodreads 同步, US3 稳定性
- Paths assume单体项目 `src/`

---

## Phase 1: Setup (Shared Infrastructure)
**Purpose**: 确认依赖与运行环境
- [x] T101 [P] [GEN] 确认 Deno 版本与 `deno.json` imports 可用（deno_dom、rss、dayjs、Notion SDK）
- [x] T102 [P] [GEN] 校验环境变量读取路径（`NOTION_TOKEN`、`NOTION_BOOK_DATABASE_ID`、`DOUBAN_USER_ID`、`GOODREADS_USER_ID`）
- [x] T103 [P] [GEN] 记录运行命令与任务说明（README/Spec 链接）确保可执行

---

## Phase 2: Foundational (Blocking Prerequisites)
**Purpose**: 平台与接口基础，完成后才能进入各用户故事
- [x] T201 [GEN] 将 `notion_sdk` 替换为官方 `@notionhq/client`（调整 `deno.json` imports 与客户端初始化）在 `src/apis/notion_api.ts`
- [x] T202 [GEN] 更新 Notion 属性写入/读取类型以匹配官方 SDK（`createPage`/`updatePage`/`queryBooks` payload 与返回结构）
- [x] T203 [GEN] 统一 Notion 写入与查询的错误处理和日志输出（暴露失败而非静默）
- [x] T204 [GEN] 确保所有 Notion 写入调用返回 Promise 并可被上层等待（调整 `updateBookItemsInDatabase` 签名）

**Checkpoint**: Notion 客户端与类型兼容，写入/查询可等待且可见错误

---

## Phase 3: User Story 1 - 豆瓣同步到 Notion（P1） 🎯
**Goal**: 全量与 RSS 增量同步豆瓣书目，字段完整且去重
**Independent Test**: 运行 `deno task start:dounan:full` 与 `start:douban:rss`，校验记录数量与字段完整性并无重复

### Implementation for User Story 1
- [x] T301 [US1] 修正 `src/apis/douban_api.ts` 列表解析的异步控制（for...of/Promise.all），确保详情抓取完成后再返回
- [x] T302 [US1] 在 `src/apis/douban_api.ts` 校验出版日期解析合法性，无法解析时跳过字段
- [x] T303 [US1] 将 `updateBookItemsInDatabase` 设为 awaitable，并在 `src/sync_douban_full.ts`/`src/sync_douban_rss.ts` 中等待
- [x] T304 [US1] 确认豆瓣去重逻辑按 subject id 工作（`getIDFromURL`），必要时补充空 ID 过滤
- [x] T305 [US1] 输出同步结果/错误日志，包含成功/失败条目数量（便于增量验证）

**Checkpoint**: 豆瓣全量与增量可重复执行，无重复条目，字段有效

---

## Phase 4: User Story 2 - Goodreads 同步到 Notion（P2）
**Goal**: 全量与首页增量同步 Goodreads 书架，字段完整且去重
**Independent Test**: 运行 `deno task start:goodreads:full` 与 `start:goodreads:part`，校验记录数量与字段

### Implementation for User Story 2
- [x] T401 [US2] 确保 `src/apis/goodreads_api.ts` 列表解析与推入流程可等待（避免未完成数据返回）
- [x] T402 [US2] 将 `updateBookItemsInDatabase` 调用在 `src/sync_goodreads_full.ts`/`src/sync_goodreads_part.ts` 中 await
- [x] T403 [US2] 校验 Goodreads 去重逻辑（book id 解析）及空 ID 过滤
- [x] T404 [US2] 补充日志输出，记录同步成功/失败条目数

**Checkpoint**: Goodreads 全量与增量可重复执行，无重复条目，字段有效

---

## Phase 5: User Story 3 - 稳定可重复执行（P3）
**Goal**: 异常可见、无静默失败，任务可安全重跑
**Independent Test**: 模拟网络/解析/Notion 错误时任务以非 0 退出并输出原因；无重复或非法字段写入

### Implementation for User Story 3
- [x] T501 [US3] 为抓取和 Notion 写入增加集中错误捕获与非 0 退出码（入口脚本）
- [x] T502 [US3] 在详情抓取失败时跳过写入或回退到上次成功数据，并记录原因
- [x] T503 [US3] 可选：添加简单的重试/并发限制或延时，缓解被封或网络抖动
- [x] T504 [US3] 验证环境变量缺失/错误时的提前失败提示

**Checkpoint**: 任务对失败可见，重跑幂等，避免非法数据污染

---

## Phase 6: Polish & Cross-Cutting Concerns
- [x] T601 [P] 更新 README/Spec/Plan/Agents 以反映官方 Notion SDK 替换、运行命令与注意事项
- [x] T602 代码清理与轻量并发控制（必要时）
- [x] T603 [P]（可选）添加脚本级 quick validation（统计成功/失败数量的输出）

---

## Dependencies & Execution Order
- Phase 1 → Phase 2 → User Stories (Phase 3/4/5) → Polish (Phase 6)
- US1/US2/US3 可在完成 Phase 2 后并行，但共享的 Notion SDK 替换与 awaitable 写入必须先完成
