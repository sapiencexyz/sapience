import { encodeAbiParameters } from 'viem';

export interface PredictedOutcomeInputStub {
  marketId: string; // The id from API (already encoded claim:endTime)
  prediction: boolean;
}

function isHexAddress(value: string | undefined): value is `0x${string}` {
  return !!value && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function encodePredictedOutcomes(
  outcomes: PredictedOutcomeInputStub[]
): `0x${string}` {
  // Convert marketId string to bytes32 format
  const normalized = outcomes.map((o) => ({
    marketId: (o.marketId.startsWith('0x')
      ? o.marketId
      : `0x${o.marketId}`) as `0x${string}`,
    prediction: !!o.prediction,
  }));

  return encodeAbiParameters(
    [
      {
        type: 'tuple[]',
        components: [
          { name: 'marketId', type: 'bytes32' },
          { name: 'prediction', type: 'bool' },
        ],
      },
    ],
    [normalized]
  );
}

export function buildAuctionStartPayload(
  outcomes: PredictedOutcomeInputStub[],
  resolverOverride?: string
): { resolver: `0x${string}`; predictedOutcomes: `0x${string}`[] } {
  // Use the deployed UMA resolver address
  const UMA_RESOLVER_ADDRESS =
    '0x9052992cB14b7af25a3c40B27211d369c9ff7758' as `0x${string}`;
  const resolver: `0x${string}` = isHexAddress(resolverOverride)
    ? resolverOverride
    : UMA_RESOLVER_ADDRESS;

  // Resolver expects a single bytes blob with abi.encode(PredictedOutcome[])
  const encoded = encodePredictedOutcomes(outcomes);
  const predictedOutcomes = [encoded];

  return { resolver, predictedOutcomes };
}
