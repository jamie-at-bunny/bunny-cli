import { defineCommand } from "../../core/define-command.ts";
import { resolveConfig } from "../../config/index.ts";
import { createComputeClient } from "../../api/compute-client.ts";
import { spinner } from "../../core/ui.ts";
import { logger } from "../../core/logger.ts";
import { formatTable } from "../../core/format.ts";
import { SCRIPT_TYPE_LABELS } from "./constants.ts";

export const scriptsListCommand = defineCommand({
  command: "list",
  aliases: ["ls"],
  describe: "List all Edge Scripts.",

  handler: async ({ profile, output, verbose, apiKey }) => {
    const config = resolveConfig(profile, apiKey);
    const client = createComputeClient(config.apiKey, config.apiUrl, verbose);

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

    if (output === "json") {
      logger.log(JSON.stringify(scripts, null, 2));
      return;
    }

    if (scripts.length === 0) {
      logger.info("No Edge Scripts found.");
      return;
    }

    logger.log(
      formatTable(
        ["ID", "Name", "Type", "Pull Zone"],
        scripts.map((script) => [
          String(script.Id ?? ""),
          script.Name ?? "",
          SCRIPT_TYPE_LABELS[script.ScriptType ?? -1] ?? "Unknown",
          (script.LinkedPullZones ?? [])
            .map((pz) => `${pz.DefaultHostname} (${pz.Id})`)
            .join(", "),
        ]),
        output,
      ),
    );
  },
});
