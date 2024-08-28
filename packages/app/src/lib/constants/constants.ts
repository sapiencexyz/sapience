export const TOKEN_DECIMALS = 18; // should be retrieved from the contract?
export const LOCAL_MARKET_CHAIN_ID = 13370;
export const API_BASE_URL =
  process.env.NODE_ENV === 'development'
    ? 'http://localhost:3001'
    : 'https://api.foil.xyz';
