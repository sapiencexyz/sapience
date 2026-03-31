import { useCallback, useRef } from 'react';
import { createPublicClient, http, erc20Abi, type Address } from 'viem';
import {
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
  etherealChain,
  etherealTestnetChain,
} from '@sapience/sdk/constants';
import {
  predictionMarketEscrow as predictionMarketEscrowAddresses,
  collateralToken as collateralTokenAddresses,
} from '@sapience/sdk/contracts';
import { validateBidOnChain, type ValidationResult } from '@sapience/sdk/auction/validation';
import type { PickJson } from '@sapience/sdk/types';

function getPublicClient(chainId: number) {
  const chain = chainId === CHAIN_ID_ETHEREAL_TESTNET ? etherealTestnetChain : etherealChain;
  return createPublicClient({
    transport: http(chain.rpcUrls.default.http[0]),
    chain,
  });
}

/**
 * Returns an async function that runs SDK tier-2 (on-chain) validation on a bid.
 * Checks signature, nonce freshness, balance, and allowance for both
 * counterparty and predictor.
 */
export function useBidValidator(chainId: number) {
  // Cache public client across renders
  const clientRef = useRef<ReturnType<typeof getPublicClient> | null>(null);
  const clientChainRef = useRef<number>(0);

  const validate = useCallback(async (
    bid: {
      counterparty: string;
      counterpartyCollateral: string;
      counterpartyNonce: number;
      counterpartyDeadline: number;
      counterpartySignature: string;
      counterpartySessionKeyData?: string;
    },
    auction: {
      predictor: string;
      predictorCollateral: string;
      predictorNonce?: number;
      picks: PickJson[];
    },
  ): Promise<ValidationResult> => {
    const escrowAddress = predictionMarketEscrowAddresses[chainId]?.address;
    const collateralAddress = collateralTokenAddresses[chainId]?.address;
    if (!escrowAddress || !collateralAddress) {
      return { status: 'invalid', code: 'MISSING_FIELD', reason: 'No escrow or collateral address for chain' };
    }

    if (!clientRef.current || clientChainRef.current !== chainId) {
      clientRef.current = getPublicClient(chainId);
      clientChainRef.current = chainId;
    }

    const result = await validateBidOnChain(
      bid,
      auction,
      {
        chainId,
        predictionMarketAddress: escrowAddress as Address,
        collateralTokenAddress: collateralAddress as Address,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        publicClient: clientRef.current as any,
        checkPredictor: true,
        failOpen: false,
      },
    );

    // SDK validates predictor and counterparty funds independently, but when
    // self-trading (predictor == counterparty) the contract pulls the combined
    // amount from the same address. Check the sum here.
    if (
      result.status === 'valid' &&
      auction.predictor.toLowerCase() === bid.counterparty.toLowerCase()
    ) {
      const totalCollateral = BigInt(bid.counterpartyCollateral) + BigInt(auction.predictorCollateral);
      const client = clientRef.current!;
      const [allowance, balance] = (await Promise.all([
        client.readContract({
          address: collateralAddress as Address,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [bid.counterparty as Address, escrowAddress as Address],
        }),
        client.readContract({
          address: collateralAddress as Address,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [bid.counterparty as Address],
        }),
      ])) as [bigint, bigint];

      if (allowance < totalCollateral) {
        return {
          status: 'invalid' as const,
          code: 'INSUFFICIENT_ALLOWANCE' as const,
          reason: `Self-trade: allowance ${allowance} < combined collateral ${totalCollateral}`,
        };
      }
      if (balance < totalCollateral) {
        return {
          status: 'invalid' as const,
          code: 'INSUFFICIENT_BALANCE' as const,
          reason: `Self-trade: balance ${balance} < combined collateral ${totalCollateral}`,
        };
      }
    }

    return result;
  }, [chainId]);

  return { validate };
}
