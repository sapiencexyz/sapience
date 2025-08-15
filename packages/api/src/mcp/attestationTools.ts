import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import prisma from '../db';

/**
 * Tool: get_attestations_by_market
 * Returns all attestations for a specific market ID.
 */
export const getAttestationsByMarket = {
  name: 'get_attestations_by_market',
  description: 'Get all attestations for a specific market ID.',
  parameters: {
    properties: {
      marketId: z.string().describe('The market ID to query attestations for'),
    },
  },
  function: async ({
    marketId,
  }: {
    marketId: string;
  }): Promise<CallToolResult> => {
    try {
      const attestations = await prisma.attestation.findMany({
        where: {
          marketId: marketId,
        },
        orderBy: {
          time: 'desc',
        },
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(attestations, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Failed to get attestations for market ${marketId}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          },
        ],
      };
    }
  },
};

/**
 * Tool: get_attestations_by_address
 * Returns attestations submitted by a specific address.
 */
export const getAttestationsByAddress = {
  name: 'get_attestations_by_address',
  description:
    'Get attestations submitted by a specific address. Can optionally filter by market ID.',
  parameters: {
    properties: {
      attesterAddress: z
        .string()
        .describe('The address that submitted attestations'),
      marketId: z
        .string()
        .optional()
        .describe('Optional market ID to filter attestations'),
    },
  },
  function: async ({
    attesterAddress,
    marketId,
  }: {
    attesterAddress: string;
    marketId?: string;
  }): Promise<CallToolResult> => {
    try {
      // Normalize address to lowercase for comparison
      const normalizedAddress = attesterAddress.toLowerCase();

      const where: {
        attester: string;
        marketId?: string;
      } = {
        attester: normalizedAddress,
      };

      if (marketId) {
        where.marketId = marketId;
      }

      const attestations = await prisma.attestation.findMany({
        where,
        orderBy: {
          time: 'desc',
        },
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(attestations, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Failed to get attestations for address ${attesterAddress}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          },
        ],
      };
    }
  },
};

/**
 * Tool: get_recent_attestations
 * Returns the most recent attestations.
 */
export const getRecentAttestations = {
  name: 'get_recent_attestations',
  description:
    'Get the most recent attestations. Can be filtered by market ID and limited to a specific number.',
  parameters: {
    properties: {
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(10)
        .describe('Number of attestations to return (default: 10, max: 100)'),
      marketId: z
        .string()
        .optional()
        .describe('Optional market ID to filter attestations'),
    },
  },
  function: async ({
    limit = 10,
    marketId,
  }: {
    limit?: number;
    marketId?: string;
  }): Promise<CallToolResult> => {
    try {
      const where: {
        marketId?: string;
      } = {};

      if (marketId) {
        where.marketId = marketId;
      }

      const attestations = await prisma.attestation.findMany({
        where,
        orderBy: {
          time: 'desc',
        },
        take: limit,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(attestations, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Failed to get recent attestations: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          },
        ],
      };
    }
  },
};
