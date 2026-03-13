import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { TableSummary } from "@/api.ts";

interface SidebarProps {
  tables: TableSummary[];
  selected: string | null;
  onSelect: (name: string) => void;
}

export function Sidebar({ tables, selected, onSelect }: SidebarProps) {
  return (
    <aside className="flex h-full w-60 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="border-b px-4 py-3">
        <h1 className="text-sm font-semibold tracking-wide">
          Database Studio
        </h1>
      </div>
      <div className="px-3 pt-3 pb-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Tables ({tables.length})
        </span>
      </div>
      <nav className="flex-1 overflow-y-auto px-2">
        {tables.map((table) => (
          <button
            key={table.name}
            onClick={() => onSelect(table.name)}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors",
              selected === table.name
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <span className="truncate font-mono text-xs">{table.name}</span>
            <Badge variant="secondary" className="ml-2 shrink-0 font-mono text-[10px] tabular-nums">
              {table.rowCount.toLocaleString()}
            </Badge>
          </button>
        ))}
      </nav>
    </aside>
  );
}
