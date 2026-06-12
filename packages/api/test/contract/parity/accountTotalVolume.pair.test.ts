import { describe, it, expect } from 'vitest';
import { both } from './util';

/**
 * Parity: v1 `accountTotalVolume(address:): String!` vs v2
 * `account(address:) { stats { totalVolume } }` (G6).
 *
 * Both sides run the same SQL (lifetime collateral summed over legacy
 * `position` rows + the `Prediction` table; either side of a position —
 * predictor or counterparty — contributes its collateral when the address
 * matches), so the VALUES must agree exactly. Only the shape moved:
 * top-level String scalar → `Account.stats.totalVolume: BigInt!`. The wire
 * representation differs (v1 String vs v2 BigInt), so both sides are
 * compared via BigInt(x).toString().
 *
 * G6 acceptance criterion: v1 returns a volume for ANY address, including
 * one with no User row. v2's `account(address:)` synthesizes the Account,
 * so `stats.totalVolume` must return the same nonzero figure for the
 * synthesized case — asserted with SYNTHESIZED_COUNTERPARTY below, which
 * carries heavy `Prediction`-side volume but has no `app_user` row in the
 * fixture.
 */

// source: packages/app/src/hooks/useProfileVolume.ts (TRADING_VOLUME_QUERY)
const V1_TRADING_VOLUME = /* GraphQL */ `
  query TradingVolume($address: String!) {
    accountTotalVolume(address: $address)
  }
`;

const V2_ACCOUNT_STATS = /* GraphQL */ `
  query AccountTotalVolumeParity($address: Address!) {
    account(address: $address) {
      address
      stats {
        totalVolume
      }
    }
  }
`;

// app_user id 4 — persisted User row, predictor-side `Prediction` volume.
const PERSISTED_TRADER = '0xefa0e8aa84a713f6a6d4de8cc761fe86c5957d72';
// Counterparty on most fixture `Prediction` rows but NOT present in
// app_user — v2 must synthesize the Account (the G6 criterion).
const SYNTHESIZED_COUNTERPARTY = '0xd2b8da7b659a8273d36bc6a28c3c2521c5f9113f';

interface V1Data {
  accountTotalVolume: string;
}
interface V2Data {
  account: {
    address: string;
    // BigInt scalar: in-process execution may hand back bigint / string /
    // number depending on the serializer — the VALUE is the contract.
    stats: { totalVolume: string | number | bigint };
  };
}

const volumes = async (
  address: string
): Promise<{ v1: bigint; v2: bigint }> => {
  const [d1, d2] = await both<V1Data, V2Data>(
    { query: V1_TRADING_VOLUME, variables: { address } },
    { query: V2_ACCOUNT_STATS, variables: { address } }
  );
  expect(d2.account.address).toBe(address); // identity via the domain key
  return {
    v1: BigInt(d1.accountTotalVolume || '0'),
    v2: BigInt(d2.account.stats.totalVolume),
  };
};

describe('parity: account total volume (G6)', () => {
  it('matches v1 for a persisted account with volume', async () => {
    const { v1, v2 } = await volumes(PERSISTED_TRADER);
    expect(v1 > 0n).toBe(true); // fixture must actually exercise the sum
    expect(v2.toString()).toBe(v1.toString());
  });

  it('matches v1 for a synthesized account (no User row) with volume', async () => {
    const { v1, v2 } = await volumes(SYNTHESIZED_COUNTERPARTY);
    expect(v1 > 0n).toBe(true);
    expect(v2.toString()).toBe(v1.toString());
  });
});
