import { defineNamespace } from "../../core/define-namespace.ts";
import { scriptsInitCommand } from "./init.ts";
import { scriptsLinkCommand } from "./link.ts";
import { scriptsListCommand } from "./list.ts";
import { scriptsShowCommand } from "./show.ts";

export const scriptsNamespace = defineNamespace(
  "scripts",
  "Manage Edge Scripts.",
  [scriptsInitCommand, scriptsLinkCommand, scriptsListCommand, scriptsShowCommand],
);
