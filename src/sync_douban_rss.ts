import "dotenv/load";
import dayjs from "dayjs";
import { parseFeed } from "rss";
import { DOMParser } from "deno_dom";
import { FeedEntry } from "rss/feed";
import { htmlParser } from "./apis/douban_api.ts";
import { createPage, queryBooks, updatePage } from "./apis/notion_api.ts";
import {
  DB_PROPERTIES,
  DOUBAN_USER_ID,
  NOTION_BOOK_DATABASE_ID,
  NOTION_TOKEN,
  RATING_TEXT,
} from "./constants.ts";
import { BookItem } from "./types.ts";
import { assertRequiredEnv, getIDFromURL, withRetry } from "./utils.ts";

function getStatusFromTitle(title?: string): string {
  const [status] = title?.match(/^想读|(?<=最近)在读|读过/) || [""];
  return status;
}

function parseBookMarkItem(item: FeedEntry): BookItem {
  const data: BookItem = {};

  data[DB_PROPERTIES.状态] = getStatusFromTitle(item.title?.value);
  data[DB_PROPERTIES.标注日期] = dayjs(item.published).format("YYYY-MM-DD");
  data[DB_PROPERTIES.条目链接] = item.links[0].href;

  const dom = new DOMParser().parseFromString(
    item.description?.value || "",
    "text/html",
  );
  const contents = [...dom!.querySelectorAll("td > p")];

  for (const content of contents) {
    const text = content.textContent;
    if (text.startsWith("推荐")) {
      data[DB_PROPERTIES.个人评分] =
        RATING_TEXT[text.replace(/^推荐: /, "") as keyof typeof RATING_TEXT];
      continue;
    }

    if (text.startsWith("备注")) {
      data[DB_PROPERTIES.我的短评] = text.replace(/^备注: /, "");
      continue;
    }
  }

  return data;
}

async function main() {
  assertRequiredEnv({
    NOTION_TOKEN,
    NOTION_BOOK_DATABASE_ID,
    DOUBAN_USER_ID,
  });

  const response = await fetch(
    `https://www.douban.com/feed/people/${DOUBAN_USER_ID}/interests`,
  );
  const xml = await response.text();
  const feed = await parseFeed(xml);

  const feedsData = feed.entries
    .filter((item) => /book.douban/.test(item.links[0].href || ""))
    .map((item) => parseBookMarkItem(item));

  if (!feedsData.length) {
    console.log("No Need to Update Datebase");
    return;
  }

  await Promise.all(
    feedsData.map(async (item) => {
      const bookUrl = item?.[DB_PROPERTIES.条目链接];
      if (typeof bookUrl == "string") {
        try {
          const detail = await withRetry(() => htmlParser(bookUrl));
          Object.assign(item, detail);
        } catch (error) {
          console.warn("Failed to fetch douban detail", bookUrl, error);
        }
      }
    }),
  );

  const feedsInDatabase = await queryBooks(
    feedsData.map((feed) => {
      const bookUrl = feed?.[DB_PROPERTIES.条目链接];
      if (typeof bookUrl == "string") {
        return getIDFromURL(bookUrl);
      } else return "";
    }),
    "douban",
  );

  await Promise.all(
    feedsData.map(async (feed) => {
      const originFeed =
        feedsInDatabase.find((item) => {
          const itemBookUrl = item?.[DB_PROPERTIES.条目链接];
          const feedBookUrl = feed?.[DB_PROPERTIES.条目链接];

          if (
            typeof itemBookUrl == "string" &&
            typeof feedBookUrl == "string"
          ) {
            return getIDFromURL(itemBookUrl) === getIDFromURL(feedBookUrl);
          } else {
            return false;
          }
        }) || {};

      const updatedFeed = Object.assign({}, originFeed, feed);

      if (updatedFeed.page_id) {
        await updatePage(updatedFeed);
      } else {
        await createPage(updatedFeed);
      }
    }),
  );

  console.log(`Douban RSS sync done. total=${feedsData.length}`);
}

try {
  await main();
} catch (error) {
  console.error("Douban RSS sync failed", error);
  Deno.exit(1);
}
