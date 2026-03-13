import { join } from "node:path";
import type { Client } from "@libsql/client";

export interface StudioOptions {
  client: Client;
  port?: number;
  open?: boolean;
  logger?: {
    log(msg: string): void;
    error(msg: string): void;
  };
}

interface TableInfo {
  name: string;
  type: string;
}

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

/** Validate a table name to prevent SQL injection (only allow alphanumeric, underscores). */
function isValidTableName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

function createApiHandler(client: Client) {
  return async (req: Request, pathname: string): Promise<Response | null> => {
    // GET /api/tables
    if (pathname === "/api/tables") {
      const result = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream_%' AND name NOT LIKE 'libsql_%' ORDER BY name",
      );
      const tables = [];
      for (const row of result.rows) {
        const name = row.name as string;
        const countResult = await client.execute(`SELECT COUNT(*) as count FROM "${name}"`);
        tables.push({
          name,
          rowCount: Number(countResult.rows[0]?.count ?? 0),
        });
      }
      return json(tables);
    }

    // GET /api/tables/:name/schema
    const schemaMatch = pathname.match(/^\/api\/tables\/([^/]+)\/schema$/);
    if (schemaMatch) {
      const tableName = decodeURIComponent(schemaMatch[1]!);
      if (!isValidTableName(tableName)) return json({ error: "Invalid table name" }, 400);

      const result = await client.execute(`PRAGMA table_info("${tableName}")`);
      const columns = result.rows.map((row) => ({
        cid: row.cid,
        name: row.name,
        type: row.type,
        notnull: row.notnull,
        defaultValue: row.dflt_value,
        primaryKey: row.pk,
      }));

      const fkResult = await client.execute(`PRAGMA foreign_key_list("${tableName}")`);
      const foreignKeys = fkResult.rows.map((row) => ({
        from: row.from,
        table: row.table,
        to: row.to,
      }));

      const indexResult = await client.execute(`PRAGMA index_list("${tableName}")`);
      const indexes = indexResult.rows.map((row) => ({
        name: row.name,
        unique: row.unique,
      }));

      return json({ columns, foreignKeys, indexes });
    }

    // GET /api/tables/:name/rows?page=1&limit=50
    const rowsMatch = pathname.match(/^\/api\/tables\/([^/]+)\/rows$/);
    if (rowsMatch) {
      const tableName = decodeURIComponent(rowsMatch[1]!);
      if (!isValidTableName(tableName)) return json({ error: "Invalid table name" }, 400);

      const url = new URL(req.url);
      const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
      const offset = (page - 1) * limit;

      const [dataResult, countResult] = await Promise.all([
        client.execute(`SELECT * FROM "${tableName}" LIMIT ${limit} OFFSET ${offset}`),
        client.execute(`SELECT COUNT(*) as count FROM "${tableName}"`),
      ]);

      const totalRows = Number(countResult.rows[0]?.count ?? 0);
      const columns = dataResult.columns;
      const rows = dataResult.rows;

      return json({
        columns,
        rows,
        pagination: {
          page,
          limit,
          totalRows,
          totalPages: Math.ceil(totalRows / limit),
        },
      });
    }

    return null;
  };
}

export async function startStudio(options: StudioOptions): Promise<void> {
  const { client, port = 4488, open = true, logger = console } = options;

  const distDir = join(import.meta.dir, "..", "dist", "client");
  const handleApi = createApiHandler(client);

  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      // CORS preflight
      if (req.method === "OPTIONS") {
        return new Response(null, { headers: CORS_HEADERS });
      }

      // API routes
      if (pathname.startsWith("/api/")) {
        try {
          const response = await handleApi(req, pathname);
          if (response) return response;
        } catch (err: any) {
          return json({ error: err.message }, 500);
        }
      }

      // Static file serving for the built client
      try {
        let filePath = join(distDir, pathname === "/" ? "index.html" : pathname);
        let file = Bun.file(filePath);
        if (await file.exists()) {
          return new Response(file);
        }
        // SPA fallback — serve index.html for client-side routing
        file = Bun.file(join(distDir, "index.html"));
        if (await file.exists()) {
          return new Response(file);
        }
      } catch {
        // fall through
      }

      return new Response("Not Found", { status: 404 });
    },
  });
  } catch (err: any) {
    if (err?.code === "EADDRINUSE") {
      throw new Error(
        `Port ${port} is already in use. Try a different port with --port <number>.`,
      );
    }
    throw err;
  }

  const url = `http://localhost:${server.port}`;
  logger.log(`Studio running at ${url}`);

  if (open) {
    const proc = Bun.spawn(
      process.platform === "darwin" ? ["open", url] : ["xdg-open", url],
      { stdout: "ignore", stderr: "ignore" },
    );
    await proc.exited;
  }

  // Keep the process alive until interrupted
  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      server.stop();
      resolve();
    });
    process.on("SIGTERM", () => {
      server.stop();
      resolve();
    });
  });
}
