/**
 * Secondary market trade execution utilities.
 *
 * Builds batched calls for `SecondaryMarketEscrow.executeTrade()`:
 *   1. (optional) Approve position tokens → SecondaryMarketEscrow (seller)
 *   2. (optional) Approve collateral → SecondaryMarketEscrow (buyer)
 *   3. SecondaryMarketEscrow.executeTrade(request)
 *
 * The seller calls this after accepting a buyer's bid — same pattern as
 * the predictor calling mint() in the primary market.
 *
 * @module onchain/secondaryTrade
 */

import { encodeFunctionData, erc20Abi } from 'viem';
import type { Address, Hex } from 'viem';
import { secondaryMarketEscrowAbi } from '../abis';

// ─── Types ───────────────────────────────────────────────────────────────────

/** All data needed to build the executeTrade call batch */
export interface ExecuteTradeParams {
  /** Position token being sold */
  token: Address;
  /** Collateral token (payment) */
  collateral: Address;
  /** Seller address */
  seller: Address;
  /** Buyer address */
  buyer: Address;
  /** Amount of position tokens to transfer (wei) */
  tokenAmount: bigint;
  /** Collateral price (wei) */
  price: bigint;
  /** Seller's bitmap nonce */
  sellerNonce: bigint;
  /** Buyer's bitmap nonce */
  buyerNonce: bigint;
  /** Seller's signature deadline (unix seconds) */
  sellerDeadline: bigint;
  /** Buyer's signature deadline (unix seconds) */
  buyerDeadline: bigint;
  /** Seller's EIP-712 TradeApproval signature */
  sellerSignature: Hex;
  /** Buyer's EIP-712 TradeApproval signature */
  buyerSignature: Hex;
  /** Referral code (bytes32, 0x0 if none) */
  refCode: Hex;
  /** Seller session key data (empty '0x' if EOA) */
  sellerSessionKeyData?: Hex;
  /** Buyer session key data (empty '0x' if EOA) */
  buyerSessionKeyData?: Hex;
}

export interface PrepareExecuteTradeCallsParams {
  trade: ExecuteTradeParams;
  /** SecondaryMarketEscrow contract address */
  escrowAddress: Address;
  /** Current position token allowance from seller → escrow (skip approve if sufficient) */
  currentSellerTokenAllowance?: bigint;
  /** Current collateral allowance from buyer → escrow (skip approve if sufficient) */
  currentBuyerCollateralAllowance?: bigint;
  /**
   * Who is submitting the tx? Determines which approvals to include.
   * - 'seller': include position token approve (seller is msg.sender)
   * - 'buyer': include collateral approve (buyer is msg.sender)
   * - 'both': include both (only if same address, shouldn't happen)
   * - 'none': no approvals (pre-approved or relayer submitting)
   */
  approveFor: 'seller' | 'buyer' | 'none';
}

// ─── Call Building ───────────────────────────────────────────────────────────

/**
 * Build the batched calls array for a secondary market trade execution:
 *   1. (optional) Approve position tokens: seller → escrow
 *   2. (optional) Approve collateral: buyer → escrow
 *   3. SecondaryMarketEscrow.executeTrade(request)
 *
 * The seller accepts a bid from the UI, re-signs with the actual buyer,
 * then submits this batch via sendCalls.
 */
export function prepareExecuteTradeCalls(
  params: PrepareExecuteTradeCallsParams
): { to: Address; data: `0x${string}`; value?: bigint }[] {
  const { trade, escrowAddress, approveFor } = params;

  const calls: { to: Address; data: `0x${string}`; value?: bigint }[] = [];

  if (trade.tokenAmount <= 0n || trade.price <= 0n) {
    throw new Error('Invalid trade amounts');
  }

  // 1. Position token approval (seller approves escrow to transfer their tokens)
  if (approveFor === 'seller') {
    const currentAllowance = params.currentSellerTokenAllowance ?? 0n;
    if (currentAllowance < trade.tokenAmount) {
      calls.push({
        to: trade.token,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [escrowAddress, trade.tokenAmount],
        }),
      });
    }
  }

  // 2. Collateral approval (buyer approves escrow to transfer collateral)
  if (approveFor === 'buyer') {
    const currentAllowance = params.currentBuyerCollateralAllowance ?? 0n;
    if (currentAllowance < trade.price) {
      calls.push({
        to: trade.collateral,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [escrowAddress, trade.price],
        }),
      });
    }
  }

  // 3. executeTrade call
  const tradeRequest = {
    token: trade.token,
    collateral: trade.collateral,
    seller: trade.seller,
    buyer: trade.buyer,
    tokenAmount: trade.tokenAmount,
    price: trade.price,
    sellerNonce: trade.sellerNonce,
    buyerNonce: trade.buyerNonce,
    sellerDeadline: trade.sellerDeadline,
    buyerDeadline: trade.buyerDeadline,
    sellerSignature: trade.sellerSignature,
    buyerSignature: trade.buyerSignature,
    refCode: trade.refCode,
    sellerSessionKeyData: (trade.sellerSessionKeyData ?? '0x') as Hex,
    buyerSessionKeyData: (trade.buyerSessionKeyData ?? '0x') as Hex,
  };

  calls.push({
    to: escrowAddress,
    data: encodeFunctionData({
      abi: secondaryMarketEscrowAbi,
      functionName: 'executeTrade',
      args: [tradeRequest],
    }),
  });

  return calls;
}
