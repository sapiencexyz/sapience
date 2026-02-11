# ---- Base stage: shared across all services ----
FROM node:20-slim AS base
RUN npm install -g pnpm@9
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/api/package.json packages/api/
COPY packages/relayer/package.json packages/relayer/
COPY packages/polymarket-keeper/package.json packages/polymarket-keeper/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @sapience/sdk run build:lib

# ---- API service ----
FROM base AS api
RUN pnpm --filter @sapience/api prisma:generate
EXPOSE 8080
CMD ["pnpm", "--filter", "@sapience/api", "start:service"]

# ---- Background worker ----
FROM base AS worker
RUN pnpm --filter @sapience/api prisma:generate
CMD ["pnpm", "--filter", "@sapience/api", "start:worker"]

# ---- Relayer ----
FROM base AS relayer
EXPOSE 8080
CMD ["pnpm", "--filter", "@sapience/relayer", "start"]

# ---- Protocol stats cron ----
FROM base AS stats-cron
RUN pnpm --filter @sapience/api prisma:generate
CMD ["pnpm", "--filter", "@sapience/api", "start:compute-stats"]

# ---- Polymarket keeper cron ----
FROM base AS keeper-cron
RUN pnpm --filter @sapience/polymarket-keeper build
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@sapience/polymarket-keeper", "start"]
