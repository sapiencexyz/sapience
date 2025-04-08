export const RESOURCE_ORDER = [
  'ethereum-gas',
  'base-gas',
  'arbitrum-gas',
  'ethereum-blobspace',
  'celestia-blobspace',
  'bitcoin-fees',
] as const;

export type ResourceSlug = (typeof RESOURCE_ORDER)[number];
