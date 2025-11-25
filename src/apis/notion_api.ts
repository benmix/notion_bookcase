import { Client } from "@notionhq/client";
import type {
  CreatePageParameters,
  PageObjectResponse,
  UpdatePageParameters,
} from "@notionhq/client";
import {
  DB_PROPERTIES,
  EMOJI,
  NOTION_BOOK_DATA_SOURCE_ID,
  NOTION_BOOK_DATABASE_ID,
  NOTION_TOKEN,
  NOTION_VERSION,
  PropertyType,
} from "../constants.ts";
import { BookItem } from "../types.ts";

export const notion = new Client({
  auth: NOTION_TOKEN,
  notionVersion: NOTION_VERSION,
});

let cachedBookDataSourceId: string | null = null;

async function getBookDataSourceId(): Promise<string> {
  if (cachedBookDataSourceId) return cachedBookDataSourceId;

  const envId = NOTION_BOOK_DATA_SOURCE_ID?.trim();
  if (envId) {
    cachedBookDataSourceId = envId;
    return envId;
  }

  if (!NOTION_BOOK_DATABASE_ID) {
    throw new Error(
      "NOTION_BOOK_DATABASE_ID is required to resolve data source",
    );
  }

  const database = await notion.databases.retrieve({
    database_id: NOTION_BOOK_DATABASE_ID,
  });
  if (!("data_sources" in database)) {
    throw new Error(
      `Notion response missing data_sources for database ${NOTION_BOOK_DATABASE_ID}. Confirm API version ${NOTION_VERSION} is applied.`,
    );
  }
  const dataSources = database.data_sources || [];

  if (!dataSources.length) {
    throw new Error(
      `No data sources found for database ${NOTION_BOOK_DATABASE_ID}. Add one in Notion or set NOTION_BOOK_DATA_SOURCE_ID.`,
    );
  }

  if (dataSources.length > 1) {
    throw new Error(
      `Multiple data sources found for database ${NOTION_BOOK_DATABASE_ID}. Set NOTION_BOOK_DATA_SOURCE_ID to choose one.`,
    );
  }

  cachedBookDataSourceId = dataSources[0].id;
  return cachedBookDataSourceId;
}

export function notionParser(item: PageObjectResponse): BookItem {
  const data: BookItem = { page_id: item.id };
  const dbPropertyKeys = Object.keys(
    DB_PROPERTIES,
  ) as (keyof typeof DB_PROPERTIES)[];

  // 只处理 DB_PROPERTIES 中定义的属性
  for (const key of dbPropertyKeys) {
    if (key in item.properties) {
      data[key] = getProperty(item.properties, key);
    }
  }

  return data;
}

function getProperty(
  properties: PageObjectResponse["properties"],
  key: keyof typeof DB_PROPERTIES,
): string | number | null {
  const propertyType = PropertyType[key];
  const propertyItem = properties[key];

  // 空值检查
  if (!propertyItem) {
    return null;
  }

  switch (propertyType) {
    case "title":
      if (propertyItem.type === "title") {
        const titleItem = propertyItem.title?.[0];
        return titleItem?.type === "text"
          ? titleItem.text?.content || null
          : null;
      }
      break;
    case "files":
      if (propertyItem.type === "files") {
        const fileItem = propertyItem.files?.[0];
        if (fileItem?.type === "external") return fileItem.external.url;
        if (fileItem?.type === "file") return fileItem.file.url;
        return null;
      }
      break;
    case "date":
      return propertyItem.type === "date"
        ? (propertyItem.date?.start ?? null)
        : null;
    case "multi_select":
      return propertyItem.type === "multi_select"
        ? (propertyItem.multi_select[0]?.name ?? null)
        : null;
    case "rich_text":
      if (propertyItem.type === "rich_text") {
        const richItem = propertyItem.rich_text?.[0];
        return richItem?.type === "text"
          ? richItem.text?.content || null
          : null;
      }
      break;
    case "number":
      return propertyItem.type === "number"
        ? (propertyItem.number ?? null)
        : null;
    case "url":
      return propertyItem.type === "url" ? (propertyItem.url ?? null) : null;
    default:
      return null;
  }
  return null;
}

function setProperty(val: string | number | null | undefined, key: string) {
  if (val === null || val === undefined) return null;

  switch (key) {
    case "title":
      return {
        title: [
          {
            text: {
              content: String(val),
            },
          },
        ],
      };
    case "files":
      return {
        files: [
          {
            name: typeof val === "string" ? val.slice(0, 100) : String(val),
            external: { url: String(val) },
          },
        ],
      };
    case "date":
      // 确保日期是字符串格式
      return { date: { start: String(val) } };
    case "multi_select":
      return { multi_select: [{ name: String(val) }] };
    case "rich_text":
      return {
        rich_text: [
          {
            type: "text",
            text: { content: String(val) },
          },
        ],
      };
    case "number":
      return { number: Number(val) };
    case "url":
      return { url: String(val) };
    default:
      return null;
  }
}

function buildNotionProperties(item: BookItem) {
  const entries = Object.keys(DB_PROPERTIES).map((key) => [
    key,
    setProperty(
      item[key as keyof typeof DB_PROPERTIES],
      PropertyType[key as keyof typeof DB_PROPERTIES],
    ),
  ]);

  const properties = Object.fromEntries(entries);
  deleteUnusedProperties(properties);
  return properties;
}

function deleteUnusedProperties(properties: BookItem) {
  for (const key of Object.keys(DB_PROPERTIES)) {
    if (properties[key as keyof typeof DB_PROPERTIES] === null) {
      delete properties[key as keyof typeof DB_PROPERTIES];
    }
  }
}

/**
 * 构建页面的 icon 配置
 * 仅当状态值有效时返回 icon 配置，否则返回 undefined
 */
function buildPageIcon(status: string | number | null | undefined) {
  if (typeof status !== "string") return undefined;
  const emoji = EMOJI[status as keyof typeof EMOJI];
  if (!emoji) return undefined;
  return { type: "emoji" as const, emoji };
}

/**
 * 构建页面的 cover 配置
 * 仅当封面 URL 有效时返回 cover 配置，否则返回 undefined
 */
function buildPageCover(coverUrl: string | number | null | undefined) {
  if (typeof coverUrl !== "string" || !coverUrl.trim()) return undefined;
  return { type: "external" as const, external: { url: coverUrl } };
}

export async function createPage(item: BookItem) {
  const dataSourceId = await getBookDataSourceId();
  const status = item[DB_PROPERTIES.状态];
  const cover = item[DB_PROPERTIES.封面];

  const data: CreatePageParameters = {
    parent: { type: "data_source_id", data_source_id: dataSourceId },
    icon: buildPageIcon(status),
    cover: buildPageCover(cover),
    properties: buildNotionProperties(item),
  };

  await notion.pages.create(data);
}

export async function updatePage(item: BookItem) {
  if (!item.page_id) {
    throw new Error("page_id is required for updatePage");
  }

  const status = item[DB_PROPERTIES.状态];
  const cover = item[DB_PROPERTIES.封面];

  const data: UpdatePageParameters = {
    page_id: item.page_id,
    icon: buildPageIcon(status),
    cover: buildPageCover(cover),
    properties: buildNotionProperties(item),
  };

  await notion.pages.update(data);
}

export async function queryBooks(
  ids: string[],
  domain: "goodreads" | "douban",
) {
  const validIDs = ids.filter((id) => !!id.trim());
  if (!validIDs.length) return [];

  const dataSourceId = await getBookDataSourceId();

  // 修复分页逻辑：slice(start, start + 100)
  const sliceIDs: string[][] = [];
  for (let start = 0; start < validIDs.length; start += 100) {
    sliceIDs.push(validIDs.slice(start, start + 100));
  }

  const res = await Promise.all(
    sliceIDs.map((idsSlice) =>
      notion.dataSources
        .query({
          data_source_id: dataSourceId,
          result_type: "page",
          filter: {
            or: idsSlice.map((id) => ({
              and: [
                {
                  property: DB_PROPERTIES.条目链接,
                  url: {
                    contains: domain,
                  },
                },
                {
                  property: DB_PROPERTIES.条目链接,
                  url: {
                    contains: id,
                  },
                },
              ],
            })),
          },
        })
        .then((data) => {
          return data.results
            .filter(
              (r): r is PageObjectResponse =>
                r.object === "page" && "properties" in r,
            )
            .map((item) => notionParser(item));
        }),
    ),
  );

  return res.flat();
}

export async function fetchReadBooksFromDatabase(limit?: number) {
  const dataSourceId = await getBookDataSourceId();
  const results: BookItem[] = [];
  let cursor: string | undefined;

  do {
    const queryRes = await notion.dataSources.query({
      data_source_id: dataSourceId,
      result_type: "page",
      page_size: 100,
      start_cursor: cursor,
      filter: {
        property: DB_PROPERTIES.状态,
        multi_select: { contains: "读过" },
      },
      sorts: [
        { property: DB_PROPERTIES.标注日期, direction: "descending" },
        { timestamp: "last_edited_time", direction: "descending" },
      ],
    });

    const parsed = queryRes.results
      .filter(
        (r): r is PageObjectResponse =>
          r.object === "page" && "properties" in r,
      )
      .map((item) => notionParser(item));

    results.push(...parsed);
    cursor = queryRes.has_more
      ? (queryRes.next_cursor ?? undefined)
      : undefined;
    if (limit && results.length >= limit) {
      return results.slice(0, limit);
    }
  } while (cursor);

  return results;
}

type NotionUploadedFile = {
  id: string;
};

export async function uploadFileToNotion(
  buffer: Uint8Array,
  filename: string,
  mimeType: string,
): Promise<NotionUploadedFile> {
  if (!NOTION_TOKEN) throw new Error("NOTION_TOKEN is required for upload");

  const safeBuffer = new Uint8Array(buffer);
  const blob = new Blob([safeBuffer.buffer], { type: mimeType });

  const fileUploadObj = await notion.fileUploads.create({
    filename: filename,
    content_type: mimeType, // 使用传入的 mimeType 参数
  });

  const data = await notion.fileUploads.send({
    file_upload_id: fileUploadObj.id,
    file: {
      filename: filename,
      data: blob,
    },
  });

  if (data.status !== "uploaded") {
    throw new Error(`Notion file upload failed with status: ${data.status}`);
  }

  return {
    id: data.id,
  };
}

/**
 * 更新数据库封面
 * 使用 file_upload 类型，传入上传后获得的文件 ID
 */
export async function updateDatabaseCoverWithFile(file: NotionUploadedFile) {
  if (!NOTION_BOOK_DATABASE_ID) {
    throw new Error("NOTION_BOOK_DATABASE_ID is required for database cover");
  }

  await notion.databases.update({
    database_id: NOTION_BOOK_DATABASE_ID,
    cover: {
      type: "file_upload",
      file_upload: {
        id: file.id,
      },
    },
  });
}
