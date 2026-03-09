---
"@bunny.net/cli": patch
---

Fix compiled binary crashing on startup by lazy-loading @libsql/client and @bunny.net/database-shell in the db shell command, and inlining the version from package.json at build time
