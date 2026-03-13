#!/usr/bin/env bash
set -euo pipefail

# Ensure devDependencies are installed for the workspace and @sapience/sdk
export NPM_CONFIG_PRODUCTION=false
export NODE_ENV=development

# Install workspace dependencies including devDependencies
pnpm -w install --prod=false

# Ensure @sapience/sdk devDependencies are present
pnpm --filter @sapience/sdk install --prod=false

# Ensure @sapience/ui dependencies (including dev) are present
pnpm --filter @sapience/ui install --prod=false

# Ensure @sapience/api dependencies (including dev) are installed
pnpm --filter @sapience/api install --prod=false

# Ensure @sapience/relayer dependencies (including dev) are installed
pnpm --filter @sapience/relayer install --prod=false

# Ensure @sapience/market-keeper dependencies (including dev) are installed
pnpm --filter @sapience/market-keeper install --prod=false

# Build the SDK library
pnpm --filter @sapience/sdk run build:lib


