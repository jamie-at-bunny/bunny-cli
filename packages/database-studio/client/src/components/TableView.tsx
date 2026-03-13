import { useEffect, useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  type RowsResponse,
  type TableSchema,
  fetchTableRows,
  fetchTableSchema,
} from "@/api.ts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TableViewProps {
  tableName: string;
  onSelectTable: (name: string) => void;
}

export function TableView({ tableName, onSelectTable }: TableViewProps) {
  const [schema, setSchema] = useState<TableSchema | null>(null);
  const [data, setData] = useState<RowsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"data" | "schema">("data");

  useEffect(() => {
    setPage(1);
    setTab("data");
    setLoading(true);
    Promise.all([fetchTableSchema(tableName), fetchTableRows(tableName, 1)])
      .then(([s, d]) => {
        setSchema(s);
        setData(d);
      })
      .finally(() => setLoading(false));
  }, [tableName]);

  useEffect(() => {
    if (page === 1) return;
    setLoading(true);
    fetchTableRows(tableName, page)
      .then(setData)
      .finally(() => setLoading(false));
  }, [page, tableName]);

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b px-6 py-3">
        <h2 className="font-mono text-sm font-semibold">{tableName}</h2>
        {data && (
          <Badge variant="outline" className="font-mono text-[10px] tabular-nums">
            {data.pagination.totalRows.toLocaleString()} rows
          </Badge>
        )}
        <div className="ml-auto flex gap-1">
          <Button
            variant={tab === "data" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setTab("data")}
          >
            Data
          </Button>
          <Button
            variant={tab === "schema" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setTab("schema")}
          >
            Schema
          </Button>
        </div>
      </div>

      {tab === "data" ? (
        <DataTab data={data} page={page} setPage={setPage} loading={loading} />
      ) : (
        <SchemaTab schema={schema} onSelectTable={onSelectTable} />
      )}
    </div>
  );
}

type RowRecord = Record<string, unknown>;

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="italic text-muted-foreground">NULL</span>;
  }
  if (typeof value === "boolean") {
    return (
      <Badge variant="outline" className="text-[10px]">
        {String(value)}
      </Badge>
    );
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return <span className="tabular-nums">{String(value)}</span>;
  }
  const str = String(value);
  if (str.length > 200) {
    return <span title={str}>{str.slice(0, 200)}...</span>;
  }
  return <>{str}</>;
}

function DataTab({
  data,
  page,
  setPage,
  loading,
}: {
  data: RowsResponse | null;
  page: number;
  setPage: (p: number) => void;
  loading: boolean;
}) {
  const columns = useMemo<ColumnDef<RowRecord>[]>(() => {
    if (!data) return [];
    return data.columns.map((col) => ({
      accessorKey: col,
      header: col,
      cell: ({ getValue }) => <CellValue value={getValue()} />,
    }));
  }, [data?.columns]);

  if (!data) return null;
  const { rows, pagination } = data;

  return (
    <>
      <div className="flex-1 overflow-auto">
        <DataTable columns={columns} data={rows as RowRecord[]} />
      </div>
      <div className="flex items-center justify-between border-t px-6 py-2">
        <span className="text-xs text-muted-foreground">
          Page {pagination.page} of {pagination.totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pagination.totalPages || loading}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </>
  );
}

function SchemaTab({ schema, onSelectTable }: { schema: TableSchema | null; onSelectTable: (name: string) => void }) {
  if (!schema) return null;

  return (
    <div className="flex-1 overflow-auto p-6">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Columns
      </h3>
      <Table className="mb-6">
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Name</TableHead>
            <TableHead className="text-xs">Type</TableHead>
            <TableHead className="text-xs">Nullable</TableHead>
            <TableHead className="text-xs">Default</TableHead>
            <TableHead className="text-xs">PK</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {schema.columns.map((col) => (
            <TableRow key={col.name}>
              <TableCell className="font-mono text-xs">{col.name}</TableCell>
              <TableCell>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {col.type || "ANY"}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {col.notnull ? "NOT NULL" : "NULL"}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {col.defaultValue ?? "-"}
              </TableCell>
              <TableCell className="text-xs">
                {col.primaryKey ? (
                  <Badge variant="outline" className="text-[10px]">PK</Badge>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {schema.foreignKeys.length > 0 && (
        <>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Foreign Keys
          </h3>
          <Table className="mb-6">
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Column</TableHead>
                <TableHead className="text-xs">References</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schema.foreignKeys.map((fk, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{fk.from as string}</TableCell>
                  <TableCell className="font-mono text-xs">
                    <button
                      onClick={() => onSelectTable(fk.table as string)}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {fk.table as string}
                    </button>
                    .{fk.to as string}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {schema.indexes.length > 0 && (
        <>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Indexes
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Unique</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schema.indexes.map((idx) => (
                <TableRow key={idx.name as string}>
                  <TableCell className="font-mono text-xs">{idx.name as string}</TableCell>
                  <TableCell className="text-xs">
                    {idx.unique ? (
                      <Badge variant="outline" className="text-[10px]">UNIQUE</Badge>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
