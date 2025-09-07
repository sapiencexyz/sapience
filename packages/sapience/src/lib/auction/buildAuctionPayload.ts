import { encodeAbiParameters } from 'viem';

export interface PredictedOutcomeInputStub {
  marketGroup: string; // address
  marketId: number;
  prediction: boolean;
}

function isHexAddress(value: string | undefined): value is `0x${string}` {
  return !!value && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function encodePredictedOutcomes(
  outcomes: PredictedOutcomeInputStub[]
): `0x${string}` {
  const normalized = outcomes.map((o) => ({
    market: {
      marketGroup: isHexAddress(o.marketGroup)
        ? o.marketGroup
        : ('0x0000000000000000000000000000000000000000' as `0x${string}`),
      marketId: BigInt(o.marketId),
    },
    prediction: !!o.prediction,
  }));

  return encodeAbiParameters(
    [
      {
        type: 'tuple[]',
        components: [
          {
            name: 'market',
            type: 'tuple',
            components: [
              { name: 'marketGroup', type: 'address' },
              { name: 'marketId', type: 'uint256' },
            ],
          },
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
  const resolver: `0x${string}` = isHexAddress(resolverOverride)
    ? resolverOverride
    : ('0x0000000000000000000000000000000000000000' as `0x${string}`);

  // Resolver expects a single bytes blob with abi.encode(PredictedOutcome[])
  const encoded = encodePredictedOutcomes(outcomes);
  const predictedOutcomes = [encoded];
  return { resolver, predictedOutcomes };
}
