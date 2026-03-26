import { createServer, type Server } from 'http';
import WebSocket from 'ws';
import { createAuctionWebSocketServer } from '../ws';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import {
  buildAuctionIntentTypedData,
  buildCounterpartyMintTypedData,
} from '@sapience/sdk/auction/escrowSigning';
import { predictionMarketEscrow } from '@sapience/sdk/contracts/addresses';
import type { AuctionRFQPayload, BidPayload } from '../escrowTypes';
import type { Address, Hex } from 'viem';
import type { Pick } from '@sapience/sdk/types';

// ============================================================================
// Constants
// ============================================================================

export const TEST_CHAIN_ID = 5064014;
export const TEST_ESCROW_ADDRESS = predictionMarketEscrow[TEST_CHAIN_ID]
  ?.address as Address;
export const TEST_PICK: Pick = {
  conditionResolver: '0x1234567890123456789012345678901234567890' as Address,
  conditionId: ('0x' + 'ab'.repeat(32)) as Hex,
  predictedOutcome: 0,
};

// ============================================================================
// Server helpers
// ============================================================================

/**
 * Create an HTTP + WebSocket server on a random port for testing.
 * Returns the server instances, port, and a cleanup function.
 */
export async function createTestServer(): Promise<{
  httpServer: Server;
  wss: ReturnType<typeof createAuctionWebSocketServer>;
  port: number;
  cleanup: () => Promise<void>;
}> {
  const httpServer = createServer();
  const wss = createAuctionWebSocketServer();

  httpServer.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  const port = await new Promise<number>((resolve) => {
    httpServer.listen(0, () => {
      const addr = httpServer.address();
      resolve(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });

  const cleanup = async () => {
    for (const client of wss.clients) {
      client.close();
    }
    await new Promise<void>((resolve) => {
      wss.close(() => {
        httpServer.close(() => resolve());
      });
    });
  };

  return { httpServer, wss, port, cleanup };
}

// ============================================================================
// Client helpers
// ============================================================================

/**
 * Connect a WebSocket client to the test server's /auction endpoint.
 */
export function createClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/auction`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

// ============================================================================
// Message helpers
// ============================================================================

/**
 * Wait for a message of a specific type on the given WebSocket.
 * Resolves with the parsed message or rejects on timeout.
 */
export function waitForMessage(
  ws: WebSocket,
  expectedType: string,
  timeout = 5000
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error(`Timeout waiting for message type: ${expectedType}`));
    }, timeout);

    const handler = (data: WebSocket.RawData) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === expectedType) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    };

    ws.on('message', handler);
  });
}

/**
 * Assert that no message of the given type arrives within `ms` milliseconds.
 * Resolves if no matching message is received; rejects if one is.
 */
export function expectNoMessage(
  ws: WebSocket,
  type: string,
  ms = 500
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', handler);
      resolve();
    }, ms);

    const handler = (data: WebSocket.RawData) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === type) {
        clearTimeout(timer);
        ws.off('message', handler);
        reject(
          new Error(
            `Expected no message of type "${type}" but received one: ${JSON.stringify(msg)}`
          )
        );
      }
    };

    ws.on('message', handler);
  });
}

/**
 * Send a JSON message and wait for a response of the given type.
 */
export async function sendAndWait(
  ws: WebSocket,
  message: unknown,
  responseType: string
): Promise<unknown> {
  const responsePromise = waitForMessage(ws, responseType);
  ws.send(JSON.stringify(message));
  return responsePromise;
}

// ============================================================================
// Auction helpers
// ============================================================================

/**
 * Start a valid auction with a real EIP-712 AuctionIntent signature.
 *
 * Generates a fresh predictor key (or uses an override), builds the full
 * AuctionRFQPayload, signs it, sends `auction.start`, and waits for
 * `auction.ack`.
 */
export async function startAuction(
  ws: WebSocket,
  overrides?: Partial<AuctionRFQPayload> & {
    predictorPrivateKey?: Hex;
  }
): Promise<{
  auctionId: string;
  auction: AuctionRFQPayload;
  predictorAccount: ReturnType<typeof privateKeyToAccount>;
}> {
  const predictorKey = overrides?.predictorPrivateKey ?? generatePrivateKey();
  const predictorAccount = privateKeyToAccount(predictorKey);

  const nonce =
    overrides?.predictorNonce ?? Math.floor(Math.random() * 1_000_000);
  const deadline =
    overrides?.predictorDeadline ?? Math.floor(Date.now() / 1000) + 3600;
  const collateral = overrides?.predictorCollateral ?? '1000000000000000000';
  const picks = overrides?.picks ?? [
    {
      conditionResolver: TEST_PICK.conditionResolver,
      conditionId: TEST_PICK.conditionId,
      predictedOutcome: TEST_PICK.predictedOutcome,
    },
  ];

  // Build the SDK-typed picks for signing (Address/Hex)
  const sdkPicks: Pick[] = picks.map((p) => ({
    conditionResolver: p.conditionResolver as Address,
    conditionId: p.conditionId as Hex,
    predictedOutcome: p.predictedOutcome,
  }));

  // Build & sign the AuctionIntent EIP-712 typed data
  const typedData = buildAuctionIntentTypedData({
    picks: sdkPicks,
    predictor: predictorAccount.address,
    predictorCollateral: BigInt(collateral),
    predictorNonce: BigInt(nonce),
    predictorDeadline: BigInt(deadline),
    verifyingContract: TEST_ESCROW_ADDRESS,
    chainId: TEST_CHAIN_ID,
  });

  const intentSignature = await predictorAccount.signTypedData({
    domain: {
      ...typedData.domain,
      chainId: Number(typedData.domain.chainId),
    },
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  });

  const auction: AuctionRFQPayload = {
    picks,
    predictorCollateral: collateral,
    predictor: predictorAccount.address,
    predictorNonce: nonce,
    predictorDeadline: deadline,
    intentSignature,
    chainId: overrides?.chainId ?? TEST_CHAIN_ID,
    ...(overrides?.refCode !== undefined && { refCode: overrides.refCode }),
    ...(overrides?.predictorSessionKeyData !== undefined && {
      predictorSessionKeyData: overrides.predictorSessionKeyData,
    }),
    ...(overrides?.predictorSponsor !== undefined && {
      predictorSponsor: overrides.predictorSponsor,
    }),
    ...(overrides?.predictorSponsorData !== undefined && {
      predictorSponsorData: overrides.predictorSponsorData,
    }),
    ...(overrides?.counterpartyCollateral !== undefined && {
      counterpartyCollateral: overrides.counterpartyCollateral,
    }),
  };

  const response = (await sendAndWait(
    ws,
    { type: 'auction.start', payload: auction },
    'auction.ack'
  )) as { payload: { auctionId: string; error?: string } };

  if (response.payload.error) {
    throw new Error(`auction.start failed: ${response.payload.error}`);
  }

  return {
    auctionId: response.payload.auctionId,
    auction,
    predictorAccount,
  };
}

// ============================================================================
// Bid helpers
// ============================================================================

/**
 * Create a bid with a REAL EIP-712 counterparty MintApproval signature.
 *
 * Takes auction details (picks, predictor, predictorCollateral, chainId) and
 * a counterparty account, builds the counterparty mint typed data, signs it,
 * and returns a valid BidPayload.
 */
export async function createSignedBid(
  auctionDetails: {
    auctionId: string;
    picks: {
      conditionResolver: string;
      conditionId: string;
      predictedOutcome: number;
    }[];
    predictor: string;
    predictorCollateral: string;
    chainId: number;
  },
  counterpartyAccount: ReturnType<typeof privateKeyToAccount>,
  overrides?: Partial<Omit<BidPayload, 'auctionId'>>
): Promise<BidPayload> {
  const counterpartyCollateral =
    overrides?.counterpartyCollateral ?? '500000000000000000';
  const counterpartyNonce =
    overrides?.counterpartyNonce ?? Math.floor(Math.random() * 1_000_000);
  const counterpartyDeadline =
    overrides?.counterpartyDeadline ?? Math.floor(Date.now() / 1000) + 3600;

  // Build SDK-typed picks for the signing helper
  const sdkPicks: Pick[] = auctionDetails.picks.map((p) => ({
    conditionResolver: p.conditionResolver as Address,
    conditionId: p.conditionId as Hex,
    predictedOutcome: p.predictedOutcome,
  }));

  // Build the counterparty MintApproval EIP-712 typed data
  const typedData = buildCounterpartyMintTypedData({
    picks: sdkPicks,
    predictorCollateral: BigInt(auctionDetails.predictorCollateral),
    counterpartyCollateral: BigInt(counterpartyCollateral),
    predictor: auctionDetails.predictor as Address,
    counterparty: counterpartyAccount.address,
    counterpartyNonce: BigInt(counterpartyNonce),
    counterpartyDeadline: BigInt(counterpartyDeadline),
    verifyingContract: TEST_ESCROW_ADDRESS,
    chainId: auctionDetails.chainId,
  });

  const counterpartySignature = await counterpartyAccount.signTypedData({
    domain: {
      ...typedData.domain,
      chainId: Number(typedData.domain.chainId),
    },
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  });

  return {
    auctionId: auctionDetails.auctionId,
    counterparty: overrides?.counterparty ?? counterpartyAccount.address,
    counterpartyCollateral,
    counterpartyNonce,
    counterpartyDeadline,
    counterpartySignature,
    ...(overrides?.counterpartySessionKeyData !== undefined && {
      counterpartySessionKeyData: overrides.counterpartySessionKeyData,
    }),
  };
}
