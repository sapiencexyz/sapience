import { Resolver, Query, Arg } from 'type-graphql';
import prisma from '../../db';

async function calculateVolumeForAddress(address: string): Promise<string> {
  const normalizedAddress = address.toLowerCase();

  const positions = await prisma.position.findMany({
    where: {
      OR: [
        { predictor: { equals: normalizedAddress, mode: 'insensitive' } },
        { counterparty: { equals: normalizedAddress, mode: 'insensitive' } },
      ],
    },
    select: {
      predictor: true,
      counterparty: true,
      predictorCollateral: true,
      counterpartyCollateral: true,
    },
  });

  let total = BigInt(0);

  for (const position of positions) {
    const predictorIsUser = position.predictor.toLowerCase() === normalizedAddress;
    const counterpartyIsUser = position.counterparty.toLowerCase() === normalizedAddress;

    if (predictorIsUser && position.predictorCollateral) {
      try {
        total += BigInt(position.predictorCollateral);
      } catch {
        // Skip invalid values
      }
    }

    if (counterpartyIsUser && position.counterpartyCollateral) {
      try {
        total += BigInt(position.counterpartyCollateral);
      } catch {
        // Skip invalid values
      }
    }
  }

  return total.toString();
}

@Resolver()
export class VolumeResolver {
  @Query(() => String)
  async tradingVolumeByAddress(
    @Arg('address', () => String) address: string
  ): Promise<string> {
    return calculateVolumeForAddress(address);
  }
}
