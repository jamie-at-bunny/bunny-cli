import createClient from "openapi-fetch";
import type { paths } from "./generated/core.d.ts";
import { authMiddleware } from "./middleware.ts";

/**
 * Undocumented endpoints not present in the generated OpenAPI spec.
 * Intersected with `paths` so the typed client can call them.
 */
type CustomPaths = {
  "/user": {
    get: {
      responses: {
        200: {
          content: {
            "application/json": {
              Email: string;
              FirstName: string;
              LastName: string;
              Roles: string[];
            };
          };
        };
      };
    };
  };
};

/** Create a type-safe client for the Bunny Core API (CDN, DNS, storage zones, billing). */
export function createCoreClient(apiKey: string, baseUrl: string) {
  const client = createClient<paths & CustomPaths>({ baseUrl });
  client.use(authMiddleware(apiKey));
  return client;
}
