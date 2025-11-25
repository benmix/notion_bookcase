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
  const keys = Object.keys(item.properties) as (keyof typeof DB_PROPERTIES)[];

  keys.forEach((key) => {
    data[key] = getProperty(item.properties, key);
  });

  return data;
}

function getProperty(
  properties: PageObjectResponse["properties"],
  key: keyof typeof DB_PROPERTIES,
) {
  const propertyType = PropertyType[key];
  const propertyItem = properties[key];

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
      return propertyItem.type === "date" ? propertyItem.date?.start : null;
    case "multi_select":
      return propertyItem.type === "multi_select"
        ? propertyItem.multi_select[0]?.name || null
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
        ? propertyItem.number || null
        : null;
    case "url":
      return propertyItem.type === "url" ? propertyItem.url || null : null;
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
      return { date: { start: val } };
    case "multi_select":
      return { multi_select: [{ name: val }] };
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

export async function createPage(item: BookItem) {
  const dataSourceId = await getBookDataSourceId();
  const data = {
    parent: { type: "data_source_id", data_source_id: dataSourceId },
    icon: {
      type: "emoji",
      emoji: EMOJI[item[DB_PROPERTIES.状态] as keyof typeof EMOJI] || "",
    },
    cover: {
      type: "external",
      external: { url: item?.[DB_PROPERTIES.封面] || "" },
    },
    properties: buildNotionProperties(item),
  };

  await notion.pages.create(data as CreatePageParameters);
}

export async function updatePage(item: BookItem) {
  const data = {
    page_id: item.page_id,
    icon: {
      type: "emoji",
      emoji: EMOJI[item[DB_PROPERTIES.状态] as keyof typeof EMOJI] || "",
    },
    cover: {
      type: "external",
      external: { url: item?.[DB_PROPERTIES.封面] || "" },
    },
    properties: buildNotionProperties(item),
  };

  await notion.pages.update(data as UpdatePageParameters);
}

export async function queryBooks(
  ids: string[],
  domain: "goodreads" | "douban",
) {
  const validIDs = ids.filter((id) => !!id.trim());
  if (!validIDs.length) return [];

  const dataSourceId = await getBookDataSourceId();
  const sliceIDs = (() => {
    const slice: string[][] = [];
    let end = 0;
    while (end < validIDs.length) {
      slice.push(validIDs.slice(end, 100));
      end += 100;
    }
    return slice;
  })();

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

type NotionUploadResponse = {
  file?: { url: string; expiry_time?: string };
  url?: string;
  expiry_time?: string;
};

export async function uploadFileToNotion(
  buffer: Uint8Array,
  filename: string,
  mimeType: string,
): Promise<NotionUploadResponse["file"]> {
  if (!NOTION_TOKEN) throw new Error("NOTION_TOKEN is required for upload");

  const safeBuffer = new Uint8Array(buffer);
  const blob = new Blob([safeBuffer.buffer], { type: mimeType });

  const fileUploadObj = await notion.fileUploads.create({
    filename: filename,
    content_type: "image/png",
  });

  const data = await notion.fileUploads.send({
    file_upload_id: fileUploadObj.id,
    file: {
      filename: filename,
      data: blob,
    },
  });

  const file = data.upload_url
    ? {
        url: data.upload_url,
        expiry_time: data.expiry_time ? data.expiry_time : undefined,
      }
    : undefined;

  if (!file?.url) throw new Error("Notion upload did not return a file url");

  return file;
}

export async function updateDatabaseCoverWithFile(file: {
  url: string;
  expiry_time?: string;
}) {
  if (!NOTION_BOOK_DATABASE_ID) {
    throw new Error("NOTION_BOOK_DATABASE_ID is required for database cover");
  }

  const payload = {
    database_id: NOTION_BOOK_DATABASE_ID,
    cover: {
      type: "file",
      file: {
        url: file.url,
        expiry_time: file.expiry_time,
      },
    },
  };

  await notion.databases.update(payload as never);
}
