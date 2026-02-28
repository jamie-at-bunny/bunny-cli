import * as readline from "node:readline";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import chalk from "chalk";
import Table from "cli-table3";
import { createClient, type Client, type ResultSet } from "@libsql/client";
import { defineCommand } from "../../core/define-command.ts";
import { resolveConfig } from "../../config/index.ts";
import { createDbClient } from "../../api/db-client.ts";
import { resolveDbId } from "./resolve-db.ts";
import { spinner } from "../../core/ui.ts";
import { logger } from "../../core/logger.ts";
import { UserError } from "../../core/errors.ts";
import { readEnvValue } from "../../utils/env-file.ts";
import { csvEscape } from "../../core/format.ts";
import { ARG_DATABASE_ID, ENV_DATABASE_URL, ENV_DATABASE_AUTH_TOKEN } from "./constants.ts";

const COMMAND = `shell [${ARG_DATABASE_ID}] [query]`;
const DESCRIPTION = "Open an interactive SQL shell for a database.";

const ARG_EXEC = "execute";
const ARG_EXEC_ALIAS = "e";
const ARG_MODE = "mode";
const ARG_MODE_ALIAS = "m";
const ARG_UNMASK = "unmask";
const ARG_URL = "url";
const ARG_TOKEN = "token";

const HISTORY_MAX = 1000;

/** @internal */
export function getHistoryPath(): string {
  const configDir = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(configDir, "bunny", "shell_history");
}

/** @internal */
export function loadHistory(): string[] {
  const path = getHistoryPath();
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((line) => line.length > 0);
}

/** @internal */
export function saveHistory(lines: string[]): void {
  const path = getHistoryPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, lines.slice(-HISTORY_MAX).join("\n") + "\n", "utf-8");
}

const PROMPT = chalk.blue.bold("→  ");
const PROMPT_CONTINUE = chalk.blue.bold("... ");

/** @internal */
export type PrintMode = "default" | "table" | "json" | "csv" | "markdown";
const PRINT_MODES: PrintMode[] = ["default", "table", "json", "csv", "markdown"];

const SENSITIVE_SUBSTRINGS = [
  "password", "passwd", "secret", "_hash", "_token",
  "auth_token", "api_key", "apikey", "access_key",
  "private_key", "credit_card", "creditcard", "ssn",
];
const SENSITIVE_PREFIXES = ["encrypted_", "hashed_"];
const EMAIL_SUBSTRINGS = ["email", "e_mail"];
const MASK_STYLED = chalk.dim("••••••••");
const MASK_RAW = "********";

type MaskType = "none" | "full" | "email";

/** @internal */
export function isSensitiveColumn(name: string): boolean {
  return columnMaskType(name) !== "none";
}

/** @internal */
export function columnMaskType(name: string): MaskType {
  const lower = name.toLowerCase();
  if (SENSITIVE_PREFIXES.some((p) => lower.startsWith(p))) return "full";
  if (SENSITIVE_SUBSTRINGS.some((s) => lower.includes(s))) return "full";
  if (EMAIL_SUBSTRINGS.some((s) => lower.includes(s))) return "email";
  return "none";
}

/** @internal */
export function maskEmail(value: string): string {
  const at = value.indexOf("@");
  if (at < 1) return MASK_RAW;
  const local = value.slice(0, at);
  const domain = value.slice(at);
  if (local.length === 1) return local[0] + "••••" + domain;
  return local[0] + "••••" + local[local.length - 1] + domain;
}

/** @internal */
export function formatValue(val: unknown): string {
  if (val === null) return chalk.dim("NULL");
  return String(val);
}

/** @internal */
export function formatValueRaw(val: unknown): string {
  if (val === null) return "NULL";
  return String(val);
}

/** @internal */
export function printResultSet(result: ResultSet, mode: PrintMode, masked = true) {
  const masks = result.columns.map((c) => masked ? columnMaskType(c) : "none" as MaskType);

  function applyMaskRaw(val: unknown, mask: MaskType): string {
    if (val === null) return formatValueRaw(val);
    if (mask === "full") return MASK_RAW;
    if (mask === "email") return maskEmail(String(val));
    return formatValueRaw(val);
  }

  function applyMask(val: unknown, mask: MaskType): string {
    if (val === null) return formatValue(val);
    if (mask === "full") return MASK_STYLED;
    if (mask === "email") return chalk.dim(maskEmail(String(val)));
    return formatValue(val);
  }

  if (mode === "json") {
    const rows = result.rows.map((row) => {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < result.columns.length; i++) {
        const val = row[i];
        if (val === null || masks[i] === "none") {
          obj[result.columns[i]!] = val;
        } else {
          obj[result.columns[i]!] = applyMaskRaw(val, masks[i]!);
        }
      }
      return obj;
    });
    logger.log(JSON.stringify(rows, null, 2));
    return;
  }

  if (result.columns.length === 0) {
    if (result.rowsAffected > 0) {
      logger.log(`Rows affected: ${result.rowsAffected}`);
    }
    return;
  }

  if (mode === "csv") {
    logger.log(result.columns.map(csvEscape).join(","));
    for (const row of result.rows) {
      logger.log(
        result.columns
          .map((_, i) => {
            if (masks[i] !== "none" && row[i] !== null) return csvEscape(applyMaskRaw(row[i], masks[i]!));
            return csvEscape(formatValueRaw(row[i]));
          })
          .join(","),
      );
    }
    return;
  }

  if (mode === "markdown") {
    const mdEscape = (v: string) => v.replace(/\|/g, "\\|");
    logger.log(`| ${result.columns.map(mdEscape).join(" | ")} |`);
    logger.log(`| ${result.columns.map(() => "---").join(" | ")} |`);
    for (const row of result.rows) {
      const cells = result.columns.map((_, i) => {
        if (masks[i] !== "none" && row[i] !== null) return mdEscape(applyMaskRaw(row[i], masks[i]!));
        return mdEscape(formatValueRaw(row[i]));
      });
      logger.log(`| ${cells.join(" | ")} |`);
    }
    return;
  }

  if (mode === "table") {
    const noColorStyle = chalk.level === 0 ? { head: [], border: [] } : {};
    const table = new Table({ head: result.columns, style: noColorStyle });
    for (const row of result.rows) {
      table.push(result.columns.map((_, i) => applyMask(row[i], masks[i]!)));
    }
    logger.log(table.toString());
    return;
  }

  // default: borderless aligned columns
  const table = new Table({
    head: result.columns.map((c) => chalk.bold(c)),
    chars: {
      top: "",
      "top-mid": "",
      "top-left": "",
      "top-right": "",
      bottom: "",
      "bottom-mid": "",
      "bottom-left": "",
      "bottom-right": "",
      left: "",
      "left-mid": "",
      mid: "",
      "mid-mid": "",
      right: "",
      "right-mid": "",
      middle: "  ",
    },
    style: { head: [], border: [], "padding-left": 0, "padding-right": 0 },
  });
  for (const row of result.rows) {
    table.push(result.columns.map((_, i) => applyMask(row[i], masks[i]!)));
  }
  logger.log(table.toString());
}

/** Prompt the user with a yes/no question via the REPL interface. */
function askConfirm(
  rl: readline.Interface,
  message: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

/**
 * Warn about read quota impact and ask for confirmation.
 * Used by dot-commands that perform full table scans (`.count`, `.dump`, `.size`).
 */
async function confirmReadQuota(
  rl: readline.Interface,
  message: string,
): Promise<boolean> {
  logger.warn(message);
  return askConfirm(rl, "Continue?");
}

/** @internal */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inString = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!;

    // Handle -- line comments (only outside strings)
    if (!inString && ch === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      if (nl === -1) break;
      i = nl;
      current += "\n";
      continue;
    }

    if (ch === "'") {
      if (inString) {
        // '' is an escaped quote inside a string, not end of string
        if (sql[i + 1] === "'") {
          current += "''";
          i++;
          continue;
        }
        inString = false;
      } else {
        inString = true;
      }
      current += ch;
      continue;
    }

    if (ch === ";" && !inString) {
      const trimmed = current.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = "";
      continue;
    }

    current += ch;
  }

  const trimmed = current.trim();
  if (trimmed.length > 0) statements.push(trimmed);

  return statements;
}

/**
 * Read a `.sql` file, split it into individual statements, and execute them
 * sequentially. Stops on the first error and reports which statement failed.
 */
async function executeFile(
  filePath: string,
  client: Client,
  mode: PrintMode,
  masked: boolean,
  timing: boolean,
): Promise<void> {
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    throw new UserError(`File not found: ${filePath}`);
  }
  const content = readFileSync(absPath, "utf-8");
  const statements = splitStatements(content);
  if (statements.length === 0) {
    logger.warn("No SQL statements found in file.");
    return;
  }
  logger.dim(`  Executing ${statements.length} statement${statements.length === 1 ? "" : "s"} from ${filePath}`);
  for (const stmt of statements) {
    try {
      const t0 = performance.now();
      const result = await client.execute(stmt);
      const elapsed = performance.now() - t0;
      printResultSet(result, mode, masked);
      if (timing) {
        logger.log(chalk.dim(`  ${elapsed.toFixed(1)}ms`));
      }
    } catch (err: any) {
      logger.error(`${err.message}`);
      logger.dim(`  Statement: ${stmt.length > 80 ? stmt.slice(0, 80) + "..." : stmt}`);
      return;
    }
  }
  logger.success(`${statements.length} statement${statements.length === 1 ? "" : "s"} executed.`);
}

/**
 * Dispatch a dot-command (e.g. `.tables`, `.schema`, `.quit`) and return
 * whether it was handled, unrecognised, or requested an exit.
 */
async function executeDotCommand(
  command: string,
  client: Client,
  state: { mode: PrintMode; masked: boolean; timing: boolean },
  rl: readline.Interface,
): Promise<"quit" | "handled" | "unknown"> {
  const parts = command.trim().split(/\s+/);
  const cmd = parts[0]!.toLowerCase();

  switch (cmd) {
    case ".quit":
    case ".exit":
      return "quit";

    case ".tables": {
      const result = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      );
      printResultSet(result, state.mode, state.masked);
      return "handled";
    }

    case ".schema": {
      const tableName = parts[1];
      const sql = tableName
        ? `SELECT sql FROM sqlite_master WHERE name='${tableName.replace(/'/g, "''")}'`
        : "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name";
      const result = await client.execute(sql);

      if (state.mode === "json" || state.mode === "csv") {
        printResultSet(result, state.mode, state.masked);
      } else {
        for (const row of result.rows) {
          if (row[0]) logger.log(String(row[0]) + ";");
        }
      }
      return "handled";
    }

    case ".indexes": {
      const tableName = parts[1];
      const sql = tableName
        ? `SELECT name, tbl_name as 'table' FROM sqlite_master WHERE type='index' AND tbl_name='${tableName.replace(/'/g, "''")}' ORDER BY name`
        : "SELECT name, tbl_name as 'table' FROM sqlite_master WHERE type='index' ORDER BY tbl_name, name";
      const result = await client.execute(sql);
      printResultSet(result, state.mode, state.masked);
      return "handled";
    }

    case ".describe": {
      const tableName = parts[1];
      if (!tableName) {
        logger.error("Usage: .describe TABLE");
        return "handled";
      }
      const result = await client.execute(
        `SELECT name, type, CASE WHEN "notnull" THEN 'NOT NULL' ELSE '' END as nullable, dflt_value as default_value, CASE WHEN pk THEN 'YES' ELSE '' END as primary_key FROM pragma_table_info('${tableName.replace(/'/g, "''")}')`,
      );
      if (result.rows.length === 0) {
        logger.error(`Table not found: ${tableName}`);
      } else {
        printResultSet(result, state.mode, state.masked);
      }
      return "handled";
    }

    case ".count": {
      const tableName = parts[1];
      if (!tableName) {
        logger.error("Usage: .count TABLE");
        return "handled";
      }
      if (!await confirmReadQuota(rl, "This will scan all rows and count against your read quota."))
        return "handled";

      const result = await client.execute(
        `SELECT COUNT(*) as count FROM "${tableName.replace(/"/g, '""')}"`,
      );
      printResultSet(result, state.mode, state.masked);
      return "handled";
    }

    case ".dump": {
      const tableName = parts[1];
      const dumpMsg = tableName
        ? `This will read all rows from "${tableName}" and count against your read quota.`
        : "This will read all rows from every table and count against your read quota.";
      if (!await confirmReadQuota(rl, dumpMsg))
        return "handled";

      const tables = tableName
        ? [tableName]
        : (
            await client.execute(
              "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
            )
          ).rows.map((r) => String(r[0]));

      for (const tbl of tables) {
        const escaped = tbl.replace(/'/g, "''");
        const schema = await client.execute(
          `SELECT sql FROM sqlite_master WHERE name='${escaped}'`,
        );
        if (schema.rows[0]?.[0]) {
          logger.log(String(schema.rows[0][0]) + ";");
        }

        const data = await client.execute(
          `SELECT * FROM "${tbl.replace(/"/g, '""')}"`,
        );
        for (const row of data.rows) {
          const values = data.columns.map((_, i) => {
            const val = row[i];
            if (val === null) return "NULL";
            if (typeof val === "number" || typeof val === "bigint")
              return String(val);
            return `'${String(val).replace(/'/g, "''")}'`;
          });
          logger.log(
            `INSERT INTO "${tbl.replace(/"/g, '""')}" VALUES (${values.join(", ")});`,
          );
        }
        logger.log();
      }
      return "handled";
    }

    case ".mode": {
      const newMode = parts[1]?.toLowerCase() as PrintMode | undefined;
      if (!newMode || !PRINT_MODES.includes(newMode)) {
        logger.log(`  Current mode: ${state.mode}`);
        logger.log(`  Available: ${PRINT_MODES.join(", ")}`);
      } else {
        state.mode = newMode;
        logger.log(`  Mode set to: ${state.mode}`);
      }
      return "handled";
    }

    case ".mask": {
      state.masked = true;
      logger.log("  Sensitive columns are now masked.");
      return "handled";
    }

    case ".unmask": {
      state.masked = false;
      logger.log("  Sensitive columns are now visible.");
      return "handled";
    }

    case ".timing": {
      state.timing = !state.timing;
      logger.log(`  Query timing ${state.timing ? "enabled" : "disabled"}.`);
      return "handled";
    }

    case ".size": {
      const tableName = parts[1];
      if (!tableName) {
        logger.error("Usage: .size TABLE");
        return "handled";
      }
      const escaped = tableName.replace(/'/g, "''");
      const schema = await client.execute(
        `SELECT sql FROM sqlite_master WHERE name='${escaped}' AND type='table'`,
      );
      if (!schema.rows[0]?.[0]) {
        logger.error(`Table not found: ${tableName}`);
        return "handled";
      }
      if (!await confirmReadQuota(rl, "Row count requires a full table scan and counts against your read quota."))
        return "handled";

      const info = await client.execute(
        `SELECT COUNT(*) as row_count FROM "${tableName.replace(/"/g, '""')}"`,
      );
      const cols = await client.execute(
        `SELECT COUNT(*) as c FROM pragma_table_info('${escaped}')`,
      );
      const indexes = await client.execute(
        `SELECT COUNT(*) as c FROM sqlite_master WHERE type='index' AND tbl_name='${escaped}'`,
      );
      const rowCount = info.rows[0]?.[0] ?? 0;
      const colCount = cols.rows[0]?.[0] ?? 0;
      const indexCount = indexes.rows[0]?.[0] ?? 0;
      logger.log(`  Table:   ${tableName}`);
      logger.log(`  Rows:    ${rowCount}`);
      logger.log(`  Columns: ${colCount}`);
      logger.log(`  Indexes: ${indexCount}`);
      return "handled";
    }

    case ".read": {
      const filePath = parts[1];
      if (!filePath) {
        logger.error("Usage: .read FILE");
        return "handled";
      }
      await executeFile(filePath, client, state.mode, state.masked, state.timing);
      return "handled";
    }

    case ".clear-history": {
      saveHistory([]);
      logger.log("  History cleared.");
      return "handled";
    }

    case ".help": {
      logger.log("  .tables          List all tables");
      logger.log("  .describe TABLE  Show column details for a table");
      logger.log("  .schema [TABLE]  Show CREATE statements");
      logger.log("  .indexes [TABLE] List indexes");
      logger.log("  .count TABLE     Count rows in a table");
      logger.log("  .size TABLE      Show table stats (rows, columns, indexes)");
      logger.log("  .dump [TABLE]    Dump schema and data as SQL");
      logger.log("  .read FILE       Execute SQL statements from a file");
      logger.log("  .mode [MODE]     Set output mode (default, table, json, csv, markdown)");
      logger.log("  .timing          Toggle query execution timing");
      logger.log("  .mask            Enable sensitive column masking");
      logger.log("  .unmask          Disable sensitive column masking");
      logger.log("  .clear-history   Clear command history");
      logger.log("  .quit            Exit the shell");
      logger.log("  .help            Show this help");
      return "handled";
    }

    default:
      return "unknown";
  }
}

/**
 * Resolve the database URL and auth token needed to connect.
 *
 * Resolution order:
 * 1. Explicit `--url` / `--token` flags
 * 2. `BUNNY_DATABASE_URL` / `BUNNY_DATABASE_AUTH_TOKEN` from `.env`
 * 3. API lookup (fetches the URL and/or generates a token on the fly)
 */
async function resolveCredentials(
  urlArg: string | undefined,
  tokenArg: string | undefined,
  databaseIdArg: string | undefined,
  profile: string,
  apiKeyOverride?: string,
  verbose = false,
): Promise<{ url: string; token: string }> {
  let url = urlArg ?? readEnvValue(ENV_DATABASE_URL)?.value;
  let token = tokenArg ?? readEnvValue(ENV_DATABASE_AUTH_TOKEN)?.value;

  if (url && token) return { url, token };

  const config = resolveConfig(profile, apiKeyOverride);
  const apiClient = createDbClient(config.apiKey, undefined, verbose);

  const { id: databaseId } = await resolveDbId(apiClient, databaseIdArg);

  const spin = spinner("Connecting...");
  spin.start();

  const fetches: Promise<any>[] = [];

  if (!url) {
    fetches.push(
      apiClient.GET("/v2/databases/{db_id}", {
        params: { path: { db_id: databaseId } },
      }),
    );
  } else {
    fetches.push(Promise.resolve(null));
  }

  if (!token) {
    spin.text = "Generating token...";
    fetches.push(
      apiClient.PUT("/v2/databases/{db_id}/auth/generate", {
        params: { path: { db_id: databaseId } },
        body: { authorization: "full-access", expires_at: null },
      }),
    );
  }

  const [dbResult, tokenResult] = await Promise.all(fetches);

  spin.stop();

  if (!url && dbResult) url = dbResult.data?.db?.url;
  if (!token && tokenResult) token = tokenResult.data?.token;

  if (!url || !token) {
    throw new UserError("Could not resolve database URL or generate token.");
  }

  return { url, token };
}

/**
 * Interactive SQL shell for querying a libSQL/SQLite database.
 *
 * Connects to a database using `@libsql/client` and provides a readline-based
 * REPL with persistent history, dot-commands (`.tables`, `.schema`, `.dump`,
 * etc.), multiple output modes, sensitive column masking, and query timing.
 *
 * Can also run non-interactively via a positional query argument, `--execute`, or
 * by passing a `.sql` file path.
 *
 * @example
 * ```bash
 * # Interactive shell (auto-detects database from .env)
 * bunny db shell
 *
 * # One-off query
 * bunny db shell "SELECT * FROM users;"
 *
 * # Execute from a .sql file
 * bunny db shell -e migrations/seed.sql
 *
 * # JSON output with unmasked sensitive columns
 * bunny db shell --mode json --unmask
 *
 * # Explicit credentials (skips API lookup)
 * bunny db shell --url libsql://... --token ey...
 * ```
 */
export const dbShellCommand = defineCommand<{
  [ARG_DATABASE_ID]?: string;
  query?: string;
  [ARG_EXEC]?: string;
  [ARG_MODE]?: string;
  [ARG_UNMASK]?: boolean;
  [ARG_URL]?: string;
  [ARG_TOKEN]?: string;
}>({
  command: COMMAND,
  describe: DESCRIPTION,

  builder: (yargs) =>
    yargs
      .positional(ARG_DATABASE_ID, {
        type: "string",
        describe:
          "Database ID (db_<ulid>). Auto-detected from BUNNY_DATABASE_URL in .env if omitted.",
      })
      .positional("query", {
        type: "string",
        describe: "SQL statement to execute (exits after)",
      })
      .option(ARG_EXEC, {
        alias: ARG_EXEC_ALIAS,
        type: "string",
        describe: "Execute a SQL statement and exit",
      })
      .option(ARG_MODE, {
        alias: ARG_MODE_ALIAS,
        type: "string",
        choices: PRINT_MODES as string[],
        default: "default",
        describe: "Output mode (default, table, json, csv, markdown)",
      })
      .option(ARG_UNMASK, {
        type: "boolean",
        default: false,
        describe: "Show sensitive column values unmasked",
      })
      .option(ARG_URL, {
        type: "string",
        describe: "Database URL (skips API lookup)",
      })
      .option(ARG_TOKEN, {
        type: "string",
        describe: "Auth token (skips token generation)",
      }),

  handler: async ({
    [ARG_DATABASE_ID]: databaseIdArg,
    query: queryArg,
    [ARG_EXEC]: execArg,
    [ARG_MODE]: modeArg,
    [ARG_UNMASK]: unmaskArg,
    [ARG_URL]: urlArg,
    [ARG_TOKEN]: tokenArg,
    profile,
    output,
    verbose,
    apiKey,
  }) => {
    // If database-id doesn't look like a database ID, treat it as the query
    let databaseId = databaseIdArg;
    let sql = execArg ?? queryArg;
    if (databaseId && !sql && !databaseId.startsWith("db_")) {
      sql = databaseId;
      databaseId = undefined;
    }

    const OUTPUT_TO_MODE: Partial<Record<string, PrintMode>> = {
      json: "json",
      csv: "csv",
      table: "table",
      markdown: "markdown",
    };
    const initialMode: PrintMode =
      (modeArg as PrintMode) ?? OUTPUT_TO_MODE[output] ?? "default";

    const { url, token } = await resolveCredentials(
      urlArg,
      tokenArg,
      databaseId,
      profile,
      apiKey,
      verbose,
    );

    const client = createClient({ url, authToken: token });

    // Non-interactive: execute and exit
    if (sql) {
      if (sql.endsWith(".sql") && existsSync(resolve(sql))) {
        await executeFile(sql, client, initialMode, !unmaskArg, false);
      } else {
        try {
          const result = await client.execute(sql);
          printResultSet(result, initialMode, !unmaskArg);
        } catch (err: any) {
          throw new UserError(err.message);
        }
      }
      return;
    }

    // Interactive REPL
    if (!process.stdin.isTTY) {
      throw new UserError(
        "Interactive shell requires a TTY.",
        `Use --${ARG_EXEC} to run a statement non-interactively.`,
      );
    }

    const state = { mode: initialMode, masked: !unmaskArg, timing: false };
    const history = loadHistory();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: PROMPT,
      terminal: true,
      history,
      historySize: HISTORY_MAX,
    });

    logger.log();
    logger.log(chalk.green("✓") + " Connected to database");
    logger.log(chalk.dim("  Type .help for commands, .quit to exit."));
    logger.log();
    rl.prompt();

    let buffer: string[] = [];

    rl.on("line", async (line: string) => {
      const trimmed = line.trim();

      // Empty line
      if (trimmed.length === 0 && buffer.length === 0) {
        rl.prompt();
        return;
      }

      // Dot-command (only when not in a multi-line statement)
      if (buffer.length === 0 && trimmed.startsWith(".")) {
        try {
          logger.log();
          const result = await executeDotCommand(trimmed, client, state, rl);
          if (result === "quit") {
            rl.close();
            return;
          }
          if (result === "unknown") {
            logger.error(`Unknown command: ${trimmed.split(/\s/)[0]}`);
            logger.dim('  Type ".help" for available commands.');
          }
        } catch (err: any) {
          logger.error(err.message);
        }
        logger.log();
        rl.prompt();
        return;
      }

      // Accumulate SQL
      buffer.push(line);
      const statement = buffer.join("\n").trim();

      if (!statement.endsWith(";")) {
        rl.setPrompt(PROMPT_CONTINUE);
        rl.prompt();
        return;
      }

      // Execute complete statement
      buffer = [];
      rl.setPrompt(PROMPT);

      try {
        logger.log();
        const t0 = performance.now();
        const result = await client.execute(statement);
        const elapsed = performance.now() - t0;
        printResultSet(result, state.mode, state.masked);
        if (state.timing) {
          logger.log(chalk.dim(`  ${elapsed.toFixed(1)}ms`));
        }
      } catch (err: any) {
        logger.log();
        logger.error(err.message);
      }

      logger.log();
      rl.prompt();
    });

    rl.on("SIGINT", () => {
      if (buffer.length > 0) {
        buffer = [];
        logger.log();
        rl.setPrompt(PROMPT);
        rl.prompt();
      } else {
        rl.close();
      }
    });

    rl.on("close", () => {
      saveHistory((rl as any).history ?? []);
      logger.log();
    });

    // Keep the process alive while the REPL is running
    await new Promise<void>((resolve) => {
      rl.on("close", resolve);
    });
  },
});
