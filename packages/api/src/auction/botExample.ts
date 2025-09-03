import WebSocket, { RawData } from 'ws';
import {
  createWalletClient,
  createPublicClient,
  http,
  erc20Abi,
  getAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const API_BASE = process.env.FOIL_API_BASE || 'http://localhost:3001';
const WS_URL =
  API_BASE.replace('https://', 'wss://')
    .replace('http://', 'ws://')
    .replace(/\/$/, '') + '/auction';

console.log('[BOT] Env FOIL_API_BASE =', process.env.FOIL_API_BASE);
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
    const spender = process.env.BOT_PARLAY_CONTRACT; // contract that will pull taker collateral
    const chainId = Number(process.env.BOT_CHAIN_ID || '8453');

    if (!rpcUrl || !pk || !collateralToken || !spender) {
      console.log(
        '[BOT] Skipping approval (set BOT_RPC_URL, BOT_PRIVATE_KEY, BOT_COLLATERAL_TOKEN, BOT_PARLAY_CONTRACT to enable)'
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
          `[BOT] auction.started auctionId=${auction.auctionId} maker=${auction.maker} wager=${auction.wager} outcomes=${auction.predictedOutcomes?.length ?? 0}`
        );

        // For the new mint flow, we need to provide taker collateral and signature
        const wager = BigInt(auction.wager || '0');

        // Taker offers 50% of what the maker is offering
        // If maker offers 100, taker offers 50, total payout = 150
        const takerWager = wager / 2n; // 50% of wager
        const totalPayout = wager + takerWager;

        // Ensure ERC-20 approval is set up for the taker (optional, requires env vars)
        void ensureApprovalIfConfigured(takerWager);

        // Collateral transfers use ERC-20 approvals (not permit).
        // This example demonstrates submitting a bid with explicit fields and an off-chain signature over them.
        const nowSec = Math.floor(Date.now() / 1000);
        const bid = {
          type: 'bid.submit',
          payload: {
            auctionId: auction.auctionId,
            taker: '0x0000000000000000000000000000000000000001',
            takerWager: takerWager.toString(),
            takerDeadline: nowSec + 60,
            takerSignature: '0x' + '11'.repeat(32) + '22'.repeat(32),
          },
        };
        console.log(
          `[BOT] Sending bid auctionId=${auction.auctionId} wager=${wager.toString()} takerWager=${takerWager.toString()} totalPayout=${totalPayout.toString()}`
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
            `[BOT] top bid takerWager=${top?.takerWager} takerDeadline=${top?.takerDeadline}`
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
