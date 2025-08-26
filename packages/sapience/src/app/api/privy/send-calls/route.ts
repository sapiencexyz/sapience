'use server';

import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';

// Privy Native Gas Sponsorship relay.
// Expects JSON body: { walletId: string, chainId: number, to: string, data: string, value?: string, sponsor?: boolean }
// Builds a Privy RPC call to: https://api.privy.io/v1/wallets/<wallet_id>/rpc with required auth headers.

let privyClient: PrivyClient | null = null;

function getPrivyClient() {
  if (privyClient) return privyClient;
  const appId = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error(
      'Server not configured: missing PRIVY_APP_ID/PRIVY_APP_SECRET'
    );
  }
  privyClient = new PrivyClient(appId, appSecret);
  return privyClient;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { walletId, chainId, to, data, value, sponsor } = body ?? {};

    if (!walletId || typeof chainId !== 'number' || !to || !data) {
      return NextResponse.json(
        { error: 'Invalid request: expected { walletId, chainId, to, data }' },
        { status: 400 }
      );
    }

    // Verify caller's Privy access token from cookie "privy-token"
    const cookieHeader = request.headers.get('cookie') || '';
    const rawCookie = cookieHeader
      .split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('privy-token='));
    const token = rawCookie
      ? decodeURIComponent(rawCookie.split('=')[1] || '')
      : '';
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized: missing privy-token cookie' },
        { status: 401 }
      );
    }
    try {
      const client = getPrivyClient();
      await client.verifyAuthToken(token);
    } catch (_err) {
      return NextResponse.json(
        { error: 'Unauthorized: invalid token' },
        { status: 401 }
      );
    }

    const caip2 = `eip155:${chainId}`;
    const client = getPrivyClient();

    const { authorizationKey } = await client.walletApi.generateUserSigner({
      userJwt: token,
    });

    client.walletApi.updateAuthorizationKey(authorizationKey);

    // Use Privy Server Auth SDK to send a sponsored transaction
    const result = await client.walletApi.ethereum.sendTransaction({
      walletId,
      caip2,
      transaction: {
        to,
        data,
        ...(value ? { value } : {}),
      },
      sponsor: sponsor !== false,
    } as any);

    // Normalize response to match existing frontend expectations
    const response = {
      transactionHash: result?.hash,
      caip2: result?.caip2,
      receipts: result?.hash ? [{ transactionHash: result.hash }] : undefined,
    };
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
