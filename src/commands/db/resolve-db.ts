import type { paths } from "../../api/generated/database.d.ts";
import type createClient from "openapi-fetch";
import { readEnvValue } from "../../utils/env-file.ts";
import { ENV_DATABASE_URL } from "./constants.ts";

/**
 * Walk up the directory tree looking for a `.env` file containing a database URL.
 * Returns the URL value or `undefined` if not found.
 */
export function findDbUrlFromEnv(): string | undefined {
  return readEnvValue(ENV_DATABASE_URL)?.value;
}

/**
 * Resolve a database ID from an explicit value or by matching the database URL
 * from a `.env` file against the database list.
 *
 * Resolution order:
 * 1. Explicit `databaseId` argument
 * 2. `BUNNY_DATABASE_URL` in `.env` — matched against API database list
 */
export async function resolveDbId(
  client: ReturnType<typeof createClient<paths>>,
  databaseId: string | undefined,
): Promise<{ id: string; source: "argument" | "env" }> {
  if (databaseId) return { id: databaseId, source: "argument" };

  const url = findDbUrlFromEnv();
  if (!url) {
    throw new Error(
      `No database ID provided and no ${ENV_DATABASE_URL} found in .env`,
    );
  }

  // Paginate through all databases to find one matching the .env URL
  let match: { id: string; url: string } | undefined;
  let page = 1;

  while (!match) {
    const { data } = await client.GET("/v2/databases", {
      params: { query: { page, per_page: 100 } },
    });

    const databases = data?.databases ?? [];
    match = databases.find((db) => db.url === url);

    if (!data?.page_info?.has_more_items) break;
    page++;
  }

  if (!match) {
    throw new Error(
      `No database found matching ${ENV_DATABASE_URL}: ${url}`,
    );
  }

  return { id: match.id, source: "env" };
}
