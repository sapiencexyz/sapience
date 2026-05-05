'use client';

import { useCallback, useMemo, useRef } from 'react';
import * as Sentry from '@sentry/nextjs';
import { type Address, type Hex, encodeFunctionData } from 'viem';
import { predictionMarketEscrowAbi } from '@sapience/sdk/abis';
import { predictionMarketEscrow } from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { useSapienceWriteContract } from './useSapienceWriteContract';

const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;

interface EscrowWriteResult {
  success: boolean;
  error?: string;
}

interface BurnRequest {
  pickConfigId: Hex;
  predictorTokenAmount: bigint;
  counterpartyTokenAmount: bigint;
  predictorHolder: Address;
  counterpartyHolder: Address;
  predictorPayout: bigint;
  counterpartyPayout: bigint;
  predictorNonce: bigint;
  counterpartyNonce: bigint;
  predictorDeadline: bigint;
  counterpartyDeadline: bigint;
  predictorSignature: Hex;
  counterpartySignature: Hex;
  refCode: Hex;
  predictorSessionKeyData: Hex;
  counterpartySessionKeyData: Hex;
}

export function useEscrowWrite(
  options: { chainId?: number; escrowAddress?: Address } = {}
) {
  const chainId = options.chainId ?? DEFAULT_CHAIN_ID;
  const defaultAddress = predictionMarketEscrow[chainId]?.address as
    | Address
    | undefined;
  const contractAddress = options.escrowAddress ?? defaultAddress;

  const successRef = useRef(false);

  const { writeContract, sendCalls, isPending } = useSapienceWriteContract({
    disableAutoRedirect: true,
    fallbackErrorMessage: 'Transaction failed',
    onTxHash: () => {
      successRef.current = true;
    },
  });

  const writeEscrow = useMemo(
    () =>
      (
        functionName: string,
        args: readonly unknown[]
      ): Promise<EscrowWriteResult> => {
        if (!contractAddress) {
          return Promise.resolve({
            success: false,
            error: 'Escrow contract not available',
          });
        }

        successRef.current = false;
        return writeContract({
          abi: predictionMarketEscrowAbi,
          address: contractAddress,
          functionName,
          args,
          chainId,
        }).then(() => ({ success: successRef.current }));
      },
    [contractAddress, chainId, writeContract]
  );

  const settle = useCallback(
    (args: {
      predictionId: Hex;
      refCode?: Hex;
    }): Promise<EscrowWriteResult> => {
      const { predictionId, refCode = ZERO_BYTES32 } = args;
      return writeEscrow('settle', [predictionId, refCode]);
    },
    [writeEscrow]
  );

  const redeem = useCallback(
    (args: {
      positionToken: Address;
      amount: bigint;
      refCode?: Hex;
    }): Promise<EscrowWriteResult> => {
      const { positionToken, amount, refCode = ZERO_BYTES32 } = args;
      return writeEscrow('redeem', [positionToken, amount, refCode]);
    },
    [writeEscrow]
  );

  const burn = useCallback(
    (args: { burnRequest: BurnRequest }): Promise<EscrowWriteResult> => {
      const { burnRequest: r } = args;
      // Telemetry: track any burn that still carries legacy session-key data
      // so we can confirm the on-chain path is unused before retiring it.
      const predictorSkLen = r.predictorSessionKeyData
        ? (r.predictorSessionKeyData.length - 2) / 2
        : 0;
      const counterpartySkLen = r.counterpartySessionKeyData
        ? (r.counterpartySessionKeyData.length - 2) / 2
        : 0;
      if (predictorSkLen > 0 || counterpartySkLen > 0) {
        Sentry.addBreadcrumb({
          category: 'burn.legacy_session_key',
          level: 'warning',
          message: 'burn_carries_legacy_session_key_data',
          data: {
            predictorHolder: r.predictorHolder,
            counterpartyHolder: r.counterpartyHolder,
            predictorByteLength: predictorSkLen,
            counterpartyByteLength: counterpartySkLen,
            chainId,
          },
        });
      }
      const burnRequestTuple = [
        r.pickConfigId,
        r.predictorTokenAmount,
        r.counterpartyTokenAmount,
        r.predictorHolder,
        r.counterpartyHolder,
        r.predictorPayout,
        r.counterpartyPayout,
        r.predictorNonce,
        r.counterpartyNonce,
        r.predictorDeadline,
        r.counterpartyDeadline,
        r.predictorSignature,
        r.counterpartySignature,
        r.refCode,
        r.predictorSessionKeyData,
        r.counterpartySessionKeyData,
      ] as const;
      return writeEscrow('burn', [burnRequestTuple]);
    },
    [writeEscrow, chainId]
  );

  const settleAndRedeem = useCallback(
    async (args: {
      predictionId: Hex;
      positionToken: Address;
      amount: bigint;
      refCode?: Hex;
    }): Promise<EscrowWriteResult> => {
      if (!contractAddress) {
        return { success: false, error: 'Escrow contract not available' };
      }

      const {
        predictionId,
        positionToken,
        amount,
        refCode = ZERO_BYTES32,
      } = args;

      const settleData = encodeFunctionData({
        abi: predictionMarketEscrowAbi,
        functionName: 'settle',
        args: [predictionId, refCode],
      });

      const redeemData = encodeFunctionData({
        abi: predictionMarketEscrowAbi,
        functionName: 'redeem',
        args: [positionToken, amount, refCode],
      });

      await sendCalls({
        chainId,
        calls: [
          { to: contractAddress, data: settleData },
          { to: contractAddress, data: redeemData },
        ],
      });
      return { success: true };
    },
    [contractAddress, chainId, sendCalls]
  );

  return {
    settle,
    redeem,
    settleAndRedeem,
    burn,
    contractAddress,
    chainId,
    isPending,
  };
}
