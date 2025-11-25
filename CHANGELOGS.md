

## Recent Changes
- 2025-11-25 功能：封面墙生成新增本地输出，生成图片会保存为 `assets/cover-wall-<timestamp>.png`，便于查看或作为上传失败兜底。
- 2025-11-24 代码：Notion API 升级至版本 `2025-09-03`，父级/查询改用 `data_source_id`，增加 data source 发现与多数据源保护，客户端版本锁定；调整上传缓冲区处理兼容新 SDK。
- 2025-11-24 文档：更新 Agents/Spec/Plan/Task/Checklist 以记录 data_source 流程、必需环境变量与升级验证。
- 2025-11-23 功能：新增已读封面墙生成脚本（`deno task generate:cover-wall`），使用 Jimp 拼接封面、Notion 文件上传接口更新数据库封面，含缓存签名与可配置网格参数。
- 2025-11-23 `PLAN.md`：梳理异步等待、Notion 写入与日期校验问题，定义稳定性改造计划。
- 2025-11-23 `SPEC.md`：生成按模板的功能规格，涵盖用户故事、边界条件、成功标准。
- 2025-11-23 代码：替换官方 `@notionhq/client`，全链路 await，环境变量必填校验，豆瓣详情抓取重试与日志化，重新生成 `deno.lock`。
- 2025-11-23 文档：更新 README/Plan/Spec/Agents/Task/Checklist 以反映 SDK 替换、可靠性改造与任务完成状态。
