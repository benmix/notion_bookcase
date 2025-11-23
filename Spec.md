# Feature Specification: Douban/Goodreads → Notion Sync

**Feature Branch**: `[001-notion-sync-stabilize]`  
**Created**: 2025-11-23  
**Status**: Draft  
**Input**: User description: "将豆瓣/Goodreads 读书数据同步到 Notion，支持全量与增量模式，字段完整且去重"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 豆瓣同步到 Notion（全量/增量） (Priority: P1)

作为用户，我希望把豆瓣的想读/在读/读过列表同步到 Notion，包括封面、评分、标注日期、出版社等，以便集中管理阅读记录。

**Why this priority**: 豆瓣是主要数据源，缺失会让数据库失去核心价值。

**Independent Test**: 配置 `DOUBAN_USER_ID`、`NOTION_TOKEN`、`NOTION_BOOK_DATABASE_ID` 后运行 `deno task start:douban:full` 或 `deno task start:douban:rss`，校验 Notion 中条目数量与豆瓣一致且无重复。

**Acceptance Scenarios**:

1. **Given** 正确的豆瓣用户 ID 和 Notion 配置，**When** 执行全量同步，**Then** Notion 中生成的条目数量与豆瓣列表匹配，字段齐全（封面、评分、状态、标注日期、出版信息等）。
2. **Given** 已同步的条目，**When** 再次运行同步，**Then** 不会产生重复条目，且评分/状态变更会被更新。
3. **Given** 最近的阅读动态，**When** 运行 RSS 增量同步，**Then** 仅新增/更新最新的记录，字段与详情页一致。

---

### User Story 2 - Goodreads 同步到 Notion (Priority: P2)

作为用户，我希望将 Goodreads 书架（在读/想读/读过）同步到 Notion，并保留封面、评分、作者、出版日期与短评，补充英文书籍数据。

**Why this priority**: Goodreads 是次要但重要的数据源，能覆盖非豆瓣书籍。

**Independent Test**: 配置 `GOODREADS_USER_ID` 与 Notion 后运行 `deno task start:goodreads:full` 或 `start:goodreads:part`，检查 Notion 写入正确且无重复。

**Acceptance Scenarios**:

1. **Given** Goodreads 书架存在多条记录，**When** 运行全量同步，**Then** Notion 中写入状态、评分、封面、作者、出版日期、短评等字段，数量与书架匹配。
2. **Given** Goodreads 某条记录的状态或评分变化，**When** 再次同步，**Then** Notion 对应条目被更新而非重复创建。

---

### User Story 3 - 稳定可重复执行 (Priority: P3)

作为维护者，我希望同步任务在网络或源站异常时能显式失败或部分成功，不写入错误数据，并可重复执行无副作用。

**Why this priority**: 稳定性决定任务可持续运行，避免数据污染与人工介入。

**Independent Test**: 在模拟网络抖动/解析失败时运行任务，确认等待所有写入并在失败时以非 0 退出码和日志提示，无重复或空字段污染。

**Acceptance Scenarios**:

1. **Given** 部分详情页解析失败，**When** 任务结束，**Then** 失败原因被记录，退出码非 0，数据库不写入不完整记录或保持上次成功状态。
2. **Given** Notion API 返回错误（如无效日期/权限），**When** 任务结束，**Then** 退出码非 0 且日志包含失败原因，其他已成功记录仍保留。

---

### Edge Cases

- 环境变量缺失或错误（NOTION_TOKEN/NOTION_BOOK_DATABASE_ID/DOUBAN_USER_ID/GOODREADS_USER_ID）应直接失败并提示。
- 源站 DOM 结构变更导致字段缺失时，应记录告警并避免写入错误数据。
- 日期字符串无法解析时应跳过该字段，避免写入 "Invalid Date" 触发 Notion 400。
- 同一书目多次同步需幂等（按条目链接 ID 去重），避免重复页面。
- 网络超时或反爬限制时，需要重试或至少失败可见，不应静默成功。
- 详情抓取失败时应记录并跳过写入该条，保持已有记录不被污染。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系统 MUST 支持豆瓣全量同步（wish/do/collect 分页抓取）并写入 Notion。
- **FR-002**: 系统 MUST 支持豆瓣 RSS 增量同步，仅处理 `book.douban` 链接。
- **FR-003**: 系统 MUST 支持 Goodreads 全量同步（read/currently-reading/to-read）及首页增量。
- **FR-004**: 系统 MUST 解析并写入封面、书名、状态、评分、标注日期、作者/译者、出版日期、ISBN、出版社、丛书、出品方、短评、条目链接。
- **FR-005**: 系统 MUST 将来源状态映射为中文状态与对应 emoji，并存入 Notion `状态` 字段和页面 icon。
- **FR-006**: 系统 MUST 依据来源条目 ID 去重（条目链接中的 subject/book id），避免重复创建页面。
- **FR-007**: 系统 MUST 等待所有详情抓取与 Notion 写入完成后再结束进程，暴露错误。
- **FR-008**: 系统 MUST 在日期格式化前校验合法性，无法解析时跳过该字段。
- **FR-009**: 系统 MUST 在缺少必需环境变量时退出并给出可读错误。
- **FR-010**: 系统 SHOULD 记录或输出失败原因（网络/解析/Notion API）以便排查。
- **FR-011**: 系统 SHOULD 对详情抓取实现轻量重试/跳过策略，避免单点失败阻塞同步。

### Key Entities *(include if feature involves data)*

- **BookRecord**: 单条书目数据，包含来源链接、状态、评分、封面、作者、出版信息、短评、标注日期等。
- **NotionDatabase**: 目标 Notion 数据库，包含字段映射、页面 icon/cover 配置及去重策略。
- **SourceFeed**: 豆瓣列表/RSS、Goodreads 书架数据源，用于产生 BookRecord。
- **SyncJob**: 一次同步执行的上下文，包含抓取、解析、去重、写入的流程与错误处理。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 对同一数据源重复运行任务时，Notion 中新增重复条目数为 0。
- **SC-002**: 全量同步后，Notion 中记录数量与来源列表匹配率 ≥ 99%，且关键字段（书名、状态、评分、条目链接）完整率 ≥ 99%。
- **SC-003**: RSS/首页增量任务在无新记录时耗时 < 1 分钟并以退出码 0 完成；有新记录时在写入完成后退出码 0。
- **SC-004**: 遇到解析/Notion API 错误时，退出码为非 0 且日志包含失败原因；无因非法字段写入导致的 400 错误。
