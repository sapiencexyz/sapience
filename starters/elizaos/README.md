## ElizaOS Starter (Sapience)

This is a minimal ElizaOS starter optimized for the Sapience pnpm monorepo.

### Requirements
- Node 20+
- pnpm 9+

### Scripts
```bash
# Full Eliza runtime/UI (requires Bun + @elizaos/cli)
pnpm dev

# Start Eliza server without hot reload (requires Bun + @elizaos/cli)
pnpm start

# Build (types, frontend, library)
pnpm build

# Lint/format and type-check
pnpm run format
pnpm run format:check
pnpm run type-check
```

### Notes
- pnpm manages the monorepo; Bun is required only to run the ElizaOS CLI.
- If Bun is missing, a preflight will guide you to install it.
- Frontend is built with Vite from `src/frontend` into `dist/frontend`.
