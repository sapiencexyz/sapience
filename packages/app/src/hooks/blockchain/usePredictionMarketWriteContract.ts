import { predictionMarket } from '@sapience/sdk/contracts';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';

const predictionMarketAbi = [
  {
    type: 'function',
    name: 'burn',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'refCode', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;

export function usePredictionMarketWriteContract(opts?: {
  successMessage?: string;
  fallbackErrorMessage?: string;
  onSuccess?: (receipt: any) => void;
  onError?: (error: Error) => void;
}) {
  const { writeContract, isPending } = useSapienceWriteContract({
    successMessage: opts?.successMessage,
    fallbackErrorMessage: opts?.fallbackErrorMessage,
    onSuccess: opts?.onSuccess,
    onError: opts?.onError,
  });

  // Use the currently selected chain from localStorage
  const chainId = useChainIdFromLocalStorage();
  const PREDICTION_MARKET_ADDRESS = predictionMarket[chainId]?.address;

  function burn(tokenId: bigint, refCode: `0x${string}`) {
    if (!PREDICTION_MARKET_ADDRESS || !chainId) return;
    return writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: predictionMarketAbi,
      functionName: 'burn',
      args: [tokenId, refCode],
      chainId,
    });
  }

  return { burn, isPending };
}
