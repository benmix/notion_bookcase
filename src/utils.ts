import { Node, NodeType } from "deno_dom";

export function getNextElementSibling(content: Node) {
  let next = content.nextSibling;
  while (true) {
    if (next?.nodeType !== NodeType.ELEMENT_NODE && next !== null) {
      next = next.nextSibling;
    } else {
      return next;
    }
  }
}

export function getNextValidContent(content: Node) {
  const next = content.nextSibling?.textContent?.trim();
  if (next) return content.nextSibling;
  else return getNextElementSibling(content);
}

export function getIDFromURL(url?: string): string {
  const [id] = url?.match(/(?<=\/subject\/)\d+(?=\/)?/) || [""];
  return id;
}

export function getIDFromURLForGoodReads(url?: string): string {
  const [id] = url?.match(/(?<=\/book\/show\/)\d+(?=[-.])?/) || [""];
  return id;
}

export function templateURL(
  spans: TemplateStringsArray,
  ...keys: (string | number)[]
) {
  return (...args: unknown[]) => {
    const dicts: Record<string, string | number> = args[
      args.length - 1
    ] as Record<string, string | number>;
    return (
      spans[0] +
      keys
        .map((key, index) => {
          return Number.isInteger(key)
            ? args[key as number] + spans[index + 1]
            : key + "=" + dicts[key] + spans[index + 1];
        })
        .join("")
    );
  };
}

export function assertRequiredEnv(vars: Record<string, string | undefined>) {
  const missing = Object.entries(vars)
    .filter(([, val]) => !val)
    .map(([name]) => name);

  if (missing.length) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  delayMs = 300,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}
