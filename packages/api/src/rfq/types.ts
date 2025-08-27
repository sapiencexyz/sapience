export type HexString = `0x${string}`;

export interface PredictedOutcome {
  marketGroup: string;
  marketId: number;
  prediction: boolean;
}

export interface RfqRequestPayload {
  rfqId: string;
  chainId: number;
  collateral: string; // wei string
  minPayout: string; // wei string
  orderExpirationTime: number; // unix seconds
  predictedOutcomes: PredictedOutcome[];
  maker?: string; // EOA
  constraints?: {
    ttlMs?: number;
    maxQuotes?: number;
  };
}

export interface BidQuote {
  payout: string; // wei
  delta: string; // wei
  validUntil: number; // unix seconds
  maxSlippageBps?: number;
}

export interface BidFillRawTx {
  rawSignedTx: HexString; // RLP
}

export interface BidFillCallData {
  callData: {
    to: string;
    data: HexString;
    gas?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    nonce?: string;
  };
  signature?: {
    r: HexString;
    s: HexString;
    v: number;
  };
}

export type BidFill = BidFillRawTx | BidFillCallData;

export interface BidPayload {
  rfqId: string;
  taker: string; // EOA
  quote: BidQuote;
  chainId: number;
  fill: BidFill;
  meta?: { version: string; refCode?: string };
}

export interface ValidatedBid extends BidPayload {
  bidId: string;
  rankingScore: number;
  simResult?: { ok: boolean; reason?: string };
}

export type ClientToServerMessage =
  | { type: 'rfq.request'; payload: RfqRequestPayload }
  | { type: 'rfq.cancel'; payload: { rfqId: string } }
  | { type: 'order.created'; payload: { rfqId: string; requestId: string; txHash?: HexString } };

export type BotToServerMessage = { type: 'bid.submit'; payload: BidPayload };

export type ServerToClientMessage =
  | { type: 'rfq.ack'; payload: { rfqId: string } }
  | { type: 'bid.ack'; payload: { bidId?: string; error?: string } }
  | { type: 'rfq.bids'; payload: { rfqId: string; bids: ValidatedBid[] } }
  | { type: 'rfq.requested'; payload: RfqRequestPayload }
  | { type: 'order.filled'; payload: { requestId: string; txHash: HexString; makerNftTokenId?: string; takerNftTokenId?: string } };


