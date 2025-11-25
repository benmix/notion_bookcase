# Feature Specification: Douban/Goodreads → Notion Sync

**Feature Branch**: `[001-notion-sync-stabilize]`  
**Created**: 2025-11-23  
**Status**: Draft  
**Input**: User description: "将豆瓣/Goodreads 读书数据同步到 Notion，支持全量与增量模式，字段完整且去重"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 豆瓣同步到 Notion（全量/增量） (Priority: P1)

作为用户，我希望把豆瓣的想读/在读/读过列表同步到 Notion，包括封面、评分、标注日期、出版社等，以便集中管理阅读记录。

**Why this priority**: 豆瓣是主要数据源，缺失会让数据库失去核心价值。

**Independent Test**: 配置 `DOUBAN_USER_ID`、`NOTION_TOKEN`、`NOTION_BOOK_DATABASE_ID`（多数据源库提供 `NOTION_BOOK_DATA_SOURCE_ID`）后运行 `deno task start:douban:full` 或 `deno task start:douban:rss`，校验 Notion 中条目数量与豆瓣一致且无重复。

**Acceptance Scenarios**:

1. **Given** 正确的豆瓣用户 ID 和 Notion 配置，**When** 执行全量同步，**Then** Notion 中生成的条目数量与豆瓣列表匹配，字段齐全（封面、评分、状态、标注日期、出版信息等）。
2. **Given** 已同步的条目，**When** 再次运行同步，**Then** 不会产生重复条目，且评分/状态变更会被更新。
3. **Given** 最近的阅读动态，**When** 运行 RSS 增量同步，**Then** 仅新增/更新最新的记录，字段与详情页一致。

---

### User Story 2 - Goodreads 同步到 Notion (Priority: P2)

作为用户，我希望将 Goodreads 书架（在读/想读/读过）同步到 Notion，并保留封面、评分、作者、出版日期与短评，补充英文书籍数据。

**Why this priority**: Goodreads 是次要但重要的数据源，能覆盖非豆瓣书籍。

**Independent Test**: 配置 `GOODREADS_USER_ID` 与 Notion（含 `NOTION_BOOK_DATA_SOURCE_ID` 如有多数据源）后运行 `deno task start:goodreads:full` 或 `start:goodreads:part`，检查 Notion 写入正确且无重复。

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

### User Story 4 - 生成已读封面墙 (Priority: P2)

作为用户，我希望快速生成“已读封面墙”大图并设置为 Notion 书架数据库的封面，便于展示近期阅读。

**Why this priority**: 可视化展示提升可读性和分享体验，与同步流程解耦为独立命令。

**Independent Test**: 运行 `deno task generate:cover-wall --columns 5 --rows 8`，验证生成图片尺寸正确、封面按最近阅读排序、上传并更新数据库封面成功且无重复上传。

**Acceptance Scenarios**:

1. **Given** Notion 数据库存在状态为“读过”的条目，**When** 运行生成命令，**Then** 下载这些条目封面，按列行参数拼接生成图片并上传到 Notion，数据库封面更新为新图片。
2. **Given** 条目列表与上次生成相比无变化，**When** 运行生成命令，**Then** 任务检测到缓存签名一致并跳过重新抓取和上传。
3. **Given** 部分封面无法下载，**When** 生成任务继续执行，**Then** 跳过失败图片并记录警告，不影响其它图片合成与封面更新。
4. **Given** 生成命令执行完成，**When** 上传成功或失败，**Then** 生成的大图会以 `cover-wall-<timestamp>.png` 保存到 `assets/` 便于本地查看或重用。

---

### Edge Cases

- 环境变量缺失或错误（NOTION_TOKEN/NOTION_BOOK_DATABASE_ID/DOUBAN_USER_ID/GOODREADS_USER_ID）应直接失败并提示。
- Notion 库存在多个 data source 时，未指定 `NOTION_BOOK_DATA_SOURCE_ID` 应拒绝运行；所有 Notion 请求需携带 `Notion-Version: 2025-09-03` 并使用 `data_source_id`。
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
- **FR-012**: 系统 SHOULD 提供独立命令生成已读封面墙，支持列数、行数、单元格尺寸可配置，并按最近阅读排序。
- **FR-013**: 系统 MUST 复用 Notion 存量封面字段，不重复抓取来源站点封面。
- **FR-014**: 系统 MUST 上传合成后的图片到 Notion 文件接口并更新目标数据库封面；若签名未变则应跳过上传。
- **FR-015**: 系统 MUST 使用 Notion API 版本 `2025-09-03` 并以 `data_source_id` 作为页面父级/查询参数，确保多数据源兼容；多数据源场景需显式指定 `NOTION_BOOK_DATA_SOURCE_ID`，单数据源自动发现。
- **FR-016**: 系统 MUST 将生成的封面墙图片保存到 `assets/cover-wall-<timestamp>.png`，即使上传失败也保留本地副本。

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
