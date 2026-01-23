import { Resolver, FieldResolver, Root } from 'type-graphql';
import { User } from '@generated/type-graphql';
import prisma from '../../db';

@Resolver(() => User)
export class VolumeResolver {
  @FieldResolver(() => String)
  async tradingVolume(@Root() user: User): Promise<string> {
    const address = user.address.toLowerCase();

    // Fetch all positions where user is predictor or counterparty
    const positions = await prisma.position.findMany({
      where: {
        OR: [
          { predictor: { equals: address, mode: 'insensitive' } },
          { counterparty: { equals: address, mode: 'insensitive' } },
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
      const predictorIsUser = position.predictor.toLowerCase() === address;
      const counterpartyIsUser = position.counterparty.toLowerCase() === address;

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
}
