export type HexString = `0x${string}`;

// EIP-712 typed data for enable signature verification
// This is captured during session creation and passed to the relayer
export interface EnableTypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  types: {
    Enable: readonly { name: string; type: string }[];
  };
  primaryType: 'Enable';
  message: {
    validationId: string;
    nonce: number;
    hook: string;
    validatorData: string;
    hookData: string;
    selectorData: string;
  };
}

export interface AuctionRequestPayload {
  wager: string; // wei string
  predictedOutcomes: string[]; // Array of bytes strings that the resolver validates/understands
  resolver: string; // contract address for market validation
  taker: string; // EOA or smart account address of the taker initiating the auction
  takerNonce: number; // nonce for the taker
  chainId: number; // chain ID for the auction (e.g., 42161 for Arbitrum)
  takerSignature?: string; // EIP-191 signature of the taker (optional for price discovery)
  takerSignedAt?: string; // ISO timestamp when the signature was created (required if takerSignature is provided)
  sessionApproval?: string; // ZeroDev session approval (base64) for smart account session authentication
  sessionTypedData?: EnableTypedData; // EIP-712 typed data for enable signature verification (session key is extracted from validatorData)
}

export interface BidQuote {
  makerDeadline: number; // unix seconds
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
  maker: string; // Maker's EOA or smart account address (0x...) - the bidding party
  makerWager: string; // wei string
  makerDeadline: number; // unix seconds
  makerSignature: string; // Maker's signature authorizing this specific bid over the typed payload
  makerNonce: number; // nonce for the maker (bidding party)
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
    }
  | {
      type: 'auction.unsubscribe';
      payload: { auctionId: string };
    };

export type BotToServerMessage = { type: 'bid.submit'; payload: BidPayload };

export type ServerToClientMessage =
  | {
      type: 'auction.ack';
      payload: {
        auctionId?: string;
        id?: string;
        error?: string;
        subscribed?: boolean;
        unsubscribed?: boolean;
      };
    }
  | { type: 'bid.ack'; payload: { error?: string } }
  | {
      type: 'auction.bids';
      payload: { auctionId: string; bids: ValidatedBid[] };
    }
  | {
      type: 'auction.started';
      payload: AuctionRequestPayload & { auctionId: string };
    };
