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

    // Verify caller's Privy access token
    const authorization =
      request.headers.get('authorization') ||
      request.headers.get('Authorization');
    if (!authorization) {
      return NextResponse.json(
        { error: 'Unauthorized: missing Authorization header' },
        { status: 401 }
      );
    }
    try {
      const client = getPrivyClient();
      const token = authorization.replace(/^Bearer\s+/i, '');
      await client.verifyAuthToken(token);
    } catch (_err) {
      return NextResponse.json(
        { error: 'Unauthorized: invalid token' },
        { status: 401 }
      );
    }

    const caip2 = `eip155:${chainId}`;
    const client = getPrivyClient();

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
