import type { PositionResolvers } from '../__generated__/resolvers';

type PositionParent = {
  id: string;
};

export const Position: PositionResolvers = {
  positionId: (parent) => (parent as PositionParent).id,
};
