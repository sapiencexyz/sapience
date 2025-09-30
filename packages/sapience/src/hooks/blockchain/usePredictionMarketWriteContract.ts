import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';

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

  // Hardcoded Arbitrum One + PredictionMarket address
  const APP_CHAIN_ID = 42161;
  const PREDICTION_MARKET_ADDRESS =
    '0x8D1D1946cBc56F695584761d25D13F174906671C' as `0x${string}`;

  function burn(tokenId: bigint, refCode: `0x${string}`) {
    if (!PREDICTION_MARKET_ADDRESS || !APP_CHAIN_ID) return;
    return writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: predictionMarketAbi,
      functionName: 'burn',
      args: [tokenId, refCode],
      chainId: APP_CHAIN_ID,
    });
  }

  return { burn, isPending };
}
