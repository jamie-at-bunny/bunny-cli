import { randomBytes } from "crypto";
import { defineCommand } from "../../core/define-command.ts";
import { profileExists, setProfile } from "../../config/index.ts";
import { confirm } from "../../core/ui.ts";
import { logger } from "../../core/logger.ts";

const DASHBOARD_URL = process.env.BUNNYNET_DASHBOARD_URL ?? "https://dash.bunny.net";
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

const SUCCESS_HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>bunny.net CLI</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      display: flex; justify-content: center; align-items: center;
      min-height: 100vh;
      background: linear-gradient(180deg, #e1f2ff 0%, #fff 77.69%);
      padding: 2.8572rem;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .card {
      border: 1px solid #e6e9ec; border-radius: 8px;
      background: #fff; padding: 2.5rem;
      text-align: center; max-width: 480px; width: 100%;
    }
    h1 { color: #04223e; font-size: 1.5rem; margin-bottom: 0.75rem; }
    p  { color: #04223e; font-size: 1rem; opacity: 0.7; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Authenticated!</h1>
    <p>You can close this tab and return to the CLI.</p>
  </div>
</body>
</html>`;

export const authLoginCommand = defineCommand<{ force: boolean }>({
  command: "login",
  describe: "Authenticate with bunny.net via the browser.",

  builder: (yargs) =>
    yargs.option("force", {
      type: "boolean",
      default: false,
      describe: "Overwrite existing profile without confirmation",
    }),

  handler: async ({ profile, force }) => {
    if (profileExists(profile)) {
      logger.warn(`Profile "${profile}" already exists and will be overwritten.`);
      const ok = await confirm("Continue?", { force });
      if (!ok) {
        logger.log("Login cancelled.");
        process.exit(1);
      }
    }

    const state = randomBytes(16).toString("hex");

    const { promise: apiKeyPromise, resolve, reject } = Promise.withResolvers<string>();

    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname !== "/callback") {
          return new Response("Not found", { status: 404 });
        }

        const returnedState = url.searchParams.get("state");
        const apiKey = url.searchParams.get("apiKey");

        if (returnedState !== state) {
          reject(new Error("State mismatch: possible CSRF attack"));
          return new Response("Invalid state parameter.", { status: 400 });
        }

        if (!apiKey) {
          reject(new Error("No apiKey in callback"));
          return new Response("Missing API key.", { status: 400 });
        }

        resolve(apiKey);
        return new Response(SUCCESS_HTML, {
          headers: { "Content-Type": "text/html" },
        });
      },
    });

    const callbackUrl = `http://127.0.0.1:${server.port}/callback?state=${state}`;
    const authUrl = `${DASHBOARD_URL}/auth/login?source=cli&domain=localhost&callbackUrl=${encodeURIComponent(callbackUrl)}`;

    logger.info("Opening browser to authenticate...");
    logger.log();
    logger.dim(`If the browser doesn't open, visit:\n  ${authUrl}`);
    logger.log();

    openBrowser(authUrl);
    logger.info("Waiting for authentication...");

    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("Authentication timed out after 5 minutes")), AUTH_TIMEOUT_MS),
    );

    try {
      const apiKey = await Promise.race([apiKeyPromise, timeout]);
      setProfile(profile, apiKey);
      logger.log();
      logger.success(`Authenticated successfully! Profile "${profile}" saved.`);
    } catch (err: any) {
      logger.error(`Authentication failed: ${err.message}`);
      process.exit(1);
    } finally {
      server.stop();
    }
  },
});

function openBrowser(url: string) {
  const cmds: Record<string, string[]> = {
    darwin: ["open", url],
    linux: ["xdg-open", url],
    win32: ["rundll32", "url.dll,FileProtocolHandler", url],
  };

  const args = cmds[process.platform];
  if (args) {
    Bun.spawn(args, { stdio: ["ignore", "ignore", "ignore"] });
  }
}
