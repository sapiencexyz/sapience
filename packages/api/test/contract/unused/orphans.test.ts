import { describe, it, expect } from 'vitest';
import { executeOperation } from '../../helpers/testApollo';
import { stabilize } from '../../helpers/stableSerializer';

/**
 * Smoke tests for every root Query field that no current frontend or SDK
 * consumer calls. We still lock them in the contract because they're
 * reachable through the public GraphQL endpoint — any rewrite must
 * preserve them unless we intentionally delete them first.
 *
 * Each case runs the query with minimal structurally-valid arguments and
 * snapshots the full response (including any runtime errors). That way a
 * Pothos port must reproduce both successful shapes AND the current error
 * behavior byte-for-byte.
 */

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

interface OrphanCase {
  name: string;
  query: string;
  variables?: Record<string, unknown>;
}

const CASES: OrphanCase[] = [
  {
    name: 'accountAccuracy',
    query: /* GraphQL */ `
      query OrphanAccountAccuracy($address: String!) {
        accountAccuracy(address: $address) {
          address
          accuracyScore
          numScored
          numTimeWeighted
          sumErrorSquared
          sumTimeWeightedError
        }
      }
    `,
    variables: { address: ZERO_ADDRESS },
  },
  {
    name: 'accountActivity',
    query: /* GraphQL */ `
      query OrphanAccountActivity {
        accountActivity(take: 1, skip: 0) {
          timestamp
          type
          prediction {
            id
          }
          trade {
            id
          }
        }
      }
    `,
  },
  {
    name: 'accountBalance',
    query: /* GraphQL */ `
      query OrphanAccountBalance($address: String!) {
        accountBalance(address: $address, interval: DAY) {
          timestamp
          claimableCollateral
          deployedCollateral
        }
      }
    `,
    variables: { address: ZERO_ADDRESS },
  },
  {
    name: 'accountPnl',
    query: /* GraphQL */ `
      query OrphanAccountPnl($address: String!) {
        accountPnl(address: $address, interval: DAY) {
          timestamp
        }
      }
    `,
    variables: { address: ZERO_ADDRESS },
  },
  {
    name: 'accountPredictionCount',
    query: /* GraphQL */ `
      query OrphanAccountPredictionCount($address: String!) {
        accountPredictionCount(address: $address, interval: DAY) {
          timestamp
        }
      }
    `,
    variables: { address: ZERO_ADDRESS },
  },
  {
    name: 'accountProfitRank',
    query: /* GraphQL */ `
      query OrphanAccountProfitRank($address: String!) {
        accountProfitRank(address: $address) {
          address
          rank
          totalPnL
          totalParticipants
        }
      }
    `,
    variables: { address: ZERO_ADDRESS },
  },
  {
    name: 'accountTotalVolume',
    query: /* GraphQL */ `
      query OrphanAccountTotalVolume($address: String!) {
        accountTotalVolume(address: $address)
      }
    `,
    variables: { address: ZERO_ADDRESS },
  },
  {
    name: 'accountVolume',
    query: /* GraphQL */ `
      query OrphanAccountVolume($address: String!) {
        accountVolume(address: $address, interval: DAY) {
          timestamp
        }
      }
    `,
    variables: { address: ZERO_ADDRESS },
  },
  {
    name: 'claims',
    query: /* GraphQL */ `
      query OrphanClaims {
        claims(take: 1, skip: 0) {
          id
          chainId
          holder
          predictionId
        }
      }
    `,
  },
  {
    name: 'closes',
    query: /* GraphQL */ `
      query OrphanCloses {
        closes(take: 1, skip: 0) {
          id
          chainId
          pickConfigId
        }
      }
    `,
  },
  {
    name: 'collateralBalance',
    query: /* GraphQL */ `
      query OrphanCollateralBalance($address: String!) {
        collateralBalance(address: $address, chainId: 1) {
          address
          balance
          chainId
        }
      }
    `,
    variables: { address: ZERO_ADDRESS },
  },
  {
    name: 'collateralBalanceHistory',
    query: /* GraphQL */ `
      query OrphanCollateralBalanceHistory($address: String!) {
        collateralBalanceHistory(address: $address, chainId: 1) {
          timestamp
          balance
          index
        }
      }
    `,
    variables: { address: ZERO_ADDRESS },
  },
  {
    name: 'collateralTransfers',
    query: /* GraphQL */ `
      query OrphanCollateralTransfers($address: String!) {
        collateralTransfers(address: $address, chainId: 1) {
          id
          from
          to
          value
        }
      }
    `,
    variables: { address: ZERO_ADDRESS },
  },
  {
    name: 'condition',
    query: /* GraphQL */ `
      query OrphanCondition {
        condition(where: { id: "__nonexistent__" }) {
          id
        }
      }
    `,
  },
  {
    name: 'conditionGroup',
    query: /* GraphQL */ `
      query OrphanConditionGroup {
        conditionGroup(where: { id: -1 }) {
          id
        }
      }
    `,
  },
  {
    name: 'pickConfiguration',
    query: /* GraphQL */ `
      query OrphanPickConfiguration {
        pickConfiguration(id: "__nonexistent__") {
          id
        }
      }
    `,
  },
  {
    name: 'positionCount',
    query: /* GraphQL */ `
      query OrphanPositionCount($holder: String!) {
        positionCount(holder: $holder)
      }
    `,
    variables: { holder: ZERO_ADDRESS },
  },
  {
    name: 'positions',
    query: /* GraphQL */ `
      query OrphanPositions {
        positions(take: 1, skip: 0) {
          id
        }
      }
    `,
  },
  {
    name: 'prediction',
    query: /* GraphQL */ `
      query OrphanPrediction {
        prediction(id: "__nonexistent__") {
          id
        }
      }
    `,
  },
  {
    name: 'predictionCount',
    query: /* GraphQL */ `
      query OrphanPredictionCount($address: String!) {
        predictionCount(address: $address)
      }
    `,
    variables: { address: ZERO_ADDRESS },
  },
  {
    name: 'predictions',
    query: /* GraphQL */ `
      query OrphanPredictions {
        predictions(take: 1, skip: 0) {
          id
        }
      }
    `,
  },
  {
    name: 'protocolVolume',
    query: /* GraphQL */ `
      query OrphanProtocolVolume {
        protocolVolume(interval: DAY) {
          timestamp
        }
      }
    `,
  },
  {
    name: 'trade',
    query: /* GraphQL */ `
      query OrphanTrade {
        trade(id: "__nonexistent__") {
          id
        }
      }
    `,
  },
  {
    name: 'tradeCount',
    query: /* GraphQL */ `
      query OrphanTradeCount {
        tradeCount
      }
    `,
  },
  {
    name: 'trades',
    query: /* GraphQL */ `
      query OrphanTrades {
        trades(take: 1, skip: 0) {
          id
        }
      }
    `,
  },
  {
    name: 'user',
    query: /* GraphQL */ `
      query OrphanUser {
        user(where: { id: -1 }) {
          id
        }
      }
    `,
  },
  {
    name: 'users',
    query: /* GraphQL */ `
      query OrphanUsers {
        users(take: 1, skip: 0) {
          id
        }
      }
    `,
  },
];

describe('orphan root fields (no current frontend caller)', () => {
  for (const { name, query, variables } of CASES) {
    it(`${name} matches the recorded contract`, async () => {
      const result = await executeOperation(query, variables);
      const payload = {
        data: stabilize(result.data),
        errors: result.errors
          ? result.errors.map((e) => ({
              message: e.message,
              path: e.path,
              extensions: e.extensions,
            }))
          : undefined,
      };
      await expect(
        JSON.stringify(payload, null, 2)
      ).toMatchFileSnapshot(`../__snapshots__/unused/${name}.json`);
    });
  }
});
