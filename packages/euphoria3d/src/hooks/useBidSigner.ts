import { useCallback } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import { type Address } from 'viem';
import { buildCounterpartyMintTypedData } from '@sapience/sdk/auction/escrowSigning';
import { jsonToPicks } from '@sapience/sdk/auction/escrowEncoding';
import { predictionMarketEscrow } from '@sapience/sdk/contracts';
import type { AuctionDetails } from '@sapience/sdk/types';
import type { WsClient } from './useMarketMaker';
import { useSession } from '../lib/SessionContext';

function generateRandomNonce(): bigint {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return BigInt(arr[0]);
}

export function useBidSigner(chainId: number) {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { isSessionActive, effectiveAddress, signTypedData: sessionSignTypedData } = useSession();

  const signAndSubmitBid = useCallback(async (
    client: WsClient,
    auction: AuctionDetails,
    counterpartyCollateralWei: string,
  ) => {
    const signerAddress = effectiveAddress ?? address;
    if (!signerAddress) throw new Error('Wallet not connected');

    const picks = jsonToPicks(auction.picks);
    const escrowAddress = predictionMarketEscrow[chainId]?.address;
    if (!escrowAddress) throw new Error('No escrow address');

    const nonce = generateRandomNonce();
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 120);

    const typedData = buildCounterpartyMintTypedData({
      picks,
      predictorCollateral: BigInt(auction.predictorCollateral),
      counterpartyCollateral: BigInt(counterpartyCollateralWei),
      predictor: auction.predictor as Address,
      counterparty: signerAddress,
      counterpartyNonce: nonce,
      counterpartyDeadline: deadline,
      verifyingContract: escrowAddress,
      chainId,
    });

    let signature: string;

    if (isSessionActive && sessionSignTypedData) {
      // Session key signing (auto, no wallet popup)
      signature = await sessionSignTypedData({
        domain: typedData.domain as Record<string, unknown>,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message as Record<string, unknown>,
      });
    } else {
      // EOA signing (wallet popup)
      signature = await signTypedDataAsync({
        domain: typedData.domain as Record<string, unknown>,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });
    }

    const bidPayload = {
      auctionId: auction.auctionId,
      counterparty: signerAddress as string,
      counterpartyCollateral: counterpartyCollateralWei,
      counterpartyNonce: Number(nonce),
      counterpartyDeadline: Number(deadline),
      counterpartySignature: signature,
    };

    client.submitBid(bidPayload);

    return bidPayload;
  }, [address, effectiveAddress, signTypedDataAsync, isSessionActive, sessionSignTypedData, chainId]);

  return { signAndSubmitBid, hasWallet: !!address };
}
