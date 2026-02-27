import { defineCommand } from "../core/define-command.ts";
import { resolveConfig } from "../config/index.ts";
import { createCoreClient } from "../api/core-client.ts";
import { spinner } from "../core/ui.ts";
import { logger } from "../core/logger.ts";
import { UserError } from "../core/errors.ts";
import { formatKeyValue } from "../core/format.ts";

const COMMAND = "whoami";
const DESCRIPTION = "Show the currently authenticated account.";

/**
 * Display information about the currently authenticated account.
 *
 * Verifies the configured API key against the Bunny API and shows the
 * active profile, authentication source, and key roles.
 *
 * @example
 * ```bash
 * bunny whoami
 *
 * bunny whoami --output json
 *
 * bunny whoami --profile staging
 * ```
 */
export const whoamiCommand = defineCommand({
  command: COMMAND,
  describe: DESCRIPTION,

  handler: async ({ profile, output, verbose, apiKey }) => {
    const config = resolveConfig(profile, apiKey);

    if (!config.apiKey) {
      throw new UserError(
        "Not logged in.",
        'Run "bunny auth login" to authenticate.',
      );
    }

    logger.debug(`Profile: ${config.profile || "(none)"}`, verbose);
    logger.debug(`API URL: ${config.apiUrl}`, verbose);

    const client = createCoreClient(config.apiKey, config.apiUrl);

    const spin = spinner("Verifying credentials...");
    spin.start();

    logger.debug("Calling GET /apikey to verify credentials", verbose);

    const { data, error } = await client.GET("/apikey", {
      params: { query: { page: 1, perPage: 50 } },
    });

    spin.stop();

    if (error || !data) {
      throw new UserError(
        "Authentication failed.",
        "Your API key may be invalid or expired. Run \"bunny auth login\" to re-authenticate.",
      );
    }

    logger.debug(`Found ${data.Items?.length ?? 0} API keys on account`, verbose);

    const maskedKey = config.apiKey.slice(0, 8) + "..." + config.apiKey.slice(-4);
    const source = config.profile
      ? `config (profile: ${config.profile})`
      : "environment variable (BUNNYNET_API_KEY)";

    // Find the current key in the list to show its roles
    const currentKey = data.Items?.find((k) => k.Key === config.apiKey);
    const roles = currentKey?.Roles ?? [];

    logger.debug(`Key matched: ${!!currentKey}`, verbose);
    if (currentKey) {
      logger.debug(`Key ID: ${currentKey.Id}`, verbose);
      logger.debug(`Roles: ${roles.length > 0 ? roles.join(", ") : "(none)"}`, verbose);
    }

    if (output === "json") {
      logger.log(
        JSON.stringify(
          {
            profile: config.profile || null,
            source: config.profile ? "config" : "env",
            api_key: maskedKey,
            roles,
          },
          null,
          2,
        ),
      );
      return;
    }

    const entries = [
      { key: "Source", value: source },
      { key: "API key", value: maskedKey },
    ];
    if (roles.length > 0) {
      entries.push({ key: "Roles", value: roles.join(", ") });
    }

    logger.success("Authenticated!");
    logger.log();
    logger.log(formatKeyValue(entries, output));
  },
});
