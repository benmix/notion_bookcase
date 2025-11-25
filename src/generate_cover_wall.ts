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
  params: LayoutParams;
  coverUrls: string[];
  pageIds: string[];
  uploaded?: {
    id: string;
    uploaded_at: string;
    filename: string;
  };
};

type LayoutParams = {
  width: number;
  targetRowHeight: number;
  maxBooks: number;
};

type CoverSource = { url: string; pageId: string; normalizedUrl: string };

type ImageWithRatio = {
  img: Jimp;
  aspectRatio: number; // width / height
};

type PlacedImage = {
  img: Jimp;
  x: number;
  y: number;
  width: number;
  height: number;
};

const ASSETS_DIR = "assets";
const CACHE_PATH = `${ASSETS_DIR}/cover_wall_cache.json`;
const MIME = "image/png";
const DEFAULTS: LayoutParams = {
  width: 2400,
  targetRowHeight: 300,
  maxBooks: 50,
};

async function main() {
  assertRequiredEnv({ NOTION_TOKEN, NOTION_BOOK_DATABASE_ID });

  const flags = parseArgs(Deno.args, {
    boolean: ["force"],
    default: {
      width: DEFAULTS.width,
      targetRowHeight: DEFAULTS.targetRowHeight,
      maxBooks: DEFAULTS.maxBooks,
    },
  });

  const params: LayoutParams = {
    width: Number(flags.width),
    targetRowHeight: Number(flags.targetRowHeight),
    maxBooks: Number(flags.maxBooks),
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

  const seed = signatureToSeed(signature);
  const wallBuffer = await buildJustifiedWall(covers, params, seed);

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
    `Cover wall updated: ${covers.length} covers in justified layout`,
  );
}

function selectCovers(books: BookItem[], max: number): CoverSource[] {
  const filtered: CoverSource[] = [];
  for (const book of books) {
    const cover = book[DB_PROPERTIES.封面];
    if (typeof cover !== "string" || !cover.startsWith("http")) continue;
    const pageId = book.page_id;
    if (!pageId) continue;
    filtered.push({
      url: cover,
      pageId,
      normalizedUrl: normalizeUrl(cover),
    });
    if (filtered.length >= max) break;
  }
  return filtered;
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function signatureToSeed(signature: string): number {
  let seed = 0;
  for (let i = 0; i < Math.min(signature.length, 8); i++) {
    seed = (seed << 4) | parseInt(signature[i], 16);
  }
  return seed >>> 0;
}

function createSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(array: T[], random: () => number): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 构建行式紧密布局（Justified Layout）
 * - 每行图片高度相同，宽度按比例自适应
 * - 每行总宽度精确等于画布宽度
 * - 整齐、有序、紧密、不裁图
 */
async function buildJustifiedWall(
  covers: CoverSource[],
  params: LayoutParams,
  seed: number,
): Promise<Uint8Array> {
  const random = createSeededRandom(seed);
  const shuffledCovers = shuffle(covers, random);

  // 并行加载所有图片
  const loadedImages = await Promise.all(
    shuffledCovers.map(async (cover) => {
      try {
        const img = await fetchImage(cover.url);
        return {
          img,
          aspectRatio: img.bitmap.width / img.bitmap.height,
        } as ImageWithRatio;
      } catch (error) {
        console.warn("Skip failed cover", cover.url, error);
        return null;
      }
    }),
  );

  const images = loadedImages.filter(
    (item): item is ImageWithRatio => item !== null,
  );

  if (images.length === 0) {
    throw new Error("No images loaded successfully");
  }

  // 生成行式布局
  const { placements, totalHeight } = generateJustifiedLayout(images, params);

  // 创建画布
  const canvas = new Jimp(params.width, totalHeight, 0xffffffff);

  // 绘制所有图片
  for (const placement of placements) {
    const resized = placement.img
      .clone()
      .resize(placement.width, placement.height);
    canvas.composite(resized, Math.round(placement.x), Math.round(placement.y));
  }

  return await canvas.quality(90).getBufferAsync(MIME);
}

type RowImage = {
  img: Jimp;
  aspectRatio: number;
  scaledWidth: number;
};

/**
 * 生成行式紧密布局
 * 算法：
 * 1. 按目标行高计算每张图片的初始宽度
 * 2. 累加宽度直到超过画布宽度，形成一行
 * 3. 调整该行所有图片的缩放比例，使总宽度精确等于画布宽度
 * 4. 重复直到所有图片放置完毕
 */
function generateJustifiedLayout(
  images: ImageWithRatio[],
  params: LayoutParams,
): { placements: PlacedImage[]; totalHeight: number } {
  const { width: canvasWidth, targetRowHeight } = params;
  const placements: PlacedImage[] = [];

  let currentY = 0;
  let imageIndex = 0;

  while (imageIndex < images.length) {
    // 收集当前行的图片
    const rowImages: RowImage[] = [];
    let rowWidth = 0;

    // 按目标行高计算宽度，累加直到超过画布宽度
    while (imageIndex < images.length) {
      const img = images[imageIndex];
      const scaledWidth = targetRowHeight * img.aspectRatio;

      // 如果当前行已有图片且加入新图片会超出太多，则换行
      if (rowImages.length > 0 && rowWidth + scaledWidth > canvasWidth * 1.2) {
        break;
      }

      rowImages.push({
        img: img.img,
        aspectRatio: img.aspectRatio,
        scaledWidth,
      });
      rowWidth += scaledWidth;
      imageIndex++;

      // 如果刚好填满或超过，结束当前行
      if (rowWidth >= canvasWidth) {
        break;
      }
    }

    if (rowImages.length === 0) break;

    // 计算实际行高，使总宽度精确等于画布宽度
    // 缩放比例 = canvasWidth / rowWidth
    // 实际行高 = targetRowHeight * (canvasWidth / rowWidth)
    const scale = canvasWidth / rowWidth;
    const actualRowHeight = Math.round(targetRowHeight * scale);

    // 放置该行的所有图片
    let currentX = 0;
    for (let i = 0; i < rowImages.length; i++) {
      const rowImg = rowImages[i];
      // 计算实际宽度（最后一张图片填满剩余空间，避免舍入误差）
      let actualWidth: number;
      if (i === rowImages.length - 1) {
        actualWidth = canvasWidth - currentX;
      } else {
        actualWidth = Math.round(rowImg.scaledWidth * scale);
      }

      placements.push({
        img: rowImg.img,
        x: currentX,
        y: currentY,
        width: actualWidth,
        height: actualRowHeight,
      });

      currentX += actualWidth;
    }

    currentY += actualRowHeight;
  }

  return { placements, totalHeight: currentY };
}

async function fetchImage(url: string): Promise<Jimp> {
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

async function hashSignature(
  params: LayoutParams,
  covers: CoverSource[],
): Promise<string> {
  const sortedCovers = [...covers].sort((a, b) =>
    a.pageId.localeCompare(b.pageId),
  );

  const data = JSON.stringify({
    params,
    covers: sortedCovers.map((c) => ({
      normalizedUrl: c.normalizedUrl,
      pageId: c.pageId,
    })),
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

async function writeCache(cache: CacheFile): Promise<void> {
  await ensureAssetsDir();
  await Deno.writeTextFile(CACHE_PATH, JSON.stringify(cache, null, 2));
}

async function persistLocalCopy(
  buffer: Uint8Array,
  filename: string,
): Promise<void> {
  await ensureAssetsDir();
  const localPath = `${ASSETS_DIR}/${filename}`;
  await Deno.writeFile(localPath, buffer);
  console.log(`Cover wall saved locally: ${localPath}`);
}

async function ensureAssetsDir(): Promise<void> {
  await Deno.mkdir(ASSETS_DIR, { recursive: true });
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("generate_cover_wall failed", error);
    Deno.exit(1);
  });
}
