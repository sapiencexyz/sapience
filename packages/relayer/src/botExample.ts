import WebSocket, { RawData } from 'ws';
import {
  createWalletClient,
  createPublicClient,
  http,
  erc20Abi,
  getAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { conditionalTokensConditionResolver } from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';

const API_BASE = process.env.FOIL_RELAYER_BASE || 'http://localhost:3002';
const WS_URL =
  API_BASE.replace('https://', 'wss://')
    .replace('http://', 'ws://')
    .replace(/\/$/, '') + '/auction';

// Polymarket LZ resolver address for Ethereal
const POLYMARKET_RESOLVER =
  conditionalTokensConditionResolver[DEFAULT_CHAIN_ID]?.address?.toLowerCase();

console.log('[BOT] Env FOIL_RELAYER_BASE =', process.env.FOIL_RELAYER_BASE);
console.log('[BOT] Connecting to', WS_URL);
const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('[BOT] Connected. readyState=', ws.readyState);
});

async function ensureApprovalIfConfigured(amount: bigint) {
  try {
    const rpcUrl = process.env.BOT_RPC_URL;
    const pk = process.env.BOT_PRIVATE_KEY;
    const collateralToken = process.env.BOT_COLLATERAL_TOKEN;
    const spender = process.env.PREDICTION_MARKET_CONTRACT; // contract that will pull maker collateral
    const chainId = Number(process.env.BOT_CHAIN_ID || '5064014');

    if (!rpcUrl || !pk || !collateralToken || !spender) {
      console.log(
        '[BOT] Skipping approval (set BOT_RPC_URL, BOT_PRIVATE_KEY, BOT_COLLATERAL_TOKEN, PREDICTION_MARKET_CONTRACT to enable)'
      );
      return;
    }

    const account = privateKeyToAccount(`0x${pk.replace(/^0x/, '')}`);
    const publicClient = createPublicClient({ transport: http(rpcUrl) });
    const walletClient = createWalletClient({
      account,
      chain: {
        id: chainId,
        name: 'custom',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
      },
      transport: http(rpcUrl),
    });

    const owner = getAddress(account.address);
    const token = getAddress(collateralToken as `0x${string}`);
    const spenderAddr = getAddress(spender as `0x${string}`);

    const allowance = (await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [owner, spenderAddr],
    })) as bigint;

    if (allowance >= amount) {
      console.log(
        '[BOT] Approval sufficient, allowance=',
        allowance.toString()
      );
      return;
    }

    console.log(
      `[BOT] Sending approval tx for ${amount.toString()} to spender ${spenderAddr} on token ${token}`
    );
    const hash = await walletClient.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: 'approve',
      args: [spenderAddr, amount],
    });
    console.log('[BOT] Approval submitted hash=', hash);
  } catch (e) {
    console.error('[BOT] Approval step failed (continuing anyway):', e);
  }
}

ws.on('message', (data: RawData) => {
  try {
    const msg = JSON.parse(String(data));
    const type = msg?.type as string | undefined;
    switch (type) {
      case 'auction.started': {
        const auction = msg.payload || {};
        console.log(
          `[BOT] auction.started auctionId=${auction.auctionId} taker=${auction.taker} wager=${auction.wager} resolver=${auction.resolver} outcomes=${auction.predictedOutcomes?.length ?? 0}`
        );

        // Verify the resolver address matches the Polymarket LZ resolver
        const auctionResolver = String(auction.resolver || '').toLowerCase();
        if (auctionResolver !== POLYMARKET_RESOLVER) {
          console.log(
            `[BOT] Skipping auction - unexpected resolver: ${auction.resolver} (expected ${POLYMARKET_RESOLVER})`
          );
          break;
        }

        // For the new mint flow, we need to provide maker collateral and signature
        const wager = BigInt(auction.wager || '0');

        // Maker offers 50% of what the taker is offering
        // If taker offers 100, maker offers 50, total payout = 150
        const makerCollateral = wager / 2n; // 50% of wager
        const totalPayout = wager + makerCollateral;

        // Ensure ERC-20 approval is set up for the maker (optional, requires env vars)
        void ensureApprovalIfConfigured(makerCollateral);

        // Collateral transfers use ERC-20 approvals (not permit).
        // This example demonstrates submitting a bid with explicit fields and an off-chain signature over them.
        const nowSec = Math.floor(Date.now() / 1000);
        const bid = {
          type: 'bid.submit',
          payload: {
            auctionId: auction.auctionId,
            maker: '0x0000000000000000000000000000000000000001',
            makerCollateral: makerCollateral.toString(),
            makerDeadline: nowSec + 60,
            makerSignature: '0x' + '11'.repeat(32) + '22'.repeat(32),
            makerNonce: 1,
          },
        };
        console.log(
          `[BOT] Sending bid auctionId=${auction.auctionId} wager=${wager.toString()} makerCollateral=${makerCollateral.toString()} totalPayout=${totalPayout.toString()}`
        );
        ws.send(JSON.stringify(bid));
        break;
      }
      case 'bid.ack': {
        const ack = msg.payload || {};
        if (ack.error) {
          console.log('[BOT] bid.ack error=', ack.error);
        } else {
          console.log('[BOT] bid.ack ok');
        }
        break;
      }
      case 'auction.bids': {
        const payload = msg.payload || {};
        const bids = Array.isArray(payload.bids) ? payload.bids : [];
        console.log(
          `[BOT] auction.bids auctionId=${payload.auctionId} count=${bids.length}`
        );
        if (bids.length > 0) {
          const top = bids[0];
          console.log(
            `[BOT] top bid makerCollateral=${top?.makerCollateral} makerDeadline=${top?.makerDeadline}`
          );
        }
        break;
      }

      default: {
        console.log('[BOT] unhandled message type:', type);
        break;
      }
    }
  } catch (e) {
    console.error('[BOT] parse error', e);
  }
});

ws.on('error', (err: Error) => {
  console.error('[BOT] ws error', err);
});

ws.on('close', (code, reason) => {
  try {
    const r = reason ? reason.toString() : '';
    console.log(`[BOT] ws closed code=${code} reason="${r}"`);
  } catch {
    console.log(`[BOT] ws closed code=${code}`);
  }
});
