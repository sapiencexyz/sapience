'use server';

import { NextResponse } from 'next/server';

// Privy Native Gas Sponsorship relay.
// Expects JSON body: { walletId: string, chainId: number, to: string, data: string, value?: string, sponsor?: boolean }
// Builds a Privy RPC call to: https://api.privy.io/v1/wallets/<wallet_id>/rpc with required auth headers.

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

    const appId = process.env.PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (!appId || !appSecret) {
      return NextResponse.json(
        { error: 'Server not configured: missing PRIVY_APP_ID/PRIVY_APP_SECRET' },
        { status: 500 }
      );
    }

    const caip2 = `eip155:${chainId}`;
    const rpcUrl = `https://api.privy.io/v1/wallets/${walletId}/rpc`;

    // Optionally forward a precomputed authorization signature if present (e.g., from middleware)
    const forwardedSignature = request.headers.get('privy-authorization-signature') ?? undefined;

    const upstreamRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Basic auth in the form of appId:appSecret
        authorization: 'Basic ' + Buffer.from(`${appId}:${appSecret}`).toString('base64'),
        'privy-app-id': appId,
        ...(forwardedSignature
          ? { 'privy-authorization-signature': forwardedSignature }
          : {}),
      },
      body: JSON.stringify({
        method: 'eth_sendTransaction',
        caip2,
        params: {
          transaction: {
            to,
            data,
            ...(value ? { value } : {}),
          },
        },
        sponsor: sponsor !== false, // default true unless explicitly false
      }),
    });

    const text = await upstreamRes.text();
    if (!upstreamRes.ok) {
      return NextResponse.json({ error: text || 'Sponsorship failed' }, { status: upstreamRes.status });
    }

    try {
      const json = JSON.parse(text);
      return NextResponse.json(json, { status: 200 });
    } catch {
      return new NextResponse(text, { status: 200, headers: { 'content-type': 'text/plain' } });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

