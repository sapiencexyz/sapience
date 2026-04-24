/**
 * Prisma 7 CLI config.
 *
 * In Prisma 7 the CLI no longer reads `env(...)` from `datasource db
 * { url = env("DATABASE_URL") }` — that syntax was removed. The
 * connection URL for the migrate CLI + introspect now lives here
 * instead. The runtime PrismaClient takes its URL separately via
 * `src/db.ts` using the `@prisma/adapter-pg` driver adapter.
 *
 * Loads .env explicitly because Prisma 7 also dropped dotenv
 * auto-loading — whatever process runs `prisma migrate ...` has to
 * see DATABASE_URL in its environment.
 */

import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
