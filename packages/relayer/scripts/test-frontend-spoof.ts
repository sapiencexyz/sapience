/**
 * Test script to verify frontend signature verification works.
 *
 * This submits a spoofed bid (claims to be the trusted bot but with fake signature)
 * to an anonymous auction. The relayer will accept it (no server-side verification),
 * but the frontend should reject it during signature verification.
 *
 * Usage: npx tsx scripts/test-frontend-spoof.ts [relayer-url]
 */

import WebSocket from 'ws';

const RELAYER_URL = process.argv[2] || 'ws://localhost:3002/auction';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ANON_QUOTER_BOT_ADDRESS = '0x29e1D43CCc51B9916C89FCf54EDd7Cc9B9Db856d';

// Fake signature - valid format but won't match the claimed maker
const FAKE_SIGNATURE = '0x' + 'ab'.repeat(65);

async function main() {
  console.log('🧪 Testing frontend spoof protection\n');
  console.log(`Relayer URL: ${RELAYER_URL}`);
  console.log(`Spoofing as: ${ANON_QUOTER_BOT_ADDRESS}`);
  console.log(`Taker (anonymous): ${ZERO_ADDRESS}\n`);

  const ws = new WebSocket(RELAYER_URL);

  ws.on('open', () => {
    console.log('✅ Connected to relayer\n');

    // Start an anonymous auction
    const auctionRequest = {
      type: 'auction.start',
      payload: {
        wager: '1000000000000000000',
        predictedOutcomes: [
          '0x0000000000000000000000000000000000000000000000000000000000000001',
        ],
        resolver: '0xdC1Fa830aD1de01f1EF603749f48bD73384286BE',
        taker: ZERO_ADDRESS,
        takerNonce: 0,
        chainId: 42161,
      },
    };

    console.log('📤 Starting anonymous auction...');
    ws.send(JSON.stringify(auctionRequest));
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log('📥 Received:', msg.type);

    if (msg.type === 'auction.ack' && msg.payload.auctionId) {
      const auctionId = msg.payload.auctionId;
      console.log(`✅ Auction started: ${auctionId}\n`);

      // Submit a SPOOFED bid
      const spoofedBid = {
        type: 'bid.submit',
        payload: {
          auctionId,
          maker: ANON_QUOTER_BOT_ADDRESS, // Claim to be the trusted bot
          makerWager: '999000000000000000000', // Fake amazing odds!
          makerDeadline: Math.floor(Date.now() / 1000) + 300,
          makerSignature: FAKE_SIGNATURE, // But signature is fake
          makerNonce: 0,
        },
      };

      console.log('📤 Submitting SPOOFED bid with fake amazing odds...');
      console.log(`   Claimed maker: ${ANON_QUOTER_BOT_ADDRESS}`);
      console.log(`   Fake makerWager: 999 (would be incredible odds!)`);
      console.log(`   Signature: ${FAKE_SIGNATURE.slice(0, 20)}...\n`);

      ws.send(JSON.stringify(spoofedBid));
    }

    if (msg.type === 'bid.ack') {
      if (msg.payload.error) {
        console.log(`❌ Bid rejected by relayer: ${msg.payload.error}`);
      } else {
        console.log('⚠️  Bid ACCEPTED by relayer (expected - no server-side verification)');
        console.log('');
        console.log('👉 Now check the frontend:');
        console.log('   1. Open the app without a wallet connected');
        console.log('   2. The spoofed bid should NOT appear (frontend verifies signature)');
        console.log('   3. Only bids with valid signatures from the real bot should show');
      }

      setTimeout(() => {
        ws.close();
        process.exit(0);
      }, 1000);
    }

    if (msg.type === 'auction.bids') {
      console.log(`📊 Auction has ${msg.payload.bids?.length || 0} bid(s)`);
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    process.exit(1);
  });
}

main();
