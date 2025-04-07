import { buildSchema } from 'type-graphql';
import {
  EpochResolver,
  MarketResolver,
  PositionResolver,
  ResourceResolver,
  TransactionResolver,
  VolumeResolver,
} from '../graphql/resolvers';

async function generateSchema() {
  try {
    await buildSchema({
      resolvers: [
        MarketResolver,
        ResourceResolver,
        PositionResolver,
        TransactionResolver,
        EpochResolver,
        VolumeResolver,
      ],
      emitSchemaFile: true,
      validate: false,
    });
    console.log('Schema generated successfully!');
  } catch (error) {
    console.error('Error generating schema:', error);
  }
}

generateSchema();
