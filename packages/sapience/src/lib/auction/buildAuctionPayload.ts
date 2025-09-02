export interface PredictedOutcomeInputStub {
  marketGroup: string; // address
  marketId: number;
  prediction: boolean;
}

function toHexAscii(input: string): string {
  let hex = '';
  for (let i = 0; i < input.length; i++) {
    const h = input.charCodeAt(i).toString(16).padStart(2, '0');
    hex += h;
  }
  return hex.length % 2 === 0 ? hex : hex + '0';
}

function isHexAddress(value: string | undefined): value is `0x${string}` {
  return !!value && /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function encodeOutcomeBytesStub(
  outcome: PredictedOutcomeInputStub
): `0x${string}` {
  // Stub encoding: JSON-serialize the outcome and encode as ASCII-hex bytes
  const json = JSON.stringify({
    m: outcome.marketGroup,
    i: outcome.marketId,
    p: outcome.prediction ? 1 : 0,
  });
  const hex = toHexAscii(json);
  return `0x${hex}`;
}

export function buildAuctionStartPayload(
  outcomes: PredictedOutcomeInputStub[],
  resolverOverride?: string
): { resolver: `0x${string}`; predictedOutcomes: `0x${string}`[] } {
  const resolver: `0x${string}` = isHexAddress(resolverOverride)
    ? resolverOverride
    : ('0x0000000000000000000000000000000000000000' as `0x${string}`);

  const predictedOutcomes = outcomes.map((o) => encodeOutcomeBytesStub(o));
  return { resolver, predictedOutcomes };
}
