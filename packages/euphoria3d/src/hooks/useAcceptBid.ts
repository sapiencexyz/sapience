import { useCallback, useState } from 'react';
import { useAccount, useSignTypedData, useSendTransaction } from 'wagmi';
import { type Address, type Hex, encodeFunctionData, erc20Abi, zeroAddress } from 'viem';
import { buildPredictorMintTypedData } from '@sapience/sdk/auction/escrowSigning';
import { jsonToPicks } from '@sapience/sdk/auction/escrowEncoding';
import { predictionMarketEscrowAbi } from '@sapience/sdk/abis';
import { predictionMarketEscrow, collateralToken } from '@sapience/sdk/contracts';
import type { CubeAuctionState, CubeKey } from '../components/QuoteCubes';
import { useSession } from '../lib/SessionContext';

export type AcceptStep = 'signing' | 'submitting' | 'confirming' | 'confirmed' | 'failed';

export interface AcceptLogEntry {
  timestamp: number;
  id: string;
  step: AcceptStep;
  message: string;
}

export function useAcceptBid(
  setCubeStatus: (cubeKey: string, update: Partial<CubeAuctionState>) => void,
  chainId: number,
) {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { sendTransactionAsync } = useSendTransaction();
  const {
    isSessionActive,
    effectiveAddress,
    signTypedData: sessionSignTypedData,
    etherealClient,
  } = useSession();

  const [acceptLog, setAcceptLog] = useState<AcceptLogEntry[]>([]);

  const logStep = useCallback((id: string, step: AcceptStep, message: string) => {
    setAcceptLog((prev) => [...prev.slice(-49), { timestamp: Date.now(), id, step, message }]);
  }, []);

  const clearLog = useCallback(() => setAcceptLog([]), []);

  const acceptBid = useCallback(async (cubeKey: CubeKey, state: CubeAuctionState) => {
    const signerAddress = effectiveAddress ?? address;
    if (!signerAddress) throw new Error('Wallet not connected');
    if (!state.bestBid || !state.auctionMeta) throw new Error('No bid to accept');

    const { bestBid, auctionMeta } = state;
    const escrowAddress = predictionMarketEscrow[chainId]?.address;
    if (!escrowAddress) throw new Error('No escrow address');

    const shortId = state.auctionId ? state.auctionId.slice(0, 8) : cubeKey;

    setCubeStatus(cubeKey, { status: 'accepting' });
    logStep(shortId, 'signing', 'Signing predictor approval...');

    try {
      const picks = jsonToPicks(auctionMeta.picks);

      const predictorNonce = BigInt(auctionMeta.predictorNonce);
      const predictorDeadline = BigInt(auctionMeta.predictorDeadline);

      // Sign predictor's MintApproval
      const typedData = buildPredictorMintTypedData({
        picks,
        predictorCollateral: BigInt(auctionMeta.predictorCollateral),
        counterpartyCollateral: BigInt(bestBid.counterpartyCollateral),
        predictor: signerAddress,
        counterparty: bestBid.counterparty as Address,
        predictorNonce,
        predictorDeadline,
        verifyingContract: escrowAddress,
        chainId,
      });

      let predictorSignature: string;

      if (isSessionActive && sessionSignTypedData) {
        // Session key signing (auto, no wallet popup)
        predictorSignature = await sessionSignTypedData({
          domain: typedData.domain as Record<string, unknown>,
          types: typedData.types,
          primaryType: typedData.primaryType,
          message: typedData.message as Record<string, unknown>,
        });
      } else {
        // EOA signing (wallet popup)
        predictorSignature = await signTypedDataAsync({
          domain: typedData.domain as Record<string, unknown>,
          types: typedData.types,
          primaryType: typedData.primaryType,
          message: typedData.message,
        });
      }

      logStep(shortId, 'submitting', 'Submitting mint transaction...');

      // Build mint request struct
      const mintRequest = {
        picks: picks.map((p) => ({
          conditionResolver: p.conditionResolver as Address,
          conditionId: p.conditionId as Hex,
          predictedOutcome: p.predictedOutcome,
        })),
        predictorCollateral: BigInt(auctionMeta.predictorCollateral),
        counterpartyCollateral: BigInt(bestBid.counterpartyCollateral),
        predictor: signerAddress,
        counterparty: bestBid.counterparty as Address,
        predictorNonce,
        counterpartyNonce: BigInt(bestBid.counterpartyNonce),
        predictorDeadline,
        counterpartyDeadline: BigInt(bestBid.counterpartyDeadline),
        predictorSignature: predictorSignature as Hex,
        counterpartySignature: bestBid.counterpartySignature as Hex,
        refCode: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
        predictorSessionKeyData: '0x' as Hex,
        counterpartySessionKeyData: (bestBid.counterpartySessionKeyData || '0x') as Hex,
        predictorSponsor: zeroAddress,
        predictorSponsorData: '0x' as Hex,
      };

      const data = encodeFunctionData({
        abi: predictionMarketEscrowAbi,
        functionName: 'mint',
        args: [mintRequest],
      });

      if (isSessionActive && etherealClient) {
        // Session mode: use UserOp (gasless via paymaster)
        const account = etherealClient.account;
        if (account && 'encodeCalls' in account) {
          const calls: { to: Address; data: `0x${string}`; value: bigint }[] = [];

          // Self-trading: predictor == counterparty, so the contract pulls
          // predictorCollateral + counterpartyCollateral from the same address.
          // Bundle wrap + approve to ensure sufficient allowance.
          const isSelfTrade = signerAddress.toLowerCase() === bestBid.counterparty.toLowerCase();
          if (isSelfTrade) {
            const wusdeAddress = collateralToken[chainId]?.address;
            if (wusdeAddress) {
              const totalCollateral = BigInt(auctionMeta.predictorCollateral) + BigInt(bestBid.counterpartyCollateral);

              // Wrap native USDe → wUSDe for the full amount (smart account may
              // hold native USDe that hasn't been wrapped yet)
              calls.push({
                to: wusdeAddress,
                data: '0xd0e30db0' as `0x${string}`, // deposit()
                value: totalCollateral,
              });

              // Approve escrow to spend the combined collateral
              calls.push({
                to: wusdeAddress,
                data: encodeFunctionData({
                  abi: erc20Abi,
                  functionName: 'approve',
                  args: [escrowAddress, totalCollateral],
                }),
                value: 0n,
              });
            }
          }

          calls.push({ to: escrowAddress, data, value: 0n });

          await etherealClient.sendUserOperation({
            callData: await (account as { encodeCalls: Function }).encodeCalls(calls),
          });
        }
      } else {
        // EOA mode: send transaction with native USDe as value
        await sendTransactionAsync({
          to: escrowAddress,
          data,
          value: BigInt(auctionMeta.predictorCollateral),
        });
      }

      logStep(shortId, 'confirmed', 'Mint confirmed');
      setCubeStatus(cubeKey, { status: 'accepted' });
    } catch (err) {
      console.error('[accept-bid] Failed:', err);
      const msg = err instanceof Error ? err.message : 'Accept failed';
      logStep(shortId, 'failed', msg);
      setCubeStatus(cubeKey, {
        status: 'error',
        error: msg,
      });
    }
  }, [address, effectiveAddress, signTypedDataAsync, sendTransactionAsync, setCubeStatus, chainId, isSessionActive, sessionSignTypedData, etherealClient, logStep]);

  return { acceptBid, acceptLog, clearLog };
}
