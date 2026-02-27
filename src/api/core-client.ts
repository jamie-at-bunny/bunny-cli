import createClient from "openapi-fetch";
import type { paths } from "./generated/core.d.ts";
import { authMiddleware } from "./middleware.ts";

/** Create a type-safe client for the Bunny Core API (CDN, DNS, storage zones, billing). */
export function createCoreClient(apiKey: string, baseUrl: string) {
  const client = createClient<paths>({ baseUrl });
  client.use(authMiddleware(apiKey));
  return client;
}
