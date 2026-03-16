import type { Client } from "@libsql/client";
import type { Column, ForeignKey, Index, TableSchema, DatabaseSchema } from "./types.ts";

/**
 * Introspect a libSQL database and return structured schema information
 * for all user tables (excludes internal/system tables).
 */
export async function introspect(client: Client): Promise<DatabaseSchema> {
  const tablesResult = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream_%' ORDER BY name",
  );

  const tableNames = tablesResult.rows.map((r) => String(r[0]));
  const tables: TableSchema[] = [];

  for (const tableName of tableNames) {
    const [columns, foreignKeys, indexes] = await Promise.all([
      introspectColumns(client, tableName),
      introspectForeignKeys(client, tableName),
      introspectIndexes(client, tableName),
    ]);

    tables.push({ name: tableName, columns, foreignKeys, indexes });
  }

  return { tables };
}

async function introspectColumns(client: Client, tableName: string): Promise<Column[]> {
  const escaped = tableName.replace(/'/g, "''");
  const result = await client.execute(
    `SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info('${escaped}')`,
  );

  return result.rows.map((row) => ({
    name: String(row[0]),
    type: String(row[1] || ""),
    notnull: Boolean(row[2]),
    defaultValue: row[3] != null ? String(row[3]) : null,
    primaryKey: Boolean(row[4]),
  }));
}

async function introspectForeignKeys(client: Client, tableName: string): Promise<ForeignKey[]> {
  const escaped = tableName.replace(/'/g, "''");
  const result = await client.execute(
    `SELECT "from", "table", "to", on_update, on_delete FROM pragma_foreign_key_list('${escaped}')`,
  );

  return result.rows.map((row) => ({
    column: String(row[0]),
    referencedTable: String(row[1]),
    referencedColumn: String(row[2]),
    onUpdate: String(row[3]),
    onDelete: String(row[4]),
  }));
}

async function introspectIndexes(client: Client, tableName: string): Promise<Index[]> {
  const escaped = tableName.replace(/'/g, "''");

  // Get indexes for this table
  const indexList = await client.execute(
    `SELECT name, "unique" FROM pragma_index_list('${escaped}')`,
  );

  const indexes: Index[] = [];

  for (const row of indexList.rows) {
    const indexName = String(row[0]);
    const unique = Boolean(row[1]);

    // Skip auto-generated indexes (sqlite_autoindex_*)
    if (indexName.startsWith("sqlite_autoindex_")) continue;

    const colsResult = await client.execute(
      `SELECT name FROM pragma_index_info('${indexName.replace(/'/g, "''")}')`,
    );

    indexes.push({
      name: indexName,
      unique,
      columns: colsResult.rows.map((r) => String(r[0])),
    });
  }

  return indexes;
}
