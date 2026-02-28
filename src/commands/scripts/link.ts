import prompts from "prompts";
import { defineCommand } from "../../core/define-command.ts";
import { resolveConfig } from "../../config/index.ts";
import { createComputeClient } from "../../api/compute-client.ts";
import { spinner } from "../../core/ui.ts";
import { logger } from "../../core/logger.ts";
import { saveManifest } from "../../core/manifest.ts";
import { UserError } from "../../core/errors.ts";
import { SCRIPT_MANIFEST } from "./constants.ts";

export const scriptsLinkCommand = defineCommand<{ id?: number }>({
  command: "link",
  describe: "Link the current directory to an Edge Script.",

  builder: (yargs) =>
    yargs.option("id", {
      type: "number",
      describe: "Edge Script ID (skips interactive prompt)",
    }),

  handler: async ({ id, profile, output, verbose, apiKey }) => {
    const config = resolveConfig(profile, apiKey);
    const client = createComputeClient(config.apiKey, config.apiUrl, verbose);

    if (id) {
      const spin = spinner("Fetching Edge Script...");
      spin.start();

      const { data: script } = await client.GET("/compute/script/{id}", {
        params: { path: { id } },
      });

      spin.stop();

      if (!script) {
        throw new UserError(`Edge Script ${id} not found.`);
      }

      saveManifest(SCRIPT_MANIFEST, {
        id: script.Id,
        name: script.Name ?? undefined,
        scriptType: script.ScriptType,
      });

      if (output === "json") {
        logger.log(JSON.stringify({ id: script.Id, name: script.Name }));
        return;
      }

      logger.success(`Linked to ${script.Name} (${script.Id}).`);
      return;
    }

    const spin = spinner("Fetching Edge Scripts...");
    spin.start();

    const { data } = await client.GET("/compute/script", {
      params: {
        query: {
          includeLinkedPullzones: true,
          type: [1, 2],
        },
      },
    });

    spin.stop();

    const scripts = (data?.Items ?? []).sort((a, b) =>
      (a.Name ?? "").localeCompare(b.Name ?? ""),
    );

    if (scripts.length === 0) {
      throw new UserError("No Edge Scripts found in your account.");
    }

    logger.info(`Found ${scripts.length} Edge Scripts.`);
    logger.log();

    const { selected } = await prompts({
      type: "select",
      name: "selected",
      message: "Select script to link:",
      choices: scripts.map((s) => ({
        title: `${s.Name} (${s.Id})`,
        value: s,
      })),
    });

    if (!selected) {
      logger.log("Link cancelled.");
      process.exit(1);
    }

    saveManifest(SCRIPT_MANIFEST, {
      id: selected.Id,
      name: selected.Name ?? undefined,
      scriptType: selected.ScriptType,
    });

    if (output === "json") {
      logger.log(JSON.stringify({ id: selected.Id, name: selected.Name }));
      return;
    }

    logger.success(`Linked to ${selected.Name} (${selected.Id}).`);
  },
});
