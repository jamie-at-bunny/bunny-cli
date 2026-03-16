import type { Client } from "@libsql/client";
import { introspect } from "./introspect.ts";
import { generateSpec } from "./openapi.ts";
import type { GenerateOptions, DatabaseSchema } from "./types.ts";

export type { DatabaseSchema, TableSchema, Column, ForeignKey, Index, GenerateOptions } from "./types.ts";
export { introspect } from "./introspect.ts";
export { generateSpec, sqliteTypeToJsonSchema } from "./openapi.ts";

/**
 * Introspect a libSQL database and generate an OpenAPI 3.1.0 spec
 * with CRUD endpoints for every table.
 */
export async function generateOpenAPI(
  client: Client,
  options?: GenerateOptions,
): Promise<object> {
  const schema = await introspect(client);
  return generateSpec(schema, options);
}
