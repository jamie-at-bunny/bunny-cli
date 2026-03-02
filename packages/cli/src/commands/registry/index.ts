import { defineNamespace } from "../../core/define-namespace.ts";
import { registryAddCommand } from "./add.ts";
import { registryListCommand } from "./list.ts";
import { registryRemoveCommand } from "./remove.ts";

export const registryNamespace = defineNamespace(
  "registry",
  "Manage container registries.",
  [registryAddCommand, registryListCommand, registryRemoveCommand],
);
