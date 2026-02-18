#!/usr/bin/env tsx
/**
 * Load Test Script for Relayer WebSocket Service
 * 
 * This script performs load testing on the relayer service by:
 * - Creating multiple concurrent WebSocket connections
 * - Sending messages at a specified rate
 * - Testing signed and unsigned messages for all message types
 * - Tracking connection success/failure
 * - Measuring latency and throughput
 * 
 * Usage:
 *   tsx load-test.ts                    # Default: 10 connections, 1 msg/sec
 *   tsx load-test.ts --connections 50   # 50 concurrent connections
 *   tsx load-test.ts --rate 10          # 10 messages per second per connection
 *   tsx load-test.ts --duration 60      # Run for 60 seconds
 *   tsx load-test.ts --url ws://localhost:3002/auction
 */

import WebSocket from 'ws';
import { parseArgs } from 'util';
import { privateKeyToAccount, signMessage } from 'viem/accounts';
import { generatePrivateKey } from 'viem/accounts';
import {
  createAuctionStartSiweMessage,
  buildMakerBidTypedData,
  signMakerBid,
  extractSiweDomainAndUri,
} from '@sapience/sdk';
import {
  PREDICTION_MARKET_ADDRESS_ARB1,
  PREDICTION_MARKET_CHAIN_ID_ARB1,
} from './src/constants';
import type {
  AuctionRequestPayload,
  BidPayload,
  ClientToServerMessage,
  BotToServerMessage,
} from './src/types';

const args = parseArgs({
  options: {
    connections: { type: 'string', default: '10' },
    rate: { type: 'string', default: '1' }, // messages per second per connection
    duration: { type: 'string', default: '30' }, // seconds
    url: { type: 'string', default: 'ws://localhost:3002/auction' },
    help: { type: 'boolean', default: false },
  },
});

if (args.values.help) {
  console.log(`
Load Test for Relayer WebSocket Service

Options:
  --connections <n>   Number of concurrent connections (default: 10)
  --rate <n>          Messages per second per connection (default: 1)
  --duration <n>      Test duration in seconds (default: 30)
  --url <url>         WebSocket URL (default: ws://localhost:3002/auction)
  --help              Show this help message

Example:
  tsx load-test.ts --connections 50 --rate 5 --duration 60
`);
  process.exit(0);
}

const CONNECTIONS = parseInt(args.values.connections || '10', 10);
const RATE = parseFloat(args.values.rate || '1');
const DURATION = parseInt(args.values.duration || '30', 10);
const WS_URL = args.values.url || 'ws://localhost:3002/auction';

interface ConnectionStats {
  connected: boolean;
  messagesSent: number;
  messagesReceived: number;
  errors: number;
  latencies: number[];
  lastMessageTime?: number;
  signedMessages: number;
  unsignedMessages: number;
  invalidSignatures: number;
}

const stats: Map<number, ConnectionStats> = new Map();
let globalStartTime: number;
let totalConnections = 0;
let successfulConnections = 0;
let failedConnections = 0;

// Generate test accounts for signing
const takerPrivateKey = generatePrivateKey();
const makerPrivateKey = generatePrivateKey();
const wrongPrivateKey = generatePrivateKey(); // For invalid signatures

const takerAccount = privateKeyToAccount(takerPrivateKey);
const makerAccount = privateKeyToAccount(makerPrivateKey);
const wrongAccount = privateKeyToAccount(wrongPrivateKey);

// Extract domain and URI from WebSocket URL
const { domain, uri } = extractSiweDomainAndUri(WS_URL);

type MessageType = 'auction.start' | 'bid.submit' | 'auction.subscribe' | 'auction.unsubscribe' | 'ping';
type SignatureType = 'signed' | 'unsigned' | 'wrong_signature';

async function createAuctionStartMessage(
  connectionId: number,
  messageId: number,
  sigType: SignatureType
): Promise<ClientToServerMessage> {
  const taker = takerAccount.address;
  const payload: AuctionRequestPayload = {
    taker,
    wager: '1000000000000000000', // 1 ETH
    resolver: '0x0000000000000000000000000000000000000000',
    predictedOutcomes: ['0xdeadbeef'],
    takerNonce: messageId,
    chainId: 42161,
  };

  if (sigType === 'unsigned') {
    return {
      type: 'auction.start',
      payload,
    };
  }

  const takerSignedAt = new Date().toISOString();
  const signingPayload = {
    wager: payload.wager,
    predictedOutcomes: payload.predictedOutcomes,
    resolver: payload.resolver,
    taker: payload.taker,
    takerNonce: payload.takerNonce,
    chainId: payload.chainId,
  };

  const message = createAuctionStartSiweMessage(
    signingPayload,
    domain,
    uri,
    takerSignedAt
  );

  let signature: `0x${string}`;
  if (sigType === 'signed') {
    signature = await takerAccount.signMessage({ message });
  } else {
    // Wrong signature - sign with wrong account
    signature = await wrongAccount.signMessage({ message });
  }

  return {
    type: 'auction.start',
    payload: {
      ...payload,
      takerSignature: signature,
      takerSignedAt,
    },
  };
}

async function createBidSubmitMessage(
  auctionId: string,
  messageId: number,
  sigType: SignatureType
): Promise<BotToServerMessage> {
  const maker = makerAccount.address;
  const auction: AuctionRequestPayload = {
    taker: takerAccount.address,
    wager: '1000000000000000000',
    resolver: '0x0000000000000000000000000000000000000000',
    predictedOutcomes: ['0xdeadbeef'],
    takerNonce: 0,
    chainId: 42161,
  };

  const payload: BidPayload = {
    auctionId,
    maker,
    makerWager: '1000000000000000000',
    makerDeadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    makerNonce: messageId,
    makerSignature: '0x', // Placeholder
  };

  if (sigType === 'unsigned') {
    return {
      type: 'bid.submit',
      payload: {
        ...payload,
        makerSignature: '0x', // Empty signature
      },
    };
  }

  const typedData = buildMakerBidTypedData({
    auction: {
      wager: BigInt(auction.wager),
      predictedOutcomes: auction.predictedOutcomes as `0x${string}`[],
      resolver: auction.resolver as `0x${string}`,
      taker: auction.taker as `0x${string}`,
    },
    makerWager: BigInt(payload.makerWager),
    makerDeadline: payload.makerDeadline,
    chainId: PREDICTION_MARKET_CHAIN_ID_ARB1,
    verifyingContract: PREDICTION_MARKET_ADDRESS_ARB1,
    maker: maker as `0x${string}`,
    makerNonce: BigInt(payload.makerNonce),
  });

  let signature: `0x${string}`;
  if (sigType === 'signed') {
    signature = await signMakerBid({
      privateKey: makerPrivateKey,
      ...typedData,
    });
  } else {
    // Wrong signature - sign with wrong account
    signature = await signMakerBid({
      privateKey: wrongPrivateKey,
      ...typedData,
    });
  }

  return {
    type: 'bid.submit',
    payload: {
      ...payload,
      makerSignature: signature,
    },
  };
}

function createSubscribeMessage(auctionId: string): ClientToServerMessage {
  return {
    type: 'auction.subscribe',
    payload: { auctionId },
  };
}

function createUnsubscribeMessage(auctionId: string): ClientToServerMessage {
  return {
    type: 'auction.unsubscribe',
    payload: { auctionId },
  };
}

function createPingMessage(): { type: 'ping' } {
  return {
    type: 'ping',
  };
}

// Message type distribution for testing
const MESSAGE_TYPES: Array<{ type: MessageType; weight: number }> = [
  { type: 'auction.start', weight: 0.25 },
  { type: 'bid.submit', weight: 0.25 },
  { type: 'auction.subscribe', weight: 0.15 },
  { type: 'auction.unsubscribe', weight: 0.15 },
  { type: 'ping', weight: 0.2 }, // Add ping messages for testing
];

// Signature type distribution
const SIG_TYPES: Array<{ type: SignatureType; weight: number }> = [
  { type: 'signed', weight: 0.4 },
  { type: 'unsigned', weight: 0.4 },
  { type: 'wrong_signature', weight: 0.2 },
];

function selectMessageType(): MessageType {
  const rand = Math.random();
  let cumulative = 0;
  for (const item of MESSAGE_TYPES) {
    cumulative += item.weight;
    if (rand <= cumulative) {
      return item.type;
    }
  }
  return MESSAGE_TYPES[0].type;
}

function selectSignatureType(): SignatureType {
  const rand = Math.random();
  let cumulative = 0;
  for (const item of SIG_TYPES) {
    cumulative += item.weight;
    if (rand <= cumulative) {
      return item.type;
    }
  }
  return SIG_TYPES[0].type;
}

async function createTestMessage(
  connectionId: number,
  messageId: number,
  auctionIds: string[]
): Promise<ClientToServerMessage | BotToServerMessage | { type: 'ping' } | null> {
  const msgType = selectMessageType();
  const sigType = selectSignatureType();

  // For subscribe/unsubscribe, we don't need signatures
  if (msgType === 'auction.subscribe') {
    const auctionId = auctionIds.length > 0 
      ? auctionIds[Math.floor(Math.random() * auctionIds.length)]
      : `test-auction-${connectionId}`;
    return createSubscribeMessage(auctionId);
  }

  if (msgType === 'auction.unsubscribe') {
    const auctionId = auctionIds.length > 0 
      ? auctionIds[Math.floor(Math.random() * auctionIds.length)]
      : `test-auction-${connectionId}`;
    return createUnsubscribeMessage(auctionId);
  }

  if (msgType === 'auction.start') {
    return await createAuctionStartMessage(connectionId, messageId, sigType);
  }

  if (msgType === 'bid.submit') {
    const auctionId = auctionIds.length > 0 
      ? auctionIds[Math.floor(Math.random() * auctionIds.length)]
      : `test-auction-${connectionId}`;
    return await createBidSubmitMessage(auctionId, messageId, sigType);
  }

  if (msgType === 'ping') {
    return createPingMessage();
  }

  return null;
}

function createConnection(id: number): Promise<void> {
  return new Promise((resolve) => {
    const connectionStats: ConnectionStats = {
      connected: false,
      messagesSent: 0,
      messagesReceived: 0,
      errors: 0,
      latencies: [],
      signedMessages: 0,
      unsignedMessages: 0,
      invalidSignatures: 0,
    };
    stats.set(id, connectionStats);

    let ws: WebSocket | null = null;
    let messageInterval: NodeJS.Timeout | null = null;
    let messageId = 0;
    const auctionIds: string[] = []; // Track auction IDs for subscribe/unsubscribe/bid

    const cleanup = () => {
      if (messageInterval) {
        clearInterval(messageInterval);
        messageInterval = null;
      }
      if (ws) {
        ws.removeAllListeners();
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        ws = null;
      }
    };

    const sendMessage = async () => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
      }

      const msg = await createTestMessage(id, messageId++, auctionIds);
      if (!msg) {
        return;
      }

      // Track signature type
      if ('payload' in msg && 'takerSignature' in msg.payload) {
        const payload = msg.payload as AuctionRequestPayload;
        if (payload.takerSignature) {
          // Check if it's a wrong signature by verifying the address
          if (payload.taker.toLowerCase() !== takerAccount.address.toLowerCase()) {
            connectionStats.invalidSignatures++;
          } else {
            connectionStats.signedMessages++;
          }
        } else {
          connectionStats.unsignedMessages++;
        }
      } else if ('payload' in msg && 'makerSignature' in msg.payload) {
        const payload = msg.payload as BidPayload;
        if (payload.makerSignature && payload.makerSignature !== '0x') {
          // For bid signatures, we can't easily verify here, so we'll track based on the message
          connectionStats.signedMessages++;
        } else {
          connectionStats.unsignedMessages++;
        }
      } else {
        // subscribe/unsubscribe messages
        connectionStats.unsignedMessages++;
      }

      const sendTime = Date.now();
      connectionStats.lastMessageTime = sendTime;
      connectionStats.messagesSent++;

      try {
        ws.send(JSON.stringify(msg));
      } catch (err) {
        connectionStats.errors++;
        console.error(`[Connection ${id}] Error sending message:`, err);
      }
    };

    ws = new WebSocket(WS_URL);

    ws.on('open', () => {
      connectionStats.connected = true;
      successfulConnections++;
      totalConnections++;

      // Send messages at the specified rate
      const intervalMs = RATE > 0 ? 1000 / RATE : 0;
      if (intervalMs > 0) {
        messageInterval = setInterval(() => {
          sendMessage().catch((err) => {
            connectionStats.errors++;
            console.error(`[Connection ${id}] Error in sendMessage:`, err);
          });
        }, intervalMs);
        // Send first message immediately
        sendMessage().catch((err) => {
          connectionStats.errors++;
          console.error(`[Connection ${id}] Error in sendMessage:`, err);
        });
      }

      resolve();
    });

    ws.on('message', (data: WebSocket.RawData) => {
      connectionStats.messagesReceived++;
      const receiveTime = Date.now();
      
      if (connectionStats.lastMessageTime) {
        const latency = receiveTime - connectionStats.lastMessageTime;
        connectionStats.latencies.push(latency);
        // Keep only last 1000 latencies to avoid memory issues
        if (connectionStats.latencies.length > 1000) {
          connectionStats.latencies.shift();
        }
      }

      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'auction.ack') {
          // Track auction IDs from successful starts
          if (msg.payload?.auctionId) {
            const auctionId = msg.payload.auctionId;
            if (!auctionIds.includes(auctionId)) {
              auctionIds.push(auctionId);
            }
          }
        } else if (msg.type === 'auction.started') {
          // Track auction IDs from broadcasts
          if (msg.payload?.auctionId) {
            const auctionId = msg.payload.auctionId;
            if (!auctionIds.includes(auctionId)) {
              auctionIds.push(auctionId);
            }
          }
        } else if (msg.type === 'pong') {
          // Track successful ping/pong responses
          // (messagesReceived is already incremented above)
        }
      } catch {
        // Ignore parse errors
      }
    });

    ws.on('error', (err) => {
      connectionStats.errors++;
      connectionStats.connected = false;
      failedConnections++;
      console.error(`[Connection ${id}] Error:`, err.message);
      cleanup();
      resolve();
    });

    ws.on('close', () => {
      connectionStats.connected = false;
      cleanup();
    });

    // Connection timeout
    setTimeout(() => {
      if (!connectionStats.connected) {
        failedConnections++;
        totalConnections++;
        cleanup();
        resolve();
      }
    }, 5000);
  });
}

async function runLoadTest() {
  console.log('🚀 Starting Load Test');
  console.log('========================================');
  console.log(`Target URL: ${WS_URL}`);
  console.log(`Connections: ${CONNECTIONS}`);
  console.log(`Rate: ${RATE} msg/sec per connection`);
  console.log(`Duration: ${DURATION} seconds`);
  console.log('========================================\n');

  globalStartTime = Date.now();

  // Create all connections
  console.log(`Creating ${CONNECTIONS} connections...`);
  const connectionPromises: Promise<void>[] = [];
  
  // Stagger connections slightly to avoid thundering herd
  for (let i = 0; i < CONNECTIONS; i++) {
    connectionPromises.push(createConnection(i));
    if (i < CONNECTIONS - 1) {
      await new Promise(resolve => setTimeout(resolve, 10)); // 10ms delay between connections
    }
  }

  await Promise.all(connectionPromises);

  console.log(`\n✅ All connections established (${successfulConnections} successful, ${failedConnections} failed)`);
  console.log('Running test...\n');

  // Run for specified duration
  await new Promise(resolve => setTimeout(resolve, DURATION * 1000));

  // Close all connections
  console.log('\nClosing connections...');
  for (const [id, stat] of stats.entries()) {
    // Connections will close naturally
  }

  // Wait a bit for cleanup
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Print results
  printResults();
}

function printResults() {
  const totalMessagesSent = Array.from(stats.values()).reduce(
    (sum, s) => sum + s.messagesSent,
    0
  );
  const totalMessagesReceived = Array.from(stats.values()).reduce(
    (sum, s) => sum + s.messagesReceived,
    0
  );
  const totalErrors = Array.from(stats.values()).reduce(
    (sum, s) => sum + s.errors,
    0
  );
  const totalSigned = Array.from(stats.values()).reduce(
    (sum, s) => sum + s.signedMessages,
    0
  );
  const totalUnsigned = Array.from(stats.values()).reduce(
    (sum, s) => sum + s.unsignedMessages,
    0
  );
  const totalInvalidSigs = Array.from(stats.values()).reduce(
    (sum, s) => sum + s.invalidSignatures,
    0
  );

  const allLatencies = Array.from(stats.values())
    .flatMap(s => s.latencies)
    .sort((a, b) => a - b);

  const avgLatency =
    allLatencies.length > 0
      ? allLatencies.reduce((sum, l) => sum + l, 0) / allLatencies.length
      : 0;
  const p50Latency =
    allLatencies.length > 0
      ? allLatencies[Math.floor(allLatencies.length * 0.5)]
      : 0;
  const p95Latency =
    allLatencies.length > 0
      ? allLatencies[Math.floor(allLatencies.length * 0.95)]
      : 0;
  const p99Latency =
    allLatencies.length > 0
      ? allLatencies[Math.floor(allLatencies.length * 0.99)]
      : 0;

  const actualDuration = (Date.now() - globalStartTime) / 1000;
  const msgPerSec = totalMessagesSent / actualDuration;
  const receivedPerSec = totalMessagesReceived / actualDuration;

  console.log('\n📊 Load Test Results');
  console.log('========================================');
  console.log(`Duration: ${actualDuration.toFixed(2)}s`);
  console.log(`Connections: ${successfulConnections}/${CONNECTIONS} successful`);
  console.log(`Messages Sent: ${totalMessagesSent} (${msgPerSec.toFixed(2)} msg/sec)`);
  console.log(`Messages Received: ${totalMessagesReceived} (${receivedPerSec.toFixed(2)} msg/sec)`);
  console.log(`Errors: ${totalErrors}`);
  console.log(`Success Rate: ${totalMessagesReceived > 0 ? ((totalMessagesReceived / totalMessagesSent) * 100).toFixed(2) : 0}%`);
  console.log('\nMessage Signature Statistics:');
  console.log(`  Signed Messages: ${totalSigned}`);
  console.log(`  Unsigned Messages: ${totalUnsigned}`);
  console.log(`  Invalid Signatures: ${totalInvalidSigs}`);
  console.log('\nLatency Statistics:');
  console.log(`  Average: ${avgLatency.toFixed(2)}ms`);
  console.log(`  P50: ${p50Latency.toFixed(2)}ms`);
  console.log(`  P95: ${p95Latency.toFixed(2)}ms`);
  console.log(`  P99: ${p99Latency.toFixed(2)}ms`);
  console.log('========================================\n');

  // Check metrics endpoint
  try {
    const url = new URL(WS_URL);
    const metricsUrl = `http://${url.host}/metrics`;
    console.log(`💡 Tip: Check service metrics at ${metricsUrl}`);
  } catch {
    // Ignore URL parse errors
  }
}

// Run the test
runLoadTest().catch((err) => {
  console.error('Load test failed:', err);
  process.exit(1);
});

