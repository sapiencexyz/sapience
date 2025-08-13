import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import prisma from '../db';

/**
 * Tool: list_active_markets
 * Returns all markets whose endTimestamp is in the future (i.e. active markets).
 */
export const listActiveMarkets = {
  name: 'list_active_markets',
  description:
    'Return all Sapience prediction markets that are currently being traded.',
  parameters: {
    properties: {
      __ignore__: z
        .boolean()
        .default(false)
        .describe(
          'This parameter is ignored – some MCP clients require a non-empty schema'
        )
        .optional(),
    },
  },
  function: async (): Promise<CallToolResult> => {
    try {
      const nowSeconds = Math.floor(Date.now() / 1000);

      const markets = await prisma.market.findMany({
        where: {
          endTimestamp: {
            gt: nowSeconds,
          },
          public: true,
        },
        orderBy: {
          endTimestamp: 'asc',
        },
      });

      const formatted = markets.map((m) => ({
        ...m,
        startTimestamp:
          m.startTimestamp !== null && m.startTimestamp !== undefined
            ? Number(m.startTimestamp)
            : null,
        endTimestamp:
          m.endTimestamp !== null && m.endTimestamp !== undefined
            ? Number(m.endTimestamp)
            : null,
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(formatted, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Failed to list active markets: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          },
        ],
      };
    }
  },
};
