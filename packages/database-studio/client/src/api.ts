export interface TableSummary {
  name: string;
  rowCount: number;
}

export interface ColumnSchema {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  defaultValue: string | null;
  primaryKey: number;
}

export interface TableSchema {
  columns: ColumnSchema[];
  foreignKeys: { from: string; table: string; to: string }[];
  indexes: { name: string; unique: number }[];
}

export interface RowsResponse {
  columns: string[];
  rows: Record<string, unknown>[];
  pagination: {
    page: number;
    limit: number;
    totalRows: number;
    totalPages: number;
  };
}

const BASE = "";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function fetchTables(): Promise<TableSummary[]> {
  return fetchJson("/api/tables");
}

export function fetchTableSchema(name: string): Promise<TableSchema> {
  return fetchJson(`/api/tables/${encodeURIComponent(name)}/schema`);
}

export function fetchTableRows(
  name: string,
  page = 1,
  limit = 50,
): Promise<RowsResponse> {
  return fetchJson(
    `/api/tables/${encodeURIComponent(name)}/rows?page=${page}&limit=${limit}`,
  );
}
