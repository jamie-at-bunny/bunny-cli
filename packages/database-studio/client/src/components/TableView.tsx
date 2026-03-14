import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  type RowsResponse,
  type RowLookupResponse,
  type TableSchema,
  type FilterCondition,
  fetchTableRows,
  fetchTableSchema,
  fetchRowLookup,
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
import { Input } from "@/components/ui/input";
import { useUrlParam, setUrlParams } from "@/hooks/use-url-state";
import { ChevronLeft, ChevronRight, ExternalLink, Filter, Plus, Trash2 } from "lucide-react";
import { FadeScrollArea } from "@/components/FadeScrollArea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

interface TableViewProps {
  tableName: string;
  onSelectTable: (name: string) => void;
}

export function TableView({ tableName, onSelectTable }: TableViewProps) {
  const [schema, setSchema] = useState<TableSchema | null>(null);
  const [data, setData] = useState<RowsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"data" | "schema">("data");
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Number of filter rows in the UI (may include empty/pending ones)
  const [filterRowCount, setFilterRowCount] = useState(0);

  // Read state from URL
  const pageParam = useUrlParam("page");
  const limitParam = useUrlParam("limit");
  const filtersParam = useUrlParam("filters");

  const page = Math.max(1, Number(pageParam) || 1);
  const limit = Math.min(100, Math.max(1, Number(limitParam) || 50));

  const appliedFilters: FilterCondition[] = useMemo(() => {
    if (!filtersParam) return [];
    try {
      const parsed = JSON.parse(filtersParam);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [filtersParam]);

  // Sync filter row count from URL on table change
  useEffect(() => {
    setFilterRowCount(appliedFilters.length);
    if (appliedFilters.length > 0) setFiltersOpen(true);
  }, [tableName]);

  useEffect(() => {
    setTab("data");
    setLoading(true);
    Promise.all([fetchTableSchema(tableName), fetchTableRows(tableName, 1, limit)])
      .then(([s, d]) => {
        setSchema(s);
        setData(d);
      })
      .finally(() => setLoading(false));
  }, [tableName]);

  useEffect(() => {
    setLoading(true);
    fetchTableRows(tableName, page, limit, appliedFilters)
      .then(setData)
      .finally(() => setLoading(false));
  }, [page, limit, tableName, filtersParam]);

  function setPage(p: number) {
    setUrlParams({ page: p === 1 ? null : String(p) });
  }

  function setLimit(l: number) {
    setUrlParams({ limit: l === 50 ? null : String(l), page: null });
  }

  function applyFiltersFromRefs(filterRefs: Map<number, { column: string; operator: string; valueRef: HTMLInputElement | null }>) {
    const filters: FilterCondition[] = [];
    for (const [, ref] of filterRefs) {
      const value = ref.valueRef?.value ?? "";
      if (ref.column && (NULLARY_OPERATORS.has(ref.operator) || value !== "")) {
        filters.push({ column: ref.column, operator: ref.operator, value });
      }
    }
    setUrlParams({
      filters: filters.length > 0 ? JSON.stringify(filters) : null,
      page: null,
    });
  }

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b px-4">
        <div className="flex gap-1">
          <Button
            variant={tab === "data" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 text-xs"
            onClick={() => setTab("data")}
          >
            Data
          </Button>
          <Button
            variant={tab === "schema" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 text-xs"
            onClick={() => setTab("schema")}
          >
            Schema
          </Button>
          {tab === "data" && (
            <Button
              variant={filtersOpen ? "secondary" : "ghost"}
              size="sm"
              className="h-6 text-xs gap-1"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <Filter className="h-3 w-3" />
              Filter
              {appliedFilters.length > 0 && (
                <Badge variant="outline" className="ml-0.5 h-4 min-w-4 px-1 text-[10px]">
                  {appliedFilters.length}
                </Badge>
              )}
            </Button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1">
          {tab === "data" && data && (
            <>
              {data.responseTime != null && (
                <span className="mr-2 text-[10px] tabular-nums text-muted-foreground">
                  {data.responseTime}ms
                </span>
              )}

              <Badge variant="outline" className="mr-2 font-mono text-[10px] tabular-nums">
                {data.pagination.totalRows.toLocaleString()} rows
              </Badge>

              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Limit
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={limit}
                  onChange={(e) => {
                    const v = Math.min(100, Math.max(1, Number(e.target.value) || 1));
                    setLimit(v);
                  }}
                  className="h-6 w-14 px-1.5 text-center font-mono text-xs tabular-nums"
                />
              </label>

              <span className="mx-1 text-xs tabular-nums text-muted-foreground">
                {data.pagination.page} / {data.pagination.totalPages}
              </span>

              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={page <= 1 || loading}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={page >= data.pagination.totalPages || loading}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {filtersOpen && tab === "data" && schema && (
        <FilterBar
          columns={schema.columns}
          appliedFilters={appliedFilters}
          filterRowCount={filterRowCount}
          onFilterRowCountChange={setFilterRowCount}
          onApply={applyFiltersFromRefs}
        />
      )}

      {tab === "data" ? (
        <DataTab data={data} schema={schema} />
      ) : (
        <SchemaTab schema={schema} onSelectTable={onSelectTable} />
      )}
    </div>
  );
}

const OPERATORS = [
  { value: "=", label: "=" },
  { value: "!=", label: "!=" },
  { value: ">", label: ">" },
  { value: "<", label: "<" },
  { value: ">=", label: ">=" },
  { value: "<=", label: "<=" },
  { value: "LIKE", label: "LIKE" },
  { value: "NOT LIKE", label: "NOT LIKE" },
  { value: "IS NULL", label: "IS NULL" },
  { value: "IS NOT NULL", label: "IS NOT NULL" },
];

const NULLARY_OPERATORS = new Set(["IS NULL", "IS NOT NULL"]);

interface FilterBarProps {
  columns: { name: string; type: string }[];
  appliedFilters: FilterCondition[];
  filterRowCount: number;
  onFilterRowCountChange: (count: number) => void;
  onApply: (refs: Map<number, { column: string; operator: string; valueRef: HTMLInputElement | null }>) => void;
}

function FilterBar({ columns, appliedFilters, filterRowCount, onFilterRowCountChange, onApply }: FilterBarProps) {
  // Store refs for each filter row's select/input values
  const rowRefs = useRef<Map<number, { column: string; operator: string; valueRef: HTMLInputElement | null }>>(new Map());

  // Initialize refs from applied filters
  useEffect(() => {
    for (let i = 0; i < appliedFilters.length; i++) {
      if (!rowRefs.current.has(i)) {
        rowRefs.current.set(i, {
          column: appliedFilters[i].column,
          operator: appliedFilters[i].operator,
          valueRef: null,
        });
      }
    }
  }, [appliedFilters]);

  const count = Math.max(filterRowCount, 0);
  const indices = Array.from({ length: count }, (_, i) => i);

  function addRow() {
    const newIndex = count;
    rowRefs.current.set(newIndex, {
      column: columns[0]?.name ?? "",
      operator: "=",
      valueRef: null,
    });
    onFilterRowCountChange(count + 1);
  }

  function removeRow(index: number) {
    // Collect remaining filters and re-apply
    rowRefs.current.delete(index);
    // Rebuild refs with new indices
    const remaining = indices.filter((i) => i !== index);
    const newRefs = new Map<number, { column: string; operator: string; valueRef: HTMLInputElement | null }>();
    remaining.forEach((oldIdx, newIdx) => {
      const ref = rowRefs.current.get(oldIdx);
      if (ref) newRefs.set(newIdx, ref);
    });
    rowRefs.current = newRefs;
    onFilterRowCountChange(remaining.length);
    // Auto-apply
    onApply(newRefs);
  }

  function clearAll() {
    rowRefs.current.clear();
    onFilterRowCountChange(0);
    onApply(new Map());
  }

  function apply() {
    onApply(rowRefs.current);
  }

  return (
    <div className="shrink-0 border-b bg-card/50 px-4 py-2 space-y-2">
      {indices.map((i) => {
        const applied = appliedFilters[i];
        const ref = rowRefs.current.get(i);
        const defaultColumn = ref?.column ?? applied?.column ?? columns[0]?.name ?? "";
        const defaultOperator = ref?.operator ?? applied?.operator ?? "=";
        const defaultValue = applied?.value ?? "";

        // Ensure ref exists
        if (!rowRefs.current.has(i)) {
          rowRefs.current.set(i, { column: defaultColumn, operator: defaultOperator, valueRef: null });
        }

        return (
          <div key={i} className="flex items-center gap-2">
            <select
              defaultValue={defaultColumn}
              onChange={(e) => {
                const r = rowRefs.current.get(i);
                if (r) r.column = e.target.value;
              }}
              className="h-7 rounded-md border border-input bg-transparent px-2 font-mono text-xs text-foreground"
            >
              {columns.map((col) => (
                <option key={col.name} value={col.name}>
                  {col.name}
                </option>
              ))}
            </select>
            <select
              defaultValue={defaultOperator}
              onChange={(e) => {
                const r = rowRefs.current.get(i);
                if (r) r.operator = e.target.value;
              }}
              className="h-7 rounded-md border border-input bg-transparent px-2 font-mono text-xs text-foreground"
            >
              {OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
            <input
              ref={(el) => {
                const r = rowRefs.current.get(i);
                if (r) r.valueRef = el;
              }}
              defaultValue={defaultValue}
              onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
              placeholder="Value..."
              className="flex h-7 w-40 rounded-md border border-input bg-transparent px-3 py-1 font-mono text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => removeRow(i)}
            >
              <Trash2 className="h-3 w-3 text-muted-foreground" />
            </Button>
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={addRow}>
          <Plus className="h-3 w-3" />
          Add filter
        </Button>
        {count > 0 && (
          <>
            <Button variant="secondary" size="sm" className="h-6 text-xs" onClick={apply}>
              Apply
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={clearAll}>
              Clear all
            </Button>
          </>
        )}
      </div>
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

interface SheetEntry {
  tableName: string;
  row: Record<string, unknown>;
  columnTypes: Map<string, string>;
  foreignKeys: Map<string, { table: string; to: string }>;
}

function DataTab({ data, schema }: { data: RowsResponse | null; schema: TableSchema | null }) {
  const [sheetStack, setSheetStack] = useState<SheetEntry[]>([]);

  const columnTypes = useMemo(() => {
    if (!schema) return new Map<string, string>();
    return new Map(schema.columns.map((c) => [c.name, c.type || "ANY"]));
  }, [schema]);

  const primaryKeys = useMemo(() => {
    if (!schema) return new Set<string>();
    return new Set(schema.columns.filter((c) => c.primaryKey).map((c) => c.name));
  }, [schema]);

  const foreignKeys = useMemo(() => {
    if (!schema) return new Map<string, { table: string; to: string }>();
    return new Map(schema.foreignKeys.map((fk) => [fk.from, { table: fk.table, to: fk.to }]));
  }, [schema]);

  function openRow(row: RowRecord, tableName: string, types: Map<string, string>, fks: Map<string, { table: string; to: string }>) {
    setSheetStack((prev) => [...prev, { tableName, row, columnTypes: types, foreignKeys: fks }]);
  }

  function closeSheet(index: number) {
    setSheetStack((prev) => prev.slice(0, index));
  }

  const followFkRef = useRef<(fk: { table: string; to: string }, value: unknown) => void>();
  followFkRef.current = async (fk, value) => {
    if (value === null || value === undefined) return;
    try {
      const result = await fetchRowLookup(fk.table, fk.to, String(value));
      const types = new Map(result.schema.map((c) => [c.name, c.type || "ANY"]));
      const fks = new Map(result.foreignKeys.map((f) => [f.from, { table: f.table, to: f.to }]));
      openRow(result.row as RowRecord, fk.table, types, fks);
    } catch {
      // Row not found or error — ignore
    }
  };

  const followFk = useCallback((fk: { table: string; to: string }, value: unknown) => {
    followFkRef.current?.(fk, value);
  }, []);

  const columns = useMemo<ColumnDef<RowRecord>[]>(() => {
    if (!data) return [];
    return data.columns.map((col) => {
      const fk = foreignKeys.get(col);
      const colType = columnTypes.get(col) ?? "ANY";
      const isPk = primaryKeys.has(col);
      return {
        accessorKey: col,
        header: () => (
          <div className="flex items-center gap-1.5">
            <span>{col}</span>
            {isPk && <Badge variant="outline" className="font-mono text-[10px] font-normal">PK</Badge>}
            <Badge variant="secondary" className="font-mono text-[10px] font-normal">{colType}</Badge>
          </div>
        ),
        cell: ({ getValue }) => {
          const value = getValue();
          if (fk && value !== null && value !== undefined) {
            return (
              <button
                onClick={() => followFk(fk, value)}
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                <CellValue value={value} />
              </button>
            );
          }
          return <CellValue value={value} />;
        },
      };
    });
  }, [data?.columns, foreignKeys, columnTypes, primaryKeys, followFk]);

  if (!data) return null;

  return (
    <>
      <div className="flex-1 overflow-auto">
        <DataTable
          columns={columns}
          data={data.rows as RowRecord[]}
          onInspectRow={(row) => openRow(row, "", columnTypes, foreignKeys)}
        />
      </div>
      {sheetStack.map((entry, i) => (
        <Sheet
          key={i}
          open
          modal={false}
          onOpenChange={(open) => { if (!open) closeSheet(i); }}
        >
          <SheetContent
            hideOverlay={i > 0}
            className="flex flex-col overflow-hidden p-0 sm:max-w-md transition-transform"
            style={{
              zIndex: 50 + i,
              transform: `translateX(-${(sheetStack.length - 1 - i) * 24}px)`,
            }}
            onInteractOutside={(e) => {
              if (i === sheetStack.length - 1) {
                closeSheet(i);
              } else {
                e.preventDefault();
              }
            }}
          >
            <SheetHeader className="shrink-0 px-6 pt-6">
              <SheetTitle className="font-mono text-sm">
                {entry.tableName ? `${entry.tableName}` : "Row Detail"}
              </SheetTitle>
              <SheetDescription className="sr-only">Field values for the selected row</SheetDescription>
            </SheetHeader>
            <FadeScrollArea className="flex-1">
              <div className="space-y-3 px-6 pb-6 pt-4">
                {Object.entries(entry.row).map(([key, value]) => {
                  const fk = entry.foreignKeys.get(key);
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-medium">{key}</span>
                        {fk && (
                          <Badge variant="outline" className="font-mono text-[10px]">
                            FK → {fk.table}.{fk.to}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="ml-auto font-mono text-[10px]">
                          {entry.columnTypes.get(key) ?? "ANY"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1 rounded-md border bg-muted/50 px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap">
                          <CellValue value={value} />
                        </div>
                        {fk && value !== null && value !== undefined && (
                          <button
                            onClick={() => followFk(fk, value)}
                            className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            title={`View ${fk.table} record`}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </FadeScrollArea>
          </SheetContent>
        </Sheet>
      ))}
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
                      className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
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
