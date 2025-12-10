export const ADMIN_AUTHENTICATE_MSG =
  'Sign this message to authenticate for admin actions.';

export const STARGATE_DEPOSIT_URL =
  'https://stargate.finance/?dstChain=ethereal&dstToken=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// EAS / UMA resolver constants
export const EAS_ADDRESS_ARBITRUM =
  '0xbD75f629A22Dc1ceD33dDA0b68c546A1c035c458';
export const ARBITRUM_CHAIN_ID = 42161;

// UMA Resolver on Arbitrum (default resolver for conditions)
export const UMA_RESOLVER_ARBITRUM =
  '0x2cc1311871b9fc7bfcb809c75da4ba25732eafb9';

// Known UMA resolver addresses (case-insensitive checks should normalize)
export const UMA_RESOLVER_ADDRESSES = new Set([
  '0xC873efA9D22A09e39101efB977C03011620bF015'.toLowerCase(),
  '0xd82F211D0d9bE9A73a829A5F1f0e34b02Bf2FB36'.toLowerCase(),
]);

// Display metadata for UMA resolvers keyed by full address
export const UMA_RESOLVER_DISPLAY: Record<
  string,
  { name: string; icon?: string; iconAlt?: string }
> = {
  '0xC873efA9D22A09e39101efB977C03011620bF015': {
    name: 'UMA',
    icon: '/uma.svg',
    iconAlt: 'UMA',
  },
  '0xd82F211D0d9bE9A73a829A5F1f0e34b02Bf2FB36': {
    name: 'UMA',
    icon: '/uma.svg',
    iconAlt: 'UMA',
  },
};

// Forecast schema: address resolver, bytes condition, uint256 forecast, string comment
export const SCHEMA_UID =
  '0x7df55bcec6eb3b17b25c503cc318a36d33b0a9bbc2d6bc0d9788f9bd61980d49';
