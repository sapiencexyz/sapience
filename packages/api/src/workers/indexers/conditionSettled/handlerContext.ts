import type { Log, Block } from 'viem';

/**
 * Shared context passed to all event handler functions.
 * Avoids tight coupling to the indexer class.
 */
export interface HandlerContext {
  chainId: number;
  contractAddress: `0x${string}`;
}

export type HandlerFn = (
  ctx: HandlerContext,
  log: Log,
  block: Block
) => Promise<void>;
