export const RESOURCE_ORDER = [
  'ethereum-gas',
  'base-gas',
  'arbitrum-gas',
  'ethereum-blobspace',
  'celestia-blobspace',
  'bitcoin-fees',
  'bitcoin-hashrate',
] as const;

export type ResourceSlug = (typeof RESOURCE_ORDER)[number];
