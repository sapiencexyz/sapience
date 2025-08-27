import WebSocket, { RawData } from 'ws';

const API_BASE = process.env.FOIL_API_BASE || 'http://localhost:3001';
const WS_URL = API_BASE.replace('https://', 'wss://')
  .replace('http://', 'ws://')
  .replace(/\/$/, '') + '/ws/rfq';

console.log('[BOT] Env FOIL_API_BASE =', process.env.FOIL_API_BASE);
console.log('[BOT] Connecting to', WS_URL);
const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('[BOT] Connected. readyState=', ws.readyState);
});

ws.on('message', (data: RawData) => {
  try {
    const msg = JSON.parse(String(data));
    const type = msg?.type as string | undefined;
    switch (type) {
      case 'rfq.requested': {
        const rfq = msg.payload || {};
        console.log(
          `[BOT] rfq.requested rfqId=${rfq.rfqId} chainId=${rfq.chainId} minPayout=${rfq.minPayout} collateral=${rfq.collateral} outcomes=${rfq.predictedOutcomes?.length ?? 0}`
        );
        // Quote a simple payout: minPayout + 1% and expire in 60s
        const minPayout = BigInt(rfq.minPayout || '0');
        const payout = (minPayout * 101n) / 100n;
        const delta = payout - BigInt(rfq.collateral || '0');
        const bid = {
          type: 'bid.submit',
          payload: {
            rfqId: rfq.rfqId,
            taker:
              process.env.BOT_ADDRESS ||
              '0x0000000000000000000000000000000000000000',
            quote: {
              payout: payout.toString(),
              delta: delta.toString(),
              validUntil: Math.floor(Date.now() / 1000) + 60,
            },
            chainId: rfq.chainId,
            fill: {
              // Raw signed tx omitted in example; server will reject as non-firm later
              callData: {
                to: '0x0000000000000000000000000000000000000000',
                data: '0x',
              },
            },
            meta: { version: '0.0.1' },
          },
        };
        console.log(
          `[BOT] Sending bid rfqId=${rfq.rfqId} payout=${bid.payload.quote.payout} delta=${bid.payload.quote.delta} validUntil=${bid.payload.quote.validUntil}`
        );
        ws.send(JSON.stringify(bid));
        break;
      }
      case 'bid.ack': {
        const ack = msg.payload || {};
        if (ack.error) {
          console.log('[BOT] bid.ack error=', ack.error);
        } else {
          console.log('[BOT] bid.ack bidId=', ack.bidId);
        }
        break;
      }
      case 'rfq.bids': {
        const payload = msg.payload || {};
        const bids = Array.isArray(payload.bids) ? payload.bids : [];
        console.log(
          `[BOT] rfq.bids rfqId=${payload.rfqId} count=${bids.length}`
        );
        if (bids.length > 0) {
          const top = bids[0];
          console.log(
            `[BOT] top bid payout=${top?.quote?.payout} validUntil=${top?.quote?.validUntil}`
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

