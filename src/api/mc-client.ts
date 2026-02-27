import createClient from "openapi-fetch";
import type { paths } from "./generated/magic-containers.d.ts";
import { authMiddleware } from "./middleware.ts";

const MC_BASE_URL = "https://api.bunny.net/mc";

/** Create a type-safe client for the Bunny Magic Containers API. */
export function createMcClient(apiKey: string, baseUrl = MC_BASE_URL) {
  const client = createClient<paths>({ baseUrl });
  client.use(authMiddleware(apiKey));
  return client;
}
