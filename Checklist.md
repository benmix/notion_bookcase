# QA Checklist: Douban/Goodreads → Notion Sync

**Purpose**: 覆盖豆瓣/Goodreads 同步到 Notion 的关键验收与稳定性检查  
**Created**: 2025-11-23  
**Feature**: Spec.md / Plan.md / Tasks.md

## 配置与依赖
- [ ] CHK001 已设置 `NOTION_TOKEN`、`NOTION_BOOK_DATABASE_ID`、`DOUBAN_USER_ID`、`GOODREADS_USER_ID`，缺一即失败退出。
- [ ] CHK002 `deno.json` imports 可正常解析（deno_dom、rss、dayjs、@notionhq/client）。
- [ ] CHK003 运行命令可用：`deno task start:douban:full`、`start:douban:rss`、`start:goodreads:full`、`start:goodreads:part`。

## 豆瓣同步（US1）
- [ ] CHK101 全量同步：数量与豆瓣 wish/do/collect 之和匹配，字段齐全（书名、封面、状态、评分、标注日期、出版信息等）。
- [ ] CHK102 增量（RSS）：仅新增/更新近期书目，无重复条目；字段与详情页一致。
- [ ] CHK103 去重：同一 subject id 只保留一条 Notion 页面，重复运行不新增重复项。
- [ ] CHK104 日期合法性：无 "Invalid Date" 写入 Notion，无法解析时应跳过。
- [ ] CHK105 异步等待：列表解析与详情抓取已 await，返回前数据完整。

## Goodreads 同步（US2）
- [ ] CHK201 全量同步：数量与 read/currently-reading/to-read 之和匹配，字段齐全（封面、评分、作者、出版日期、短评等）。
- [ ] CHK202 首页增量：仅同步第一页数据，无重复条目。
- [ ] CHK203 去重：同一 book id 只保留一条 Notion 页面，重复运行不新增重复项。
- [ ] CHK204 异步等待：抓取与推入流程已 await，返回前数据完整。

## 稳定性与错误处理（US3）
- [ ] CHK301 Notion 写入/查询均 await，脚本结束前完成所有请求。
- [ ] CHK302 遇到网络/解析/Notion API 错误时输出可读日志并以非 0 退出码失败。
- [ ] CHK303 详情抓取失败不会写入半成品数据；已存在记录保持原状或跳过。
- [ ] CHK304 可选重试/并发控制存在（如有实现），无被封或超时导致的静默失败。
- [ ] CHK305 同步结果日志包含成功/失败条目数量，便于人工校验。

## 文档与维护
- [ ] CHK401 README/Spec/Plan/Agents 说明已更新，包含官方 Notion SDK 替换（若已执行）、运行命令和注意事项。
- [ ] CHK402 变更后的字段/映射规则（状态、评分、封面、日期）在文档中有记录。
- [ ] CHK403 任务拆解（tasks.md）与实际实现一致，便于后续维护。

## Notes
- 逐项核对，完成后标记 `[x]`；发现问题直接在行内补充备注。***
