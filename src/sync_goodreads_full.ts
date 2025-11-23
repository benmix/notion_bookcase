import "dotenv/load";
import { BookItem, GoodReadsBookType } from "./types.ts";
import {
  fetchBookItems,
  updateBookItemsInDatabase,
} from "./apis/goodreads_api.ts";
import {
  GOODREADS_USER_ID,
  NOTION_BOOK_DATABASE_ID,
  NOTION_TOKEN,
} from "./constants.ts";
import { assertRequiredEnv } from "./utils.ts";

async function fetchAllBookItems(
  shelf: GoodReadsBookType,
  page: number,
  data: BookItem[] = [],
): Promise<BookItem[]> {
  const { data: bookItems, nextPage } = await fetchBookItems(shelf, page, data);
  if (nextPage) return fetchAllBookItems(shelf, nextPage, bookItems);
  else return bookItems;
}

async function main() {
  assertRequiredEnv({
    NOTION_TOKEN,
    NOTION_BOOK_DATABASE_ID,
    GOODREADS_USER_ID,
  });

  const readingBookItems = await fetchAllBookItems("currently-reading", 0);
  const wannaReadingBookItems = await fetchAllBookItems("to-read", 0);
  const readBookItems = await fetchAllBookItems("read", 0);

  const allBookItems: BookItem[] = [
    ...readingBookItems,
    ...wannaReadingBookItems,
    ...readBookItems,
  ];

  await updateBookItemsInDatabase(allBookItems);
  console.log(
    `Goodreads full sync done. total=${allBookItems.length} (read:${readBookItems.length}, reading:${readingBookItems.length}, wish:${wannaReadingBookItems.length})`,
  );
}

try {
  await main();
} catch (error) {
  console.error("Goodreads full sync failed", error);
  Deno.exit(1);
}
