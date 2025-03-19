import { Resolver, Query, Arg, Int } from 'type-graphql';
import dataSource from '../../db';
import { Epoch } from '../../models/Epoch';
import { PnLType } from '../types';
import { mapEpochToType } from './mappers';

@Resolver(() => PnLType)
export class PnLResolver {
  @Query(() => [PnLType])
  async epochs(
    @Arg('marketId', () => Int, { nullable: true }) marketId?: number
  ): Promise<PnLType[]> {
    try {
      const where: { market?: { id: number } } = {};
      if (marketId) {
        where.market = { id: marketId };
      }

      const epochs = await dataSource.getRepository(Epoch).find({
        where,
      });

      return epochs.map(mapEpochToType);
    } catch (error) {
      console.error('Error fetching epochs:', error);
      throw new Error('Failed to fetch epochs');
    }
  }
}
