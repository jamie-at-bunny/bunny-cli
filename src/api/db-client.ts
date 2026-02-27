import createClient from "openapi-fetch";
import type { paths } from "./generated/database.d.ts";
import { authMiddleware } from "./middleware.ts";

const DB_BASE_URL = "https://api.bunny.net/database";

/** Create a type-safe client for the Bunny Database API. */
export function createDbClient(apiKey: string, baseUrl = DB_BASE_URL) {
  const client = createClient<paths>({ baseUrl });
  client.use(authMiddleware(apiKey));
  return client;
}
