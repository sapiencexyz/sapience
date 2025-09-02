import WebSocket, { RawData } from 'ws';

const API_BASE = process.env.FOIL_API_BASE || 'http://localhost:3001';
const WS_URL =
  API_BASE.replace('https://', 'wss://')
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
          `[BOT] rfq.requested rfqId=${rfq.rfqId} wager=${rfq.wager} outcomes=${rfq.predictedOutcomes?.length ?? 0}`
        );

        // For the new mint flow, we need to provide taker collateral and signature
        const wager = BigInt(rfq.wager || '0');

        // Taker offers 50% of what the maker is offering
        // If maker offers 100, taker offers 50, total payout = 150
        const takerWager = wager / 2n; // 50% of wager
        const totalPayout = wager + takerWager;

        const bid = {
          type: 'bid.submit',
          payload: {
            rfqId: rfq.rfqId,
            taker:
              process.env.BOT_ADDRESS ||
              '0x0000000000000000000000000000000000000000',
            expirationTimestamp: Math.floor(Date.now() / 1000) + 60,
            takerWager: takerWager.toString(),
            takerPermitSignature: '0x', // TODO: Generate actual ERC20 permit signature
            takerBidSignature: '0x', // TODO: Generate signature allowing this specific bid
          },
        };
        console.log(
          `[BOT] Sending bid rfqId=${rfq.rfqId} wager=${wager.toString()} takerWager=${takerWager.toString()} totalPayout=${totalPayout.toString()} expirationTimestamp=${bid.payload.expirationTimestamp}`
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
            `[BOT] top bid takerWager=${top?.takerWager} expirationTimestamp=${top?.expirationTimestamp}`
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
