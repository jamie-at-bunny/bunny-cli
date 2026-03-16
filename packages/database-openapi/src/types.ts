export interface Column {
  name: string;
  type: string;
  notnull: boolean;
  defaultValue: string | null;
  primaryKey: boolean;
}

export interface ForeignKey {
  column: string;
  referencedTable: string;
  referencedColumn: string;
  onUpdate: string;
  onDelete: string;
}

export interface Index {
  name: string;
  unique: boolean;
  columns: string[];
}

export interface TableSchema {
  name: string;
  columns: Column[];
  foreignKeys: ForeignKey[];
  indexes: Index[];
}

export interface DatabaseSchema {
  tables: TableSchema[];
}

export interface GenerateOptions {
  /** API title in the OpenAPI info block. Defaults to "Database API". */
  title?: string;
  /** API version in the OpenAPI info block. Defaults to "1.0.0". */
  version?: string;
  /** Base server URL. Defaults to "/". */
  serverUrl?: string;
}
