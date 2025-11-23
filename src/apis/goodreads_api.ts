import "dotenv/load";
import {
  DB_PROPERTIES,
  GOODREADS_USER_ID,
  RATING_TEXT_GOODREADS,
  STATUS,
  USER_AGENT,
} from "../constants.ts";
import { BookItem, GoodReadsBookType } from "../types.ts";
import { DOMParser } from "deno_dom";
import { createPage, queryBooks, updatePage } from "./notion_api.ts";
import { getIDFromURLForGoodReads, templateURL } from "../utils.ts";
import dayjs from "dayjs";

const bookURL = templateURL`http://www.goodreads.com/review/list/${0}?${"shelf"}&${"page"}&sort=date_updated&order=d`;

export async function fetchBookItems(
  shelf: GoodReadsBookType,
  page: number,
  data: BookItem[] = [],
): Promise<{ data: BookItem[]; nextPage: number | null }> {
  const parsedData: BookItem[] = data;
  const response = await (
    await fetch(bookURL(GOODREADS_USER_ID, { shelf, page }), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "User-Agent": USER_AGENT,
      },
    })
  ).text();

  const dom = new DOMParser().parseFromString(response, "text/html")!;
  const nextPageDom = dom.querySelector("a.next_page");

  const bookItemContents = dom.querySelectorAll(".bookalike.review");
  // bugs: https://github.com/b-fuze/deno-dom/issues/4
  for (let index = 0; index < bookItemContents.length; index++) {
    const titleElm = dom.querySelector(
      `#booksBody tr:nth-of-type(${index + 1}) > td.title a`,
    );

    const pubDateElm = dom.querySelector(
      `#booksBody tr:nth-of-type(${index + 1}) > td.date_pub div`,
    );

    const pubDateEdtionElm = dom.querySelector(
      `#booksBody tr:nth-of-type(${index + 1}) > td.date_pub_edition div`,
    );

    const ratingElm = dom.querySelector(
      `#booksBody tr:nth-of-type(${index + 1}) > td.rating span.notranslate`,
    );

    const coverElm = dom.querySelector(
      `#booksBody tr:nth-of-type(${index + 1}) > td.cover img`,
    );

    const authorElm = dom.querySelector(
      `#booksBody tr:nth-of-type(${index + 1}) > td.author a`,
    );

    const isbn13Elm = dom.querySelector(
      `#booksBody tr:nth-of-type(${index + 1}) > td.isbn13 div`,
    );

    const reviewElm = dom.querySelector(
      `#booksBody tr:nth-of-type(${index + 1}) > td.review span`,
    );

    const dataStartElm = dom.querySelector(
      `#booksBody tr:nth-of-type(${index + 1}) > td.date_started span`,
    );

    const dataReadElm = dom.querySelector(
      `#booksBody tr:nth-of-type(${index + 1}) > td.date_read span`,
    );

    const dataAddElm = dom.querySelector(
      `#booksBody tr:nth-of-type(${index + 1}) > td.date_added span`,
    );

    const link = `https://www.goodreads.com${titleElm
      ?.getAttribute("href")
      ?.trim()}`;
    const title = titleElm?.textContent.trim();
    const addDate = dataAddElm?.textContent.trim();
    const startDate = dataStartElm?.textContent.trim();
    const readDate = dataReadElm?.textContent.trim();
    const rating =
      RATING_TEXT_GOODREADS[
        ratingElm
          ?.getAttribute("title")
          ?.trim() as keyof typeof RATING_TEXT_GOODREADS
      ];
    const cover = coverElm?.getAttribute("src")?.trim();
    const author = authorElm?.textContent.trim();
    const isbn = isbn13Elm?.textContent.trim();
    const pubDate = dayjs(pubDateElm?.textContent.trim()).isValid()
      ? dayjs(pubDateElm?.textContent.trim()).format("YYYY-MM-DD")
      : dayjs(pubDateEdtionElm?.textContent.trim()).isValid()
        ? dayjs(pubDateEdtionElm?.textContent.trim()).format("YYYY-MM-DD")
        : undefined;
    const review = reviewElm?.textContent.trim();
    const markDate = dayjs(readDate).isValid()
      ? dayjs(readDate).format("YYYY-MM-DD")
      : dayjs(startDate).isValid()
        ? dayjs(startDate).format("YYYY-MM-DD")
        : dayjs(addDate).isValid()
          ? dayjs(addDate).format("YYYY-MM-DD")
          : undefined;
    const data = {
      [DB_PROPERTIES.条目链接]: link,
      [DB_PROPERTIES.封面]: cover,
      [DB_PROPERTIES.书名]: title,
      [DB_PROPERTIES.ISBN]: isbn,
      [DB_PROPERTIES.个人评分]: rating,
      [DB_PROPERTIES.作者]: author,
      [DB_PROPERTIES.出版日期]: pubDate,
      [DB_PROPERTIES.我的短评]: review,
      [DB_PROPERTIES.状态]: STATUS[shelf],
      [DB_PROPERTIES.译者]: author,
      [DB_PROPERTIES.标注日期]: markDate,
    };
    parsedData.push(data);
  }

  return { data: parsedData, nextPage: nextPageDom ? page + 1 : null };
}

export const getBookItemsInDatabase = async (bookItems: BookItem[]) => {
  const ids = bookItems
    .map((book) => {
      if (typeof book?.[DB_PROPERTIES.条目链接] == "string") {
        return getIDFromURLForGoodReads(book[DB_PROPERTIES.条目链接]);
      } else {
        return "";
      }
    })
    .filter((id) => !!id);

  if (!ids.length) return [];

  return await queryBooks(ids, "goodreads");
};

export const updateBookItemsInDatabase = async (bookItems: BookItem[]) => {
  const bookItemsInDatabase = await getBookItemsInDatabase(bookItems);

  await Promise.all(
    bookItems.map(async (newBookItem) => {
      const link = newBookItem?.[DB_PROPERTIES.条目链接];
      if (typeof link !== "string" || !getIDFromURLForGoodReads(link)) return;

      const originBookItem =
        bookItemsInDatabase.find((item) => {
          if (
            typeof item?.[DB_PROPERTIES.条目链接] == "string" &&
            typeof newBookItem?.[DB_PROPERTIES.条目链接] == "string"
          ) {
            return (
              getIDFromURLForGoodReads(item?.[DB_PROPERTIES.条目链接]) ===
              getIDFromURLForGoodReads(newBookItem?.[DB_PROPERTIES.条目链接])
            );
          } else {
            return false;
          }
        }) || {};

      const updatedBookItem = Object.assign({}, originBookItem, newBookItem);

      if (updatedBookItem.page_id) {
        await updatePage(updatedBookItem);
      } else {
        await createPage(updatedBookItem);
      }
    }),
  );
};
