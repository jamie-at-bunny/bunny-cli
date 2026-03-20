// Public API
export { createShellClient } from "./client.ts";
export { startShell, executeQuery, executeFile } from "./shell.ts";

// Types
export type {
  ShellLogger,
  ShellOptions,
  ExecuteOptions,
  PrintMode,
} from "./types.ts";
export { PRINT_MODES } from "./types.ts";

// Utilities (exported for testing and advanced usage)
export { splitStatements } from "./parser.ts";
export { getHistoryPath, loadHistory, saveHistory } from "./history.ts";
export {
  formatValue,
  formatValueRaw,
  printResultSet,
  csvEscape,
  isSensitiveColumn,
  columnMaskType,
  maskEmail,
} from "./format.ts";
export type { MaskType } from "./format.ts";
export {
  getDefaultViewsDir,
  isValidViewName,
  saveView,
  loadView,
  deleteView,
  listViews,
} from "./views.ts";
