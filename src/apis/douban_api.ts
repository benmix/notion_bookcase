import "dotenv/load";
import {
  DB_PROPERTIES,
  DOUBAN_USER_ID,
  RATING_TEXT_FULL,
  STATUS,
  USER_AGENT,
} from "../constants.ts";
import { BookItem, DoubanBookType } from "../types.ts";
import { createPage, queryBooks, updatePage } from "./notion_api.ts";
import {
  getIDFromURL,
  getNextValidContent,
  templateURL,
  withRetry,
} from "../utils.ts";
import { DOMParser } from "deno_dom";
import dayjs from "dayjs";

const bookURL = templateURL`https://book.douban.com/people/${0}/${1}?${"start"}&sort=time&rating=all&filter=all&mode=list`;

const doubanCookie = await (
  await fetch("https://book.douban.com")
).headers.get("set-cookie");

export async function fetchBookItems(
  type: DoubanBookType,
  start: number,
  data: BookItem[] = [],
): Promise<{ data: BookItem[]; cursor: null | number }> {
  const parsedData: BookItem[] = data;
  const response = await (
    await fetch(bookURL(DOUBAN_USER_ID, type, { start }), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        Cookie: doubanCookie || "",
        "User-Agent": USER_AGENT,
      },
    })
  ).text();

  const dom = new DOMParser().parseFromString(response, "text/html")!;
  const [, , end, total] =
    dom
      .querySelector(".mode > .subject-num")
      ?.textContent.trim()
      .match(/([\d]+)-([\d]+)\s\/\s([\d]+)/) || [];

  const bookItemContents = dom.querySelectorAll(".list-view li");
  // bugs: https://github.com/b-fuze/deno-dom/issues/4
  for (let index = 0; index < bookItemContents.length; index++) {
    const titleElm = dom.querySelector(
      `.list-view li:nth-of-type(${index + 1}) > div.item-show > div.title > a`,
    );

    const dateElm = dom.querySelector(
      `.list-view li:nth-of-type(${index + 1}) > div.item-show > div.date`,
    );

    const ratingElm = dom.querySelector(`
    .list-view li:nth-of-type(${index + 1}) > div.item-show > div.date > span
    `);

    const link = titleElm?.getAttribute("href")?.trim();
    const title = titleElm?.textContent.trim();
    const markDate = dateElm?.textContent.trim();
    const rating = ratingElm?.getAttribute("class")?.trim();

    const item = {
      [DB_PROPERTIES.条目链接]: link,
      [DB_PROPERTIES.个人评分]:
        RATING_TEXT_FULL[rating as keyof typeof RATING_TEXT_FULL],
      [DB_PROPERTIES.标注日期]: markDate,
      [DB_PROPERTIES.书名]: title,
      [DB_PROPERTIES.状态]: STATUS[type],
    };

    if (typeof link == "string") {
      try {
        const detail = await withRetry(() =>
          htmlParser(item[DB_PROPERTIES.条目链接]),
        );
        Object.assign(item, detail);
      } catch (error) {
        console.warn("Failed to fetch douban detail", link, error);
      }
    }

    parsedData.push(item);
  }

  if (Number(end) >= Number(total)) return { data: parsedData, cursor: null };
  else return { data: parsedData, cursor: Number(end) };
}

export const getBookItemsInDatabase = async (bookItems: BookItem[]) => {
  const ids = bookItems
    .map((book) => {
      if (typeof book?.[DB_PROPERTIES.条目链接] == "string") {
        return getIDFromURL(book[DB_PROPERTIES.条目链接]);
      } else {
        return "";
      }
    })
    .filter((id) => !!id);

  if (!ids.length) return [];

  return await queryBooks(ids, "douban");
};

export const updateBookItemsInDatabase = async (bookItems: BookItem[]) => {
  const bookItemsInDatabase = await getBookItemsInDatabase(bookItems);

  await Promise.all(
    bookItems.map(async (newBookItem) => {
      const link = newBookItem?.[DB_PROPERTIES.条目链接];
      if (typeof link !== "string" || !getIDFromURL(link)) return;

      const originBookItem =
        bookItemsInDatabase.find((item) => {
          if (
            typeof item?.[DB_PROPERTIES.条目链接] == "string" &&
            typeof newBookItem?.[DB_PROPERTIES.条目链接] == "string"
          ) {
            return (
              getIDFromURL(item?.[DB_PROPERTIES.条目链接]) ===
              getIDFromURL(newBookItem?.[DB_PROPERTIES.条目链接])
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

export async function htmlParser(link?: string) {
  if (!link) return;
  const data: BookItem = {};
  const response = await (await fetch(link)).text();
  const dom = new DOMParser().parseFromString(response, "text/html")!;

  data[DB_PROPERTIES.书名] = dom
    .querySelector('#wrapper > h1 > [property="v:itemreviewed"]')
    ?.textContent.trim();
  data[DB_PROPERTIES.封面] = dom
    .querySelector("#mainpic > a")
    ?.getAttribute("href")
    ?.replace(/\.webp$/, ".jpg");

  const infoContents = dom.querySelectorAll("#info .pl");

  for (const content of infoContents) {
    const text = content.textContent.trim();
    const parentNode = content.parentElement;
    if (parentNode?.id !== "info") {
      if (text.startsWith(DB_PROPERTIES.作者)) {
        data[DB_PROPERTIES.作者] = parentNode?.textContent
          .replace("作者:", "")
          .trim()
          .replace(/\n/g, "")
          .replace(/\s/g, "");
      }

      if (text.startsWith(DB_PROPERTIES.译者)) {
        data[DB_PROPERTIES.译者] = parentNode?.textContent
          .replace("译者:", "")
          .trim()
          .replace(/\n/g, "")
          .replace(/\s/g, "");
      }
      continue;
    }
    if (text.startsWith(DB_PROPERTIES.出版社)) {
      data[DB_PROPERTIES.出版社] =
        getNextValidContent(content)?.textContent.trim();
      continue;
    }

    if (text.startsWith("副书名")) {
      data[DB_PROPERTIES.书名] += `_${getNextValidContent(
        content,
      )?.textContent.trim()}`;
      continue;
    }

    if (text.startsWith("原作名")) {
      data[DB_PROPERTIES.书名] += `_[${getNextValidContent(
        content,
      )?.textContent.trim()}]`;
      continue;
    }

    if (text.startsWith("出版年")) {
      let nextText = getNextValidContent(content)?.textContent.trim() || "";
      if (/年|月|日/.test(nextText)) {
        nextText = nextText.replace(/年|月|日/g, "-").slice(0, -1);
      }
      if (dayjs(nextText).isValid()) {
        data[DB_PROPERTIES.出版日期] = dayjs(nextText).format("YYYY-MM-DD");
      }
      continue;
    }

    if (text.startsWith(DB_PROPERTIES.ISBN)) {
      data[DB_PROPERTIES.ISBN] =
        getNextValidContent(content)?.textContent.trim();
      continue;
    }

    if (text.startsWith(DB_PROPERTIES.丛书)) {
      data[DB_PROPERTIES.丛书] =
        getNextValidContent(content)?.textContent.trim();
      continue;
    }

    if (text.startsWith("出品方")) {
      data[DB_PROPERTIES.出品方] =
        getNextValidContent(content)?.textContent.trim();
      continue;
    }
  }
  return data;
}
