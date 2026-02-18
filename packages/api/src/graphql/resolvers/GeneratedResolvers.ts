import 'reflect-metadata';
import { resolvers } from '@generated/type-graphql';
import { buildSchema } from 'type-graphql';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import responseCachePlugin from '@apollo/server-plugin-response-cache';
import depthLimit from 'graphql-depth-limit';
import prisma from '../../db';

// Use shared Prisma client

export async function startGraphQLServer() {
  // Build the GraphQL schema with generated resolvers (queries and relation resolvers only)
  const schema = await buildSchema({
    resolvers: resolvers,
    validate: false,
  });

  // Create Apollo Server
  const apolloServer = new ApolloServer({
    schema,
    formatError: (error) => {
      console.error('GraphQL Error:', error);
      return error;
    },
    introspection: true,
    plugins: [
      ApolloServerPluginLandingPageLocalDefault({
        embed: true,
        includeCookies: true,
      }),
      responseCachePlugin(),
    ],
    validationRules: [depthLimit(5)],
  });

  await apolloServer.start();

  return { apolloServer, schema };
}

export { prisma };
