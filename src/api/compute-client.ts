import createClient from "openapi-fetch";
import type { paths } from "./generated/compute.d.ts";
import { authMiddleware } from "./middleware.ts";

/** Create a type-safe client for the Bunny Edge Scripting (Compute) API. */
export function createComputeClient(apiKey: string, baseUrl: string) {
  const client = createClient<paths>({ baseUrl });
  client.use(authMiddleware(apiKey));
  return client;
}
