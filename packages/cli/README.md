# @bunny.net/cli

Command-line interface for [bunny.net](https://bunny.net) — manage databases, apps (Magic Containers), Edge Scripts, and more from your terminal.

See the [root README](../../README.md) for the full command reference, and [AGENTS.md](../../AGENTS.md) for architecture details.

## Development

```bash
# Install dependencies (from repo root)
bun install

# Run directly
bun run packages/cli/src/index.ts <command>

# Watch mode
bun --watch packages/cli/src/index.ts

# Make `bunny` available globally
bun link

# Type check
bun run typecheck

# Run tests
bun test

# Build standalone executable
bun run build
```

## Project Structure

```
src/
├── index.ts              # Entry point (shebang + cli.parse())
├── cli.ts                # Root yargs instance, global flags, command registration
├── core/                 # Command factories, errors, logger, format, UI helpers
├── config/               # Profile management, XDG path resolution, Zod schemas
└── commands/             # One file per command, grouped by domain
    ├── apps/             # Magic Containers (init, deploy, push, pull, env, endpoints, ...)
    ├── auth/             # Login/logout (top-level commands)
    ├── config/           # Config management (init, show, profile create/delete)
    ├── db/               # Databases (create, list, shell, usage, tokens)
    ├── registry/         # Container registries (top-level: add, list, remove)
    ├── scripts/          # Edge Scripts (init, link, list, show)
    └── whoami.ts         # Show authenticated account (top-level command)
```

## Internal Packages

| Package                      | Purpose                                                |
| ---------------------------- | ------------------------------------------------------ |
| `@bunny.net/api`             | Type-safe API client SDK (Core, DB, Compute, MC)       |
| `@bunny.net/app-config`      | Zod schemas, types, and JSON Schema for `bunny.jsonc`  |
| `@bunny.net/database-shell`  | Interactive SQL shell engine (REPL, formatting, masking)|
