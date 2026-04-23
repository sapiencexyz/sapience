/**
 * Standalone ApolloServer for contract tests. Run with tsx so decorator
 * metadata is preserved the same way prod runs via `tsx src/server.ts`.
 *
 * Usage: `tsx test/helpers/startTestServer.ts`
 *
 * On startup emits a single JSON line to stdout:
 *   {"testServerReady":true,"port":12345,"url":"http://127.0.0.1:12345/graphql"}
 *
 * Reads TEST_DATABASE_URL from env (mirrored to DATABASE_URL) so all resolver
 * Prisma traffic hits the contract test database.
 */

import 'reflect-metadata';
import { createServer } from 'node:http';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express4';
import express from 'express';
import cors from 'cors';
import { buildApiSchema } from '../../src/graphql/buildSchema';
import type { ApolloContext } from '../../src/graphql/startApolloServer';
import prisma from '../../src/db';

const main = async (): Promise<void> => {
  const testUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!testUrl) {
    console.error('startTestServer: TEST_DATABASE_URL or DATABASE_URL required');
    process.exit(1);
  }
  process.env.DATABASE_URL = testUrl;

  const schema = await buildApiSchema({ emitSchemaFile: false });
  const apollo = new ApolloServer<ApolloContext>({ schema, introspection: true });
  await apollo.start();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(
    '/graphql',
    expressMiddleware(apollo, {
      context: async () => ({ prisma }),
    })
  );

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Could not determine listening port');
  }
  const port = addr.port;
  process.stdout.write(
    JSON.stringify({
      testServerReady: true,
      port,
      url: `http://127.0.0.1:${port}/graphql`,
    }) + '\n'
  );

  const shutdown = async (): Promise<void> => {
    await apollo.stop();
    server.close();
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

void main().catch((err) => {
  console.error('startTestServer failed:', err);
  process.exit(1);
});
