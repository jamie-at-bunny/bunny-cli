import type { Middleware } from "openapi-fetch";
import { VERSION } from "../core/version.ts";
import { ApiError } from "../core/errors.ts";
import { logger } from "../core/logger.ts";

const STATUS_MESSAGES: Record<number, string> = {
  401: "Unauthorized. Check your API key.",
  403: "Forbidden. You don't have permission for this action.",
  404: "Not found.",
  409: "Conflict. The resource already exists or is in use.",
  500: "Internal server error.",
};

/**
 * Extract a normalized error from a parsed response body.
 * Each entry handles one API error format — first match wins.
 */
const extractors: Array<(body: any) => { message: string; field?: string; validationErrors?: any[] } | null> = [
  // RFC 7807 ErrorDetails (Magic Containers)
  (b) => b?.detail || b?.title
    ? { message: b.detail || b.title, validationErrors: b.errors }
    : null,

  // ApiErrorData (Core / Compute)
  (b) => b?.Message
    ? { message: b.Message, field: b.Field ?? undefined }
    : null,
];

/**
 * Shared openapi-fetch middleware for all Bunny API clients.
 *
 * **Request**: Injects `AccessKey` and `User-Agent` headers.
 *
 * **Response**: Intercepts non-OK responses and throws {@link ApiError},
 * normalizing the two different error formats used across Bunny APIs:
 *
 * - **Core / Compute** use `ApiErrorData` (`{ ErrorKey, Field, Message }`).
 *   Only 400 responses have a JSON body; 401/404/500 are empty.
 * - **Magic Containers** use RFC 7807 (`{ title, status, detail, errors[] }`).
 *   All error status codes have a JSON body.
 *
 * Command handlers never need to check `response.ok` or parse error bodies —
 * a failed request throws before it reaches handler code.
 */
export function authMiddleware(apiKey: string, verbose = false): Middleware {
  return {
    async onRequest({ request }) {
      request.headers.set("AccessKey", apiKey);
      request.headers.set("User-Agent", `bunny-cli/${VERSION}`);

      if (verbose) {
        logger.debug(`→ ${request.method} ${request.url}`, true);
        if (request.body) {
          const cloned = request.clone();
          try {
            const body = await cloned.json();
            logger.debug(`→ Body: ${JSON.stringify(body, null, 2)}`, true);
          } catch {}
        }
      }

      return request;
    },
    async onResponse({ response }) {
      if (verbose) {
        const cloned = response.clone();
        logger.debug(`← ${response.status} ${response.statusText}`, true);
        try {
          const body = await cloned.json();
          logger.debug(`← Body: ${JSON.stringify(body, null, 2)}`, true);
        } catch {}
      }

      if (response.ok) return;

      let body: any = null;
      try {
        body = await response.clone().json();
      } catch {
        // No JSON body (Core/Compute return empty bodies for 401/404/500)
      }

      const extracted = body && extractors.reduce<ReturnType<(typeof extractors)[0]>>(
        (found, fn) => found ?? fn(body),
        null,
      );

      throw new ApiError(
        extracted?.message ?? STATUS_MESSAGES[response.status] ?? `API request failed (${response.status}).`,
        response.status,
        extracted?.field,
        extracted?.validationErrors,
      );
    },
  };
}
