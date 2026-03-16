import type { DatabaseSchema, TableSchema, Column, GenerateOptions } from "./types.ts";

/**
 * Generate an OpenAPI 3.1.0 spec from introspected database schema.
 */
export function generateSpec(schema: DatabaseSchema, options: GenerateOptions = {}): object {
  const {
    title = "Database API",
    version = "1.0.0",
    serverUrl = "/",
  } = options;

  const paths: Record<string, object> = {};
  const schemas: Record<string, object> = {};

  for (const table of schema.tables) {
    const pk = getPrimaryKeyColumns(table);
    const schemaName = pascalCase(table.name);

    // Component schemas
    schemas[schemaName] = buildComponentSchema(table);
    schemas[`${schemaName}Input`] = buildInputSchema(table);

    // List + Create: GET/POST /table
    paths[`/${table.name}`] = {
      get: listOperation(table, schemaName),
      post: createOperation(table, schemaName),
    };

    // Get, Update, Delete: GET/PUT/PATCH/DELETE /table/:pk
    if (pk.length > 0) {
      const pkPath = pk.map((col) => `{${col.name}}`).join("/");
      const pathParams = pk.map((col) => ({
        name: col.name,
        in: "path",
        required: true,
        schema: sqliteTypeToJsonSchema(col.type),
      }));

      paths[`/${table.name}/${pkPath}`] = {
        get: getOperation(table, schemaName, pathParams),
        put: updateOperation(table, schemaName, pathParams),
        patch: patchOperation(table, schemaName, pathParams),
        delete: deleteOperation(table, schemaName, pathParams),
      };
    }

    // Relationship endpoints from foreign keys
    for (const fk of table.foreignKeys) {
      const parentTable = schema.tables.find((t) => t.name === fk.referencedTable);
      if (!parentTable) continue;

      const parentPk = getPrimaryKeyColumns(parentTable);
      if (parentPk.length === 0) continue;

      const parentPkPath = parentPk.map((col) => `{${col.name}}`).join("/");
      const nestedPath = `/${fk.referencedTable}/${parentPkPath}/${table.name}`;

      // Only add if not already defined
      if (!paths[nestedPath]) {
        const parentParams = parentPk.map((col) => ({
          name: col.name,
          in: "path",
          required: true,
          schema: sqliteTypeToJsonSchema(col.type),
        }));

        paths[nestedPath] = {
          get: nestedListOperation(table, schemaName, fk.referencedTable, fk.column, parentParams),
        };
      }
    }
  }

  return {
    openapi: "3.1.0",
    info: { title, version },
    servers: [{ url: serverUrl }],
    paths,
    components: { schemas },
  };
}

function listOperation(table: TableSchema, schemaName: string): object {
  return {
    operationId: `list_${table.name}`,
    summary: `List ${table.name}`,
    tags: [table.name],
    parameters: [
      { name: "limit", in: "query", schema: { type: "integer", default: 25, minimum: 1, maximum: 1000 } },
      { name: "offset", in: "query", schema: { type: "integer", default: 0, minimum: 0 } },
      { name: "order_by", in: "query", schema: { type: "string", enum: table.columns.map((c) => c.name) } },
      { name: "order", in: "query", schema: { type: "string", enum: ["asc", "desc"], default: "asc" } },
      { name: "select", in: "query", schema: { type: "string" }, description: "Comma-separated column names" },
      ...filterParameters(table),
    ],
    responses: {
      "200": {
        description: `List of ${table.name}`,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: { type: "array", items: { $ref: `#/components/schemas/${schemaName}` } },
                count: { type: "integer" },
              },
              required: ["data", "count"],
            },
          },
        },
      },
    },
  };
}

function createOperation(table: TableSchema, schemaName: string): object {
  return {
    operationId: `create_${singularize(table.name)}`,
    summary: `Create ${singularize(table.name)}`,
    tags: [table.name],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: `#/components/schemas/${schemaName}Input` },
        },
      },
    },
    responses: {
      "201": {
        description: `Created ${singularize(table.name)}`,
        content: {
          "application/json": {
            schema: { $ref: `#/components/schemas/${schemaName}` },
          },
        },
      },
      "400": { description: "Validation error" },
    },
  };
}

function getOperation(_table: TableSchema, schemaName: string, pathParams: object[]): object {
  return {
    operationId: `get_${singularize(_table.name)}`,
    summary: `Get ${singularize(_table.name)}`,
    tags: [_table.name],
    parameters: pathParams,
    responses: {
      "200": {
        description: `A single ${singularize(_table.name)}`,
        content: {
          "application/json": {
            schema: { $ref: `#/components/schemas/${schemaName}` },
          },
        },
      },
      "404": { description: "Not found" },
    },
  };
}

function updateOperation(table: TableSchema, schemaName: string, pathParams: object[]): object {
  return {
    operationId: `update_${singularize(table.name)}`,
    summary: `Update ${singularize(table.name)}`,
    tags: [table.name],
    parameters: pathParams,
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: `#/components/schemas/${schemaName}Input` },
        },
      },
    },
    responses: {
      "200": {
        description: `Updated ${singularize(table.name)}`,
        content: {
          "application/json": {
            schema: { $ref: `#/components/schemas/${schemaName}` },
          },
        },
      },
      "404": { description: "Not found" },
    },
  };
}

function patchOperation(table: TableSchema, schemaName: string, pathParams: object[]): object {
  return {
    operationId: `patch_${singularize(table.name)}`,
    summary: `Partially update ${singularize(table.name)}`,
    tags: [table.name],
    parameters: pathParams,
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            allOf: [{ $ref: `#/components/schemas/${schemaName}Input` }],
            // PATCH: no required fields
          },
        },
      },
    },
    responses: {
      "200": {
        description: `Updated ${singularize(table.name)}`,
        content: {
          "application/json": {
            schema: { $ref: `#/components/schemas/${schemaName}` },
          },
        },
      },
      "404": { description: "Not found" },
    },
  };
}

function deleteOperation(table: TableSchema, _schemaName: string, pathParams: object[]): object {
  return {
    operationId: `delete_${singularize(table.name)}`,
    summary: `Delete ${singularize(table.name)}`,
    tags: [table.name],
    parameters: pathParams,
    responses: {
      "204": { description: "Deleted" },
      "404": { description: "Not found" },
    },
  };
}

function nestedListOperation(
  table: TableSchema,
  schemaName: string,
  parentTable: string,
  fkColumn: string,
  parentParams: object[],
): object {
  return {
    operationId: `list_${parentTable}_${table.name}`,
    summary: `List ${table.name} for ${singularize(parentTable)}`,
    tags: [table.name],
    parameters: [
      ...parentParams,
      { name: "limit", in: "query", schema: { type: "integer", default: 25, minimum: 1, maximum: 1000 } },
      { name: "offset", in: "query", schema: { type: "integer", default: 0, minimum: 0 } },
    ],
    responses: {
      "200": {
        description: `${table.name} belonging to ${singularize(parentTable)}`,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: { type: "array", items: { $ref: `#/components/schemas/${schemaName}` } },
                count: { type: "integer" },
              },
              required: ["data", "count"],
            },
          },
        },
      },
      "404": { description: `${parentTable} not found` },
    },
  };
}

function filterParameters(table: TableSchema): object[] {
  return table.columns.map((col) => ({
    name: col.name,
    in: "query",
    required: false,
    schema: sqliteTypeToJsonSchema(col.type),
    description: `Filter by exact ${col.name} value`,
  }));
}

function buildComponentSchema(table: TableSchema): object {
  const properties: Record<string, object> = {};
  const required: string[] = [];

  for (const col of table.columns) {
    properties[col.name] = sqliteTypeToJsonSchema(col.type);
    if (col.notnull && col.defaultValue === null) {
      required.push(col.name);
    }
  }

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

function buildInputSchema(table: TableSchema): object {
  const properties: Record<string, object> = {};
  const required: string[] = [];

  for (const col of table.columns) {
    // Skip autoincrement primary keys from input
    if (col.primaryKey && isAutoIncrement(col)) continue;

    properties[col.name] = sqliteTypeToJsonSchema(col.type);

    // Required if NOT NULL and no default and not a PK with auto-increment
    if (col.notnull && col.defaultValue === null && !col.primaryKey) {
      required.push(col.name);
    }
  }

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

function isAutoIncrement(col: Column): boolean {
  const type = col.type.toUpperCase();
  return col.primaryKey && (type === "INTEGER" || type === "INT");
}

/**
 * Map SQLite type affinity to JSON Schema type.
 * See https://www.sqlite.org/datatype3.html for affinity rules.
 */
export function sqliteTypeToJsonSchema(sqliteType: string): object {
  const upper = sqliteType.toUpperCase().trim();

  // INTEGER affinity
  if (
    upper.includes("INT") ||
    upper === "INTEGER" ||
    upper === "BIGINT" ||
    upper === "SMALLINT" ||
    upper === "TINYINT" ||
    upper === "MEDIUMINT"
  ) {
    // Boolean convention
    if (upper === "BOOLEAN" || upper === "TINYINT") {
      return { type: "boolean" };
    }
    return { type: "integer" };
  }

  // REAL affinity
  if (
    upper.includes("REAL") ||
    upper.includes("FLOAT") ||
    upper.includes("DOUBLE") ||
    upper === "NUMERIC" ||
    upper === "DECIMAL"
  ) {
    return { type: "number" };
  }

  // BLOB
  if (upper === "BLOB" || upper === "") {
    return { type: "string", format: "byte" };
  }

  // TEXT affinity — check for common semantic types
  if (upper.includes("DATE") || upper.includes("TIMESTAMP")) {
    return { type: "string", format: "date-time" };
  }

  if (upper === "DATE") {
    return { type: "string", format: "date" };
  }

  // Default: TEXT affinity
  return { type: "string" };
}

function getPrimaryKeyColumns(table: TableSchema): Column[] {
  return table.columns.filter((c) => c.primaryKey);
}

function pascalCase(str: string): string {
  return str
    .split(/[_\-\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

/** Naive singularize — strips trailing 's'. Good enough for table names. */
function singularize(str: string): string {
  if (str.endsWith("ies")) return str.slice(0, -3) + "y";
  if (str.endsWith("ses") || str.endsWith("xes") || str.endsWith("zes")) return str.slice(0, -2);
  if (str.endsWith("s") && !str.endsWith("ss")) return str.slice(0, -1);
  return str;
}
