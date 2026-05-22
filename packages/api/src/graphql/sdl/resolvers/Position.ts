import type { PositionResolvers } from '../__generated__/resolvers';
import { registerNodeType, toGlobalId } from '../../relay/globalId';
import { resolvePositionNode } from './queries/escrow';

type PositionParent = {
  id: string;
};

registerNodeType({
  type: 'Position',
  loader: async (id) => resolvePositionNode(id),
});

export const Position: PositionResolvers = {
  id: (parent) => toGlobalId('Position', (parent as PositionParent).id),
  positionId: (parent) => (parent as PositionParent).id,
};
