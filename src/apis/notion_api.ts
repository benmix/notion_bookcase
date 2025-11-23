import { Client } from "@notionhq/client";
import type {
  CreatePageParameters,
  PageObjectResponse,
  UpdatePageParameters,
} from "@notionhq/client/build/src/api-endpoints.js";
import {
  DB_PROPERTIES,
  EMOJI,
  NOTION_BOOK_DATABASE_ID,
  NOTION_TOKEN,
  PropertyType,
} from "../constants.ts";
import { BookItem } from "../types.ts";

export const notion = new Client({
  auth: NOTION_TOKEN,
});

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
        return fileItem?.type === "external" ? fileItem.external.url : null;
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
  const data = {
    parent: { database_id: NOTION_BOOK_DATABASE_ID },
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
  if (!NOTION_BOOK_DATABASE_ID) {
    throw new Error("NOTION_BOOK_DATABASE_ID is required for queryBooks");
  }
  const validIDs = ids.filter((id) => !!id.trim());
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
      notion.databases
        .query({
          database_id: NOTION_BOOK_DATABASE_ID || "",
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
