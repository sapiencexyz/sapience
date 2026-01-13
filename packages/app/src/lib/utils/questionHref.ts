import {
  lzPMResolver,
  lzUmaResolver,
  umaResolver,
} from '@sapience/sdk/contracts/addresses';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';

export function getResolverAddressForChain(
  chainId?: number | null
): string | undefined {
  // All conditions are assumed to be on Ethereal.
  const id = chainId ?? CHAIN_ID_ETHEREAL;
  return (
    lzPMResolver[id]?.address ??
    lzUmaResolver[id]?.address ??
    umaResolver[id]?.address
  );
}

export function getQuestionHref({
  conditionId,
  resolverAddress,
  chainId,
}: {
  conditionId?: string | null;
  resolverAddress?: string | null;
  chainId?: number | null;
}): string {
  if (!conditionId) return '#';
  const resolver = resolverAddress ?? getResolverAddressForChain(chainId);
  if (!resolver) return `/questions/${conditionId}`;
  return `/questions/${resolver}/${conditionId}`;
}
