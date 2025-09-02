export type HexString = `0x${string}`;

export interface RfqRequestPayload {
  rfqId: string;
  wager: string; // wei string
  predictedOutcomes: string[]; // Array of bytes strings that the resolver validates/understands
  resolver: string; // contract address for market validation
}

export interface BidQuote {
  expirationTimestamp: number; // unix seconds
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

export interface MintParlayData {
  taker: string; // EOA
  takerWager: string; // wei string
  takerPermitSignature: string; // ERC20 permit signature
  takerBidSignature: string; // Taker's signature allowing this specific bid
}

export type BidFill = BidFillRawTx | BidFillCallData | MintParlayData;

export interface BidPayload {
  rfqId: string;
  taker: string; // EOA
  expirationTimestamp: number; // unix seconds
  takerWager: string; // wei string
  takerPermitSignature: string; // ERC20 permit signature
  takerBidSignature: string; // Taker's signature allowing this specific bid
}

export interface ValidatedBid extends BidPayload {
  bidId: string;
}

export type ClientToServerMessage = {
  type: 'rfq.request';
  payload: RfqRequestPayload;
};

export type BotToServerMessage = { type: 'bid.submit'; payload: BidPayload };

export type ServerToClientMessage =
  | { type: 'rfq.ack'; payload: { rfqId: string } }
  | { type: 'bid.ack'; payload: { bidId?: string; error?: string } }
  | { type: 'rfq.bids'; payload: { rfqId: string; bids: ValidatedBid[] } }
  | { type: 'rfq.requested'; payload: RfqRequestPayload };
