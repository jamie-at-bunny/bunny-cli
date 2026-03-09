---
"@bunny.net/cli": patch
"@bunny.net/database-shell": patch
---

Switch from @libsql/client to @libsql/client/web to eliminate native addon dependency, fix compiled binary by lazy-loading database imports and inlining version at build time
