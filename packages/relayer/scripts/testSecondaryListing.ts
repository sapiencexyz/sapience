/**
 * Test script for the integrator-reported "no bids on secondary listing" issue.
 *
 * Hypothesis: their `secondary.auction.start` payload omits `escrowContract`, so
 * the relayer rejects with `missing_escrow_contract` before broadcasting, and no
 * bot ever sees the listing.
 *
 * This script:
 *   1. Opens two WS connections to staging (observer + sender).
 *   2. Observer subscribes to `secondary.feed.subscribe`.
 *   3. Sender sends the integrator's exact payload WITHOUT escrowContract.
 *   4. Sender sends a corrected payload WITH escrowContract + fresh deadline + fresh nonce.
 *   5. Watches for ~45s for `secondary.auction.bids` events.
 *
 * Caveat: the seller signature is the integrator's session-key sig (137 bytes). The relayer
 * passes session-key sigs through as `unverified`, so tier 1 accepts. Bots, however, may run
 * stricter tier 2 validation and reject — so a "no bid" result here is inconclusive about
 * bot behavior, but the broadcast/ack traffic deterministically confirms the relayer fix.
 */

import WebSocket from 'ws';

const WS_URL = 'wss://relayer.staging.sapience.xyz/auction';
const ESCROW_CONTRACT_STAGING = '0x2877B0b65f0BB7F1e93681B7EE6646f568A23972'; // chain 13374202

const ORIGINAL_PAYLOAD = {
  token: '0x81BDc2F7bBBF1545d7f8Bc3d3865b34f9F43B8d8',
  collateral: '0xb7AE43711D85C23Dc862C85B9C95A64DC6351F90',
  tokenAmount: '6337377213331304400',
  seller: '0x5A3b7B57B19Be6ea47aFD0a2E03AC4b6F184912E',
  sellerNonce: 3361819257,
  sellerDeadline: 1777437011,
  chainId: 13374202,
  sellerSignature:
    '0x023d5e8becff279339f796e268b06c76cf30e6a932c9c7726b5fe854274857aa9a469f5d48e46bf3ee76dbcf3a74b81950a7115c93ea9860e1740e99b8776665048a87c3fccd1b',
};

function ts() {
  return new Date().toISOString().slice(11, 23);
}

function log(tag: string, msg: unknown) {
  console.log(`[${ts()}] [${tag}]`, typeof msg === 'string' ? msg : JSON.stringify(msg));
}

function openSocket(tag: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.on('open', () => {
      log(tag, 'connected');
      resolve(ws);
    });
    ws.on('error', (err) => reject(err));
    ws.on('close', (code, reason) =>
      log(tag, `closed code=${code} reason=${reason.toString()}`)
    );
    ws.on('message', (raw) => {
      try {
        log(tag, `RECV ${raw.toString()}`);
      } catch {
        log(tag, `RECV (non-string)`);
      }
    });
  });
}

function send(ws: WebSocket, tag: string, msg: unknown) {
  const raw = JSON.stringify(msg);
  log(tag, `SEND ${raw}`);
  ws.send(raw);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  log('main', `current unix=${Math.floor(Date.now() / 1000)}  staging escrow=${ESCROW_CONTRACT_STAGING}`);

  const observer = await openSocket('OBS ');
  const sender = await openSocket('SEND');

  // Observer subscribes to global feed
  send(observer, 'OBS ', { type: 'secondary.feed.subscribe' });
  await sleep(500);

  // ── Test 1: payload WITHOUT escrowContract (replicates integrator) ─────────
  log('main', '─── TEST 1: WITHOUT escrowContract (expect missing_escrow_contract) ───');
  send(sender, 'SEND', {
    type: 'secondary.auction.start',
    payload: ORIGINAL_PAYLOAD,
  });
  await sleep(2000);

  // ── Test 2: payload WITH escrowContract, fresh deadline + nonce ────────────
  log('main', '─── TEST 2: WITH escrowContract + fresh deadline/nonce (expect auctionId + broadcast) ───');
  const freshDeadline = Math.floor(Date.now() / 1000) + 600;
  const freshNonce = Math.floor(Math.random() * 2 ** 31);
  send(sender, 'SEND', {
    type: 'secondary.auction.start',
    payload: {
      ...ORIGINAL_PAYLOAD,
      escrowContract: ESCROW_CONTRACT_STAGING,
      sellerDeadline: freshDeadline,
      sellerNonce: freshNonce,
    },
  });

  // Watch for bids
  log('main', 'Watching 45s for bids/broadcasts...');
  await sleep(45_000);

  log('main', 'done — closing');
  observer.close();
  sender.close();
  await sleep(500);
  process.exit(0);
}

main().catch((err) => {
  log('main', `FATAL ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
