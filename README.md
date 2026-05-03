# xcli-v2

Browser automation CLI rebuilt on `@dyyz1993/xcli-core` framework.

## Packages

- **@xcli-v2/browser-engine** — Browser automation engine (commands, recorder, humanize, extractors)
- **@xcli-v2/daemon** — Daemon server with worker process management
- **@xcli-v2/session** — Session management and RPC client
- **@xcli-v2/builtins** — Built-in CLI commands (not published)

## Usage

```bash
pnpm install
pnpm build
npx tsx bin/xcli.ts help
```
