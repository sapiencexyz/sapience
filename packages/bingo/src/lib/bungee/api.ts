import type {
  BungeeQuoteParams,
  BungeeQuoteResponse,
  BungeeStatusResponse,
  BungeeTokensResponse,
} from './types';

// Production hits the Frontend/Direct tier (domain-whitelisted, 100 RPM per
// IP, attributed via the affiliate header). Dev hits the public-backend
// sandbox so unwhitelisted local origins don't get 403'd on preflight.
// NEXT_PUBLIC_BUNGEE_API_BASE overrides both — useful when previewing prod
// on a non-whitelisted domain.
const BUNGEE_DEFAULT_API_BASE =
  process.env.NODE_ENV === 'development'
    ? 'https://public-backend.bungee.exchange/api/v1'
    : 'https://backend.bungee.exchange/api/v1';

export const BUNGEE_API_BASE =
  process.env.NEXT_PUBLIC_BUNGEE_API_BASE ?? BUNGEE_DEFAULT_API_BASE;

// Sapience affiliate ID, sent as the `affiliate` header on every Bungee
// public-backend request so traffic gets attributed back to us.
const BUNGEE_AFFILIATE_ID =
  '609913096f193b62cecd1ff1d33395fd5bffedceb5fef75aad43e6cbff367039708902197e0b2b78b1d76cb0837ad0b318baedceb5fef75aad43e6cb';

const BUNGEE_HEADERS: HeadersInit = {
  affiliate: BUNGEE_AFFILIATE_ID,
};

export async function fetchBungeeTokens(
  chainIds: readonly number[],
  signal?: AbortSignal
): Promise<BungeeTokensResponse> {
  const qs = new URLSearchParams({
    chainIds: chainIds.join(','),
    list: 'trending',
  });
  const res = await fetch(`${BUNGEE_API_BASE}/tokens/list?${qs}`, {
    signal,
    headers: BUNGEE_HEADERS,
  });
  if (!res.ok) {
    throw new Error(`Bungee tokens failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function fetchBungeeQuote(
  params: BungeeQuoteParams,
  signal?: AbortSignal
): Promise<BungeeQuoteResponse> {
  const qs = new URLSearchParams({
    originChainId: String(params.originChainId),
    destinationChainId: String(params.destinationChainId),
    inputToken: params.inputToken,
    outputToken: params.outputToken,
    inputAmount: params.inputAmount,
    userAddress: params.userAddress,
    receiverAddress: params.receiverAddress,
    refundAddress: params.refundAddress,
    slippage: String(params.slippage ?? 0.5),
    enableDepositAddress: 'true',
  });
  const res = await fetch(`${BUNGEE_API_BASE}/bungee/quote?${qs}`, {
    signal,
    headers: BUNGEE_HEADERS,
  });
  if (!res.ok) {
    throw new Error(`Bungee quote failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function fetchBungeeStatus(
  requestHash: string,
  signal?: AbortSignal
): Promise<BungeeStatusResponse> {
  const res = await fetch(
    `${BUNGEE_API_BASE}/bungee/status?requestHash=${requestHash}`,
    { signal, headers: BUNGEE_HEADERS }
  );
  if (!res.ok) {
    throw new Error(`Bungee status failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
