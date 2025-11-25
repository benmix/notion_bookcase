import "dotenv/load";
import { parseArgs } from "@std/cli/parse-args";
import Jimp from "jimp";
import { Buffer } from "node:buffer";
import {
  fetchReadBooksFromDatabase,
  updateDatabaseCoverWithFile,
  uploadFileToNotion,
} from "./apis/notion_api.ts";
import {
  DB_PROPERTIES,
  NOTION_BOOK_DATABASE_ID,
  NOTION_TOKEN,
} from "./constants.ts";
import { BookItem } from "./types.ts";
import { assertRequiredEnv, withRetry } from "./utils.ts";

type CacheFile = {
  signature: string;
  params: GridParams;
  coverUrls: string[];
  pageIds: string[];
  uploaded?: {
    url: string;
    expiry_time?: string;
    uploaded_at: string;
    filename: string;
  };
};

type GridParams = {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  maxBooks: number;
};

type CoverSource = { url: string; pageId: string };

const ASSETS_DIR = "assets";
const CACHE_PATH = `${ASSETS_DIR}/cover_wall_cache.json`;
const MIME = "image/png";
const DEFAULTS: GridParams = {
  columns: 5,
  rows: 8,
  cellWidth: 540,
  cellHeight: 750,
  maxBooks: 40,
};

async function main() {
  assertRequiredEnv({ NOTION_TOKEN, NOTION_BOOK_DATABASE_ID });

  const flags = parseArgs(Deno.args, {
    boolean: ["force"],
    default: {
      columns: DEFAULTS.columns,
      rows: DEFAULTS.rows,
      cellWidth: DEFAULTS.cellWidth,
      cellHeight: DEFAULTS.cellHeight,
    },
  });

  const params: GridParams = {
    columns: Number(flags.columns),
    rows: Number(flags.rows),
    cellWidth: Number(flags.cellWidth),
    cellHeight: Number(flags.cellHeight),
    maxBooks: Number(
      flags.maxBooks ?? Number(flags.columns) * Number(flags.rows),
    ),
  };

  const cache = await readCache();

  const readBooks = await fetchReadBooksFromDatabase(params.maxBooks * 2);

  const covers = selectCovers(readBooks, params.maxBooks);

  if (!covers.length) {
    throw new Error("No valid cover URLs found in read books");
  }

  const signature = await hashSignature(params, covers);

  if (!flags.force && cache?.signature === signature) {
    console.log("Cover wall unchanged. Skipping generation and upload.");
    return;
  }

  const wallBuffer = await buildCoverWall(covers, params);

  const filename = `cover-wall-${Date.now()}.png`;
  await persistLocalCopy(wallBuffer, filename);

  const uploaded = await uploadFileToNotion(wallBuffer, filename, MIME);

  if (!uploaded) {
    throw new Error("Failed to upload cover wall image");
  }

  await updateDatabaseCoverWithFile(uploaded);

  await writeCache({
    signature,
    params,
    coverUrls: covers.map((c) => c.url),
    pageIds: covers.map((c) => c.pageId),
    uploaded: {
      ...uploaded,
      uploaded_at: new Date().toISOString(),
      filename,
    },
  });

  console.log(
    `Cover wall updated: ${covers.length} covers -> ${uploaded.url} (expires ${uploaded.expiry_time ?? "n/a"})`,
  );
}

function selectCovers(books: BookItem[], max: number): CoverSource[] {
  const filtered: CoverSource[] = [];
  for (const book of books) {
    const cover = book[DB_PROPERTIES.封面];
    if (typeof cover !== "string" || !cover.startsWith("http")) continue;
    const pageId = book.page_id;
    if (!pageId) continue;
    filtered.push({ url: cover, pageId });
    if (filtered.length >= max) break;
  }
  return filtered;
}

async function buildCoverWall(covers: CoverSource[], params: GridParams) {
  const canvas = new Jimp(
    params.columns * params.cellWidth,
    params.rows * params.cellHeight,
    0xffffffff,
  );

  for (let idx = 0; idx < covers.length; idx++) {
    const col = idx % params.columns;
    const row = Math.floor(idx / params.columns);
    const x = col * params.cellWidth;
    const y = row * params.cellHeight;
    if (row >= params.rows) break;

    try {
      const img = await fetchImage(covers[idx].url);
      const fitted = fitImage(img, params.cellWidth, params.cellHeight);
      canvas.composite(fitted, x, y);
    } catch (error) {
      console.warn("Skip failed cover", covers[idx].url, error);
    }
  }

  return await canvas.quality(85).getBufferAsync(MIME);
}

async function fetchImage(url: string) {
  const arrayBuffer = await withRetry(
    async () => {
      const res = await fetch(url);
      if (!res.ok)
        throw new Error(`Failed to fetch image ${url}: ${res.status}`);
      return await res.arrayBuffer();
    },
    2,
    300,
  );

  return await Jimp.read(Buffer.from(arrayBuffer));
}

function fitImage(img: Jimp, width: number, height: number) {
  const scale = Math.max(width / img.bitmap.width, height / img.bitmap.height);
  const resized = img
    .clone()
    .resize(
      Math.ceil(img.bitmap.width * scale),
      Math.ceil(img.bitmap.height * scale),
    );

  const x = Math.floor((resized.bitmap.width - width) / 2);
  const y = Math.floor((resized.bitmap.height - height) / 2);
  return resized.crop(x, y, width, height);
}

async function hashSignature(params: GridParams, covers: CoverSource[]) {
  const data = JSON.stringify({
    params,
    covers,
  });
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(data),
  );
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function readCache(): Promise<CacheFile | null> {
  try {
    const content = await Deno.readTextFile(CACHE_PATH);
    return JSON.parse(content) as CacheFile;
  } catch {
    return null;
  }
}

async function writeCache(cache: CacheFile) {
  await ensureAssetsDir();
  await Deno.writeTextFile(CACHE_PATH, JSON.stringify(cache, null, 2));
}

async function persistLocalCopy(buffer: Uint8Array, filename: string) {
  await ensureAssetsDir();
  const localPath = `${ASSETS_DIR}/${filename}`;
  await Deno.writeFile(localPath, buffer);
  console.log(`Cover wall saved locally: ${localPath}`);
}

async function ensureAssetsDir() {
  await Deno.mkdir(ASSETS_DIR, { recursive: true });
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("generate_cover_wall failed", error);
    Deno.exit(1);
  });
}
