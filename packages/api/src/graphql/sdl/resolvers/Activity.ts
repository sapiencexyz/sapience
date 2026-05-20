import type {
  ActivityResolvers,
  ActivitySourceResolvers,
} from '../__generated__/resolvers';
import { synthesizeAccount } from './accountSynthesis';

export const Activity: ActivityResolvers = {
  account: (parent) => {
    const explicit = (parent as { account?: { address?: string } | string })
      .account;
    if (typeof explicit === 'string')
      return synthesizeAccount(explicit) as never;
    if (explicit?.address) return explicit as never;

    const source =
      (parent as { source?: Record<string, unknown> }).source ?? {};
    const address =
      (source.predictor as string | undefined) ??
      (source.buyer as string | undefined) ??
      (source.seller as string | undefined) ??
      '';
    return synthesizeAccount(address) as never;
  },
};

export const ActivitySource: ActivitySourceResolvers = {
  __resolveType: (parent) => {
    if ('predictionId' in parent) return 'Prediction';
    if ('tradeHash' in parent || 'buyer' in parent || 'seller' in parent)
      return 'Trade';
    return null;
  },
};
