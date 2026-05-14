import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApolloServer } from '@apollo/server';
import { makeExecutableSchema } from '@graphql-tools/schema';
import type { ApolloContext } from '../startApolloServer';
import { operationTimingPlugin } from './operationTimingPlugin';

const typeDefs = /* GraphQL */ `
  type Query {
    hello(name: String): String!
    fail: String!
    ping(address: String, holder: String, take: Int): String!
  }
`;

const resolvers = {
  Query: {
    hello: (_: unknown, args: { name?: string }) =>
      `hi ${args.name ?? 'world'}`,
    fail: () => {
      throw new Error('intentional');
    },
    ping: () => 'pong',
  },
};

const buildTestServer = () => {
  const schema = makeExecutableSchema({ typeDefs, resolvers });
  return new ApolloServer<ApolloContext>({
    schema,
    plugins: [operationTimingPlugin()],
  });
};

const stubContext = (overrides: Partial<ApolloContext> = {}): ApolloContext =>
  ({
    prisma: undefined as never,
    ...overrides,
  }) as ApolloContext;

const findLog = (logs: string[], match: string): Record<string, unknown> => {
  const line = logs.find((l) => l.includes(match));
  if (!line) {
    throw new Error(
      `No log line matched ${match}. Captured ${logs.length} lines: ${JSON.stringify(logs)}`
    );
  }
  return JSON.parse(line) as Record<string, unknown>;
};

describe('operationTimingPlugin', () => {
  let apollo: ApolloServer<ApolloContext>;
  let logs: string[];

  beforeEach(async () => {
    apollo = buildTestServer();
    await apollo.start();
    logs = [];
    // Pino writes serialized JSON lines via process.stdout.write, not console.
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      const text =
        typeof chunk === 'string'
          ? chunk
          : chunk instanceof Uint8Array
            ? Buffer.from(chunk).toString('utf8')
            : '';
      for (const line of text.split('\n')) {
        if (line) logs.push(line);
      }
      return true;
    }) as never);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await apollo.stop();
  });

  it('emits a structured log line for a successful query', async () => {
    await apollo.executeOperation(
      { query: '{ hello(name: "test") }' },
      { contextValue: stubContext() }
    );

    const parsed = findLog(logs, '"event":"gql_request"');
    expect(parsed).toMatchObject({
      event: 'gql_request',
      operationType: 'query',
      errors: 0,
      variables: {},
    });
    expect(parsed.durationMs).toBeTypeOf('number');
    expect(parsed.durationMs as number).toBeGreaterThanOrEqual(0);
  });

  it('redacts sensitive variable names but passes through filter args', async () => {
    await apollo.executeOperation(
      {
        query: /* GraphQL */ `
          query Ping($address: String, $holder: String, $take: Int) {
            ping(address: $address, holder: $holder, take: $take)
          }
        `,
        variables: {
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bAce',
          holder: '0x1234567890abcdef1234567890abcdef12345678',
          take: 20,
        },
        operationName: 'Ping',
      },
      { contextValue: stubContext() }
    );

    const parsed = findLog(logs, '"operationName":"Ping"');
    expect(parsed.variables).toEqual({
      address: '[REDACTED]',
      holder: '[REDACTED]',
      take: 20,
    });
  });

  it('reads complexity from contextValue.queryComplexity', async () => {
    await apollo.executeOperation(
      { query: '{ hello }' },
      { contextValue: stubContext({ queryComplexity: 42 }) }
    );

    const parsed = findLog(logs, '"event":"gql_request"');
    expect(parsed.complexity).toBe(42);
  });

  it('counts errors when a resolver throws', async () => {
    await apollo.executeOperation(
      { query: '{ fail }' },
      { contextValue: stubContext() }
    );

    const parsed = findLog(logs, '"event":"gql_request"');
    expect(parsed.errors as number).toBeGreaterThanOrEqual(1);
  });

  it('emits outcome="success" for clean responses and "errors" otherwise', async () => {
    await apollo.executeOperation(
      { query: '{ hello }' },
      { contextValue: stubContext() }
    );
    const ok = findLog(logs, '"event":"gql_request"');
    expect(ok.outcome).toBe('success');

    logs.length = 0;

    await apollo.executeOperation(
      { query: '{ fail }' },
      { contextValue: stubContext() }
    );
    const failed = findLog(logs, '"event":"gql_request"');
    expect(failed.outcome).toBe('errors');
  });

  it('falls back to "anonymous" for unnamed queries', async () => {
    await apollo.executeOperation(
      { query: '{ hello }' },
      { contextValue: stubContext() }
    );

    const parsed = findLog(logs, '"event":"gql_request"');
    expect(parsed.operationName).toBe('anonymous');
  });

  it('uses the operation name from a named query', async () => {
    await apollo.executeOperation(
      {
        query: 'query MyOp { hello }',
        operationName: 'MyOp',
      },
      { contextValue: stubContext() }
    );

    const parsed = findLog(logs, '"operationName":"MyOp"');
    expect(parsed.operationName).toBe('MyOp');
    expect(parsed.operationType).toBe('query');
  });
});
