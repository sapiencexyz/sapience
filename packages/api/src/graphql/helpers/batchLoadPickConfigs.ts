import prisma from '../../db';
import { PickConfigurationType } from '../resolvers/EscrowResolver';

/**
 * Batch-loads PickConfigurations by looking up Position records that match
 * the given token addresses, then mapping each token address to its
 * corresponding PickConfiguration.
 */
export async function batchLoadPickConfigs(
  tokenAddresses: string[]
): Promise<Map<string, PickConfigurationType>> {
  const tokenToPickConfig = new Map<string, PickConfigurationType>();
  if (tokenAddresses.length === 0) return tokenToPickConfig;

  const positions = await prisma.position.findMany({
    where: {
      tokenAddress: { in: tokenAddresses },
    },
    distinct: ['pickConfigId'],
    include: {
      pickConfiguration: {
        include: { picks: true },
      },
    },
  });

  for (const pos of positions) {
    if (pos.pickConfiguration) {
      const pc = pos.pickConfiguration;
      const mapped: PickConfigurationType = {
        id: pc.id,
        chainId: pc.chainId,
        marketAddress: pc.marketAddress,
        totalPredictorCollateral: pc.totalPredictorCollateral,
        totalCounterpartyCollateral: pc.totalCounterpartyCollateral,
        claimedPredictorCollateral: pc.claimedPredictorCollateral,
        claimedCounterpartyCollateral: pc.claimedCounterpartyCollateral,
        resolved: pc.resolved,
        result: pc.result,
        resolvedAt: pc.resolvedAt ?? null,
        predictorToken: pc.predictorToken ?? null,
        counterpartyToken: pc.counterpartyToken ?? null,
        endsAt: pc.endsAt ?? null,
        picks: pc.picks.map((p) => ({
          id: p.id,
          pickConfigId: p.pickConfigId,
          conditionResolver: p.conditionResolver,
          conditionId: p.conditionId,
          predictedOutcome: p.predictedOutcome,
        })),
      };
      tokenToPickConfig.set(pos.tokenAddress, mapped);
    }
  }

  return tokenToPickConfig;
}
