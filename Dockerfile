# ---- Base stage: shared across all services ----
FROM node:20-slim AS base
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
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
