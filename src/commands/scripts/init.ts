import { existsSync } from "fs";
import { resolve, basename } from "path";
import prompts from "prompts";
import { defineCommand } from "../../core/define-command.ts";
import { resolveConfig } from "../../config/index.ts";
import { createComputeClient } from "../../api/compute-client.ts";
import { confirm, spinner } from "../../core/ui.ts";
import { logger } from "../../core/logger.ts";
import { UserError } from "../../core/errors.ts";
import { saveManifestAt } from "../../core/manifest.ts";
import { SCRIPT_MANIFEST } from "./constants.ts";

interface Template {
  name: string;
  description: string;
  repo: string;
  scriptType: number;
}

const TEMPLATES: Template[] = [
  // Standalone
  { name: "Empty", description: "An empty Edge Script project", repo: "https://github.com/BunnyWay/es-empty-script", scriptType: 1 },
  { name: "Return JSON", description: "A script that returns JSON responses", repo: "https://github.com/BunnyWay/es-return-json", scriptType: 1 },
  // Middleware
  { name: "Empty", description: "An empty Edge Script project", repo: "https://github.com/BunnyWay/es-empty-script", scriptType: 2 },
  { name: "Simple Middleware", description: "A simple middleware example", repo: "https://github.com/BunnyWay/es-simple-middleware", scriptType: 2 },
];

interface InitArgs {
  name?: string;
  type?: string;
  template?: string;
  deploy?: boolean;
  "skip-git"?: boolean;
  "skip-install"?: boolean;
}

export const scriptsInitCommand = defineCommand<InitArgs>({
  command: "init",
  describe: "Create a new Edge Script project.",

  builder: (yargs) =>
    yargs
      .option("name", {
        type: "string",
        describe: "Project directory name",
      })
      .option("type", {
        type: "string",
        choices: ["standalone", "middleware"],
        describe: "Script type",
      })
      .option("template", {
        type: "string",
        describe: "Template name",
      })
      .option("deploy", {
        type: "boolean",
        describe: "Deploy after creation",
      })
      .option("skip-git", {
        type: "boolean",
        describe: "Skip git initialization",
      })
      .option("skip-install", {
        type: "boolean",
        describe: "Skip dependency installation",
      }),

  handler: async (args) => {
    const { profile, output, apiKey } = args;

    // Step 1: Directory name
    let dirName = args.name;
    if (!dirName) {
      const { value } = await prompts({
        type: "text",
        name: "value",
        message: "Project directory name:",
        initial: "my-edge-script",
      });
      dirName = value;
    }
    if (!dirName) throw new UserError("Directory name is required.");

    const dirPath = resolve(dirName);
    if (existsSync(dirPath)) {
      throw new UserError(`Directory "${dirName}" already exists.`);
    }

    // Step 2: Script type
    let scriptType: number | undefined;
    if (args.type) {
      scriptType = args.type === "standalone" ? 1 : 2;
    } else {
      const { value } = await prompts({
        type: "select",
        name: "value",
        message: "Script type:",
        choices: [
          { title: "Standalone — handles requests independently", value: 1 },
          { title: "Middleware — processes requests before/after origin", value: 2 },
        ],
      });
      scriptType = value;
    }
    if (!scriptType) throw new UserError("Script type is required.");

    // Step 3: Template
    const filtered = TEMPLATES.filter((t) => t.scriptType === scriptType);
    let selected: Template | undefined;

    if (args.template) {
      selected = filtered.find(
        (t) => t.name.toLowerCase() === args.template!.toLowerCase(),
      );
      if (!selected) {
        throw new UserError(
          `Template "${args.template}" not found.`,
          `Available templates: ${filtered.map((t) => t.name).join(", ")}`,
        );
      }
    } else {
      const { value } = await prompts({
        type: "select",
        name: "value",
        message: "Select a template:",
        choices: filtered.map((t) => ({
          title: `${t.name} — ${t.description}`,
          value: t,
        })),
      });
      selected = value;
    }
    if (!selected) throw new UserError("Template selection is required.");

    // Step 4: Clone template
    const spin = spinner(`Cloning template "${selected.name}"...`);
    spin.start();

    const clone = Bun.spawn(
      ["git", "clone", "--depth", "1", selected.repo, dirPath],
      { stdout: "ignore", stderr: "pipe" },
    );
    const cloneExit = await clone.exited;

    if (cloneExit !== 0) {
      spin.stop();
      const stderr = await new Response(clone.stderr).text();
      throw new UserError(
        "Could not clone template.",
        stderr.trim() || "Make sure git is installed.",
      );
    }

    // Remove .git so user starts fresh
    const gitDir = `${dirPath}/.git`;
    if (existsSync(gitDir)) {
      const rm = Bun.spawn(["rm", "-rf", gitDir], { stdout: "ignore", stderr: "ignore" });
      await rm.exited;
    }

    spin.stop();
    logger.success(`Created project from "${selected.name}" template.`);

    // Step 5: Install dependencies
    if (existsSync(`${dirPath}/package.json`) && args["skip-install"] !== true) {
      const shouldInstall = await confirm("Install dependencies?");
      if (shouldInstall) {
        const installSpin = spinner("Installing dependencies...");
        installSpin.start();

        const install = Bun.spawn(["bun", "install"], {
          cwd: dirPath,
          stdout: "ignore",
          stderr: "pipe",
        });
        const installExit = await install.exited;
        installSpin.stop();

        if (installExit === 0) {
          logger.success("Dependencies installed.");
        } else {
          logger.warn("Failed to install dependencies. Run `bun install` manually.");
        }
      }
    }

    // Step 6: Save script type to manifest
    saveManifestAt(dirPath, SCRIPT_MANIFEST, { scriptType });

    // Step 7: Git init
    if (args["skip-git"] !== true) {
      const shouldGit = await confirm("Initialize git repository?");
      if (shouldGit) {
        const gitInit = Bun.spawn(["git", "init"], {
          cwd: dirPath,
          stdout: "ignore",
          stderr: "ignore",
        });
        await gitInit.exited;

        // Ensure .bunny/ is in .gitignore
        const gitignorePath = `${dirPath}/.gitignore`;
        const existing = existsSync(gitignorePath)
          ? await Bun.file(gitignorePath).text()
          : "";

        if (!existing.includes(".bunny")) {
          await Bun.write(
            gitignorePath,
            existing + (existing.endsWith("\n") || existing === "" ? "" : "\n") + ".bunny/\n",
          );
        }

        logger.success("Initialized git repository.");
      }
    }

    // Step 8: Deploy (create script on bunny.net + link)
    let deployResult: { id: number; name: string; hostname?: string } | undefined;

    const shouldDeploy = args.deploy !== undefined
      ? args.deploy
      : await confirm("Deploy script now?");

    if (shouldDeploy) {
      const config = resolveConfig(profile, apiKey);
      const client = createComputeClient(config.apiKey, config.apiUrl);
      const scriptName = basename(dirPath);

      const createSpin = spinner(`Creating script "${scriptName}"...`);
      createSpin.start();

      const { data: script } = await client.POST("/compute/script", {
        body: {
          Name: scriptName,
          ScriptType: scriptType as 0 | 1 | 2,
          CreateLinkedPullZone: true,
        },
      });

      createSpin.stop();

      if (!script) {
        logger.warn("Could not create script on bunny.net.");
      } else {
        logger.success(`Created script "${script.Name}" (ID: ${script.Id}).`);

        // Update manifest with remote ID
        saveManifestAt(dirPath, SCRIPT_MANIFEST, {
          id: script.Id,
          name: script.Name ?? undefined,
          scriptType,
        });

        deployResult = {
          id: script.Id!,
          name: script.Name!,
          hostname: script.LinkedPullZones?.[0]?.DefaultHostname ?? undefined,
        };

        if (deployResult.hostname) {
          logger.dim(`  URL: ${deployResult.hostname}`);
        }
      }
    }

    logger.log();
    logger.success(`Project created in ${dirName}`);
    logger.dim(`  cd ${dirName}`);

    if (output === "json") {
      logger.log(JSON.stringify({
        directory: dirName,
        scriptType,
        template: selected.name,
        ...(deployResult && { script: deployResult }),
      }, null, 2));
    }
  },
});
