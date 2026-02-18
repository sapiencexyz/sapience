#!/usr/bin/env node

/**
 * Simple test script to verify the auction WebSocket proxy is working
 * 
 * Usage:
 *   node test-proxy.js                    # Test via proxy (localhost:3001)
 *   node test-proxy.js --direct           # Test direct connection (localhost:3002)
 */

import WebSocket from 'ws';

const viaProxy = !process.argv.includes('--direct');
const url = viaProxy 
  ? 'ws://localhost:3001/auction'  // Via API proxy
  : 'ws://localhost:3002/auction'; // Direct to auction service

console.log(`Connecting to: ${url}`);
console.log(`Mode: ${viaProxy ? 'Via Proxy (API -> Auction)' : 'Direct (Auction Service)'}`);
console.log('');

const ws = new WebSocket(url);

ws.on('open', () => {
  console.log('✅ Connected successfully!');
  console.log('');
  
  // Send an auction.start message
  const testMessage = {
    type: 'auction.start',
    payload: {
      taker: '0x1234567890123456789012345678901234567890',
      wager: '1000000000000000000', // 1 ETH
      resolver: '0x0000000000000000000000000000000000000000',
      predictedOutcomes: ['0xdeadbeef'],
      takerNonce: 1,
      chainId: 42161,
    },
  };
  
  console.log('📤 Sending auction.start message...');
  ws.send(JSON.stringify(testMessage));
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    console.log('📥 Received message:');
    console.log(JSON.stringify(msg, null, 2));
    console.log('');
    
    if (msg.type === 'auction.ack') {
      console.log('✅ Success! Received auction.ack - proxy is working!');
      console.log(`   Auction ID: ${msg.payload?.auctionId}`);
      console.log('');
      console.log('Closing connection in 2 seconds...');
      setTimeout(() => {
        ws.close();
        process.exit(0);
      }, 2000);
    }
  } catch (err) {
    console.log('📥 Received (non-JSON):', data.toString());
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.log(`\n🔌 Connection closed (code: ${code}, reason: ${reason || 'none'})`);
  process.exit(0);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('\n⏱️  Timeout - no response received');
  ws.close();
  process.exit(1);
}, 10000);

