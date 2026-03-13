import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar.tsx";
import { TableView } from "@/components/TableView.tsx";
import { type TableSummary, fetchTables } from "@/api.ts";

export function App() {
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTables()
      .then((t) => {
        setTables(t);
        if (t.length > 0 && !selectedTable) setSelectedTable(t[0]!.name);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Connecting to database...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-destructive">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar
        tables={tables}
        selected={selectedTable}
        onSelect={setSelectedTable}
      />
      <main className="flex-1 overflow-hidden">
        {selectedTable ? (
          <TableView tableName={selectedTable} onSelectTable={setSelectedTable} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground">Select a table</p>
          </div>
        )}
      </main>
    </div>
  );
}
