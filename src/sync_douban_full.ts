import "dotenv/load";
import { BookItem, DoubanBookType } from "./types.ts";
import {
  fetchBookItems,
  updateBookItemsInDatabase,
} from "./apis/douban_api.ts";
import {
  DOUBAN_USER_ID,
  NOTION_BOOK_DATABASE_ID,
  NOTION_TOKEN,
} from "./constants.ts";
import { assertRequiredEnv } from "./utils.ts";

async function fetchAllBookItems(
  type: DoubanBookType,
  start: number,
  data: BookItem[] = [],
): Promise<BookItem[]> {
  const { data: bookItems, cursor } = await fetchBookItems(type, start, data);
  if (cursor) return fetchAllBookItems(type, cursor, bookItems);
  else return bookItems;
}

async function main() {
  assertRequiredEnv({
    NOTION_TOKEN,
    NOTION_BOOK_DATABASE_ID,
    DOUBAN_USER_ID,
  });

  const readingBookItems = await fetchAllBookItems("do", 0);
  const wannaReadingBookItems = await fetchAllBookItems("wish", 0);
  const readBookItems = await fetchAllBookItems("collect", 0);

  const allBookItems: BookItem[] = [
    ...readingBookItems,
    ...wannaReadingBookItems,
    ...readBookItems,
  ];

  await updateBookItemsInDatabase(allBookItems);
  console.log(
    `Douban full sync done. total=${allBookItems.length} (read:${readBookItems.length}, reading:${readingBookItems.length}, wish:${wannaReadingBookItems.length})`,
  );
}

try {
  await main();
} catch (error) {
  console.error("Douban full sync failed", error);
  Deno.exit(1);
}
