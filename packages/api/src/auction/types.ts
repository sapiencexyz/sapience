export type HexString = `0x${string}`;

export interface AuctionRequestPayload {
  wager: string; // wei string
  predictedOutcomes: string[]; // Array of bytes strings that the resolver validates/understands
  resolver: string; // contract address for market validation
  maker: string; // EOA address of the maker initiating the auction
}

export interface BidQuote {
  takerDeadline: number; // unix seconds
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
  takerSignature: string; // Taker's signature allowing this specific bid
}

export type BidFill = BidFillRawTx | BidFillCallData | MintParlayData;

export interface BidPayload {
  auctionId: string;
  taker: string; // Taker's EOA address (0x...)
  takerWager: string; // wei string
  takerDeadline: number; // unix seconds
  takerSignature: string; // Taker's signature authorizing this specific bid over the typed payload
}

export type ValidatedBid = BidPayload;

export type ClientToServerMessage =
  | {
      type: 'auction.start';
      payload: AuctionRequestPayload;
    }
  | {
      type: 'auction.subscribe';
      payload: { auctionId: string };
    };

export type BotToServerMessage = { type: 'bid.submit'; payload: BidPayload };

export type ServerToClientMessage =
  | { type: 'auction.ack'; payload: { auctionId: string } }
  | { type: 'bid.ack'; payload: { error?: string } }
  | {
      type: 'auction.bids';
      payload: { auctionId: string; bids: ValidatedBid[] };
    }
  | {
      type: 'auction.started';
      payload: AuctionRequestPayload & { auctionId: string };
    };
