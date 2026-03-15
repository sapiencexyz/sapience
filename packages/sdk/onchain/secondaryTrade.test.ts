import { describe, test, expect } from 'vitest';
import { decodeFunctionData, erc20Abi, getAddress } from 'viem';
import type { Address, Hex } from 'viem';
import { secondaryMarketEscrowAbi } from '../abis';
import { prepareExecuteTradeCalls } from './secondaryTrade';
import type { ExecuteTradeParams } from './secondaryTrade';

// ─── Test Constants ──────────────────────────────────────────────────────────

const TOKEN: Address = getAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
const COLLATERAL: Address = getAddress(
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
);
const ESCROW: Address = getAddress(
  '0x3333333333333333333333333333333333333333'
);
const SELLER: Address = getAddress(
  '0x1111111111111111111111111111111111111111'
);
const BUYER: Address = getAddress('0x2222222222222222222222222222222222222222');

const SELLER_SIG: Hex = '0xaaaa';
const BUYER_SIG: Hex = '0xbbbb';
const REF_CODE: Hex =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

function baseTrade(
  overrides: Partial<ExecuteTradeParams> = {}
): ExecuteTradeParams {
  return {
    token: TOKEN,
    collateral: COLLATERAL,
    seller: SELLER,
    buyer: BUYER,
    tokenAmount: 1000n,
    price: 500n,
    sellerNonce: 1n,
    buyerNonce: 2n,
    sellerDeadline: 1700000000n,
    buyerDeadline: 1700000000n,
    sellerSignature: SELLER_SIG,
    buyerSignature: BUYER_SIG,
    refCode: REF_CODE,
    ...overrides,
  };
}

// ─── approveFor='seller' ─────────────────────────────────────────────────────

describe('prepareExecuteTradeCalls', () => {
  describe('approveFor="seller"', () => {
    test('includes token approve call + executeTrade call (2 calls)', () => {
      const calls = prepareExecuteTradeCalls({
        trade: baseTrade(),
        escrowAddress: ESCROW,
        approveFor: 'seller',
      });

      expect(calls).toHaveLength(2);

      // First call is the approve
      const approve = decodeFunctionData({
        abi: erc20Abi,
        data: calls[0].data,
      });
      expect(approve.functionName).toBe('approve');
      expect(approve.args).toEqual([ESCROW, 1000n]);

      // Second call is executeTrade
      const execute = decodeFunctionData({
        abi: secondaryMarketEscrowAbi,
        data: calls[1].data,
      });
      expect(execute.functionName).toBe('executeTrade');
    });

    test('approve targets position token address', () => {
      const calls = prepareExecuteTradeCalls({
        trade: baseTrade(),
        escrowAddress: ESCROW,
        approveFor: 'seller',
      });

      expect(calls[0].to).toBe(TOKEN);
    });

    test('approve amount matches tokenAmount', () => {
      const calls = prepareExecuteTradeCalls({
        trade: baseTrade({ tokenAmount: 9999n }),
        escrowAddress: ESCROW,
        approveFor: 'seller',
      });

      const approve = decodeFunctionData({
        abi: erc20Abi,
        data: calls[0].data,
      });
      expect(approve.args).toEqual([ESCROW, 9999n]);
    });
  });

  // ─── approveFor='buyer' ──────────────────────────────────────────────────

  describe('approveFor="buyer"', () => {
    test('includes collateral approve call + executeTrade call (2 calls)', () => {
      const calls = prepareExecuteTradeCalls({
        trade: baseTrade(),
        escrowAddress: ESCROW,
        approveFor: 'buyer',
      });

      expect(calls).toHaveLength(2);

      const approve = decodeFunctionData({
        abi: erc20Abi,
        data: calls[0].data,
      });
      expect(approve.functionName).toBe('approve');
      expect(approve.args).toEqual([ESCROW, 500n]);

      const execute = decodeFunctionData({
        abi: secondaryMarketEscrowAbi,
        data: calls[1].data,
      });
      expect(execute.functionName).toBe('executeTrade');
    });

    test('approve targets collateral token address', () => {
      const calls = prepareExecuteTradeCalls({
        trade: baseTrade(),
        escrowAddress: ESCROW,
        approveFor: 'buyer',
      });

      expect(calls[0].to).toBe(COLLATERAL);
    });

    test('approve amount matches price', () => {
      const calls = prepareExecuteTradeCalls({
        trade: baseTrade({ price: 7777n }),
        escrowAddress: ESCROW,
        approveFor: 'buyer',
      });

      const approve = decodeFunctionData({
        abi: erc20Abi,
        data: calls[0].data,
      });
      expect(approve.args).toEqual([ESCROW, 7777n]);
    });
  });

  // ─── approveFor='none' ───────────────────────────────────────────────────

  describe('approveFor="none"', () => {
    test('returns only executeTrade call (1 call)', () => {
      const calls = prepareExecuteTradeCalls({
        trade: baseTrade(),
        escrowAddress: ESCROW,
        approveFor: 'none',
      });

      expect(calls).toHaveLength(1);

      const execute = decodeFunctionData({
        abi: secondaryMarketEscrowAbi,
        data: calls[0].data,
      });
      expect(execute.functionName).toBe('executeTrade');
    });

    test('executeTrade targets the escrow address', () => {
      const calls = prepareExecuteTradeCalls({
        trade: baseTrade(),
        escrowAddress: ESCROW,
        approveFor: 'none',
      });

      expect(calls[0].to).toBe(ESCROW);
    });
  });

  // ─── Skips approve when allowance sufficient ─────────────────────────────

  describe('skips approve when allowance sufficient', () => {
    test('seller: skips approve when currentSellerTokenAllowance >= tokenAmount', () => {
      const calls = prepareExecuteTradeCalls({
        trade: baseTrade({ tokenAmount: 1000n }),
        escrowAddress: ESCROW,
        approveFor: 'seller',
        currentSellerTokenAllowance: 1000n,
      });

      expect(calls).toHaveLength(1);
      const execute = decodeFunctionData({
        abi: secondaryMarketEscrowAbi,
        data: calls[0].data,
      });
      expect(execute.functionName).toBe('executeTrade');
    });

    test('seller: skips approve when allowance exceeds tokenAmount', () => {
      const calls = prepareExecuteTradeCalls({
        trade: baseTrade({ tokenAmount: 1000n }),
        escrowAddress: ESCROW,
        approveFor: 'seller',
        currentSellerTokenAllowance: 5000n,
      });

      expect(calls).toHaveLength(1);
    });

    test('seller: includes approve when allowance is less than tokenAmount', () => {
      const calls = prepareExecuteTradeCalls({
        trade: baseTrade({ tokenAmount: 1000n }),
        escrowAddress: ESCROW,
        approveFor: 'seller',
        currentSellerTokenAllowance: 999n,
      });

      expect(calls).toHaveLength(2);
    });

    test('buyer: skips approve when currentBuyerCollateralAllowance >= price', () => {
      const calls = prepareExecuteTradeCalls({
        trade: baseTrade({ price: 500n }),
        escrowAddress: ESCROW,
        approveFor: 'buyer',
        currentBuyerCollateralAllowance: 500n,
      });

      expect(calls).toHaveLength(1);
      const execute = decodeFunctionData({
        abi: secondaryMarketEscrowAbi,
        data: calls[0].data,
      });
      expect(execute.functionName).toBe('executeTrade');
    });

    test('buyer: skips approve when allowance exceeds price', () => {
      const calls = prepareExecuteTradeCalls({
        trade: baseTrade({ price: 500n }),
        escrowAddress: ESCROW,
        approveFor: 'buyer',
        currentBuyerCollateralAllowance: 9999n,
      });

      expect(calls).toHaveLength(1);
    });

    test('buyer: includes approve when allowance is less than price', () => {
      const calls = prepareExecuteTradeCalls({
        trade: baseTrade({ price: 500n }),
        escrowAddress: ESCROW,
        approveFor: 'buyer',
        currentBuyerCollateralAllowance: 499n,
      });

      expect(calls).toHaveLength(2);
    });
  });

  // ─── Throws on invalid amounts ───────────────────────────────────────────

  describe('throws on invalid amounts', () => {
    test('throws when tokenAmount is 0', () => {
      expect(() =>
        prepareExecuteTradeCalls({
          trade: baseTrade({ tokenAmount: 0n }),
          escrowAddress: ESCROW,
          approveFor: 'none',
        })
      ).toThrow('Invalid trade amounts');
    });

    test('throws when price is 0', () => {
      expect(() =>
        prepareExecuteTradeCalls({
          trade: baseTrade({ price: 0n }),
          escrowAddress: ESCROW,
          approveFor: 'none',
        })
      ).toThrow('Invalid trade amounts');
    });

    test('throws when both tokenAmount and price are 0', () => {
      expect(() =>
        prepareExecuteTradeCalls({
          trade: baseTrade({ tokenAmount: 0n, price: 0n }),
          escrowAddress: ESCROW,
          approveFor: 'none',
        })
      ).toThrow('Invalid trade amounts');
    });
  });

  // ─── Approve targets correct token ────────────────────────────────────────

  describe('approve targets correct token', () => {
    test('seller approve targets the position token, not collateral', () => {
      const calls = prepareExecuteTradeCalls({
        trade: baseTrade(),
        escrowAddress: ESCROW,
        approveFor: 'seller',
      });

      expect(calls[0].to).toBe(TOKEN);
      expect(calls[0].to).not.toBe(COLLATERAL);
    });

    test('buyer approve targets the collateral token, not position token', () => {
      const calls = prepareExecuteTradeCalls({
        trade: baseTrade(),
        escrowAddress: ESCROW,
        approveFor: 'buyer',
      });

      expect(calls[0].to).toBe(COLLATERAL);
      expect(calls[0].to).not.toBe(TOKEN);
    });

    test('approve spender is always the escrow address', () => {
      const sellerCalls = prepareExecuteTradeCalls({
        trade: baseTrade(),
        escrowAddress: ESCROW,
        approveFor: 'seller',
      });
      const sellerApprove = decodeFunctionData({
        abi: erc20Abi,
        data: sellerCalls[0].data,
      });
      expect(sellerApprove.args![0]).toBe(ESCROW);

      const buyerCalls = prepareExecuteTradeCalls({
        trade: baseTrade(),
        escrowAddress: ESCROW,
        approveFor: 'buyer',
      });
      const buyerApprove = decodeFunctionData({
        abi: erc20Abi,
        data: buyerCalls[0].data,
      });
      expect(buyerApprove.args![0]).toBe(ESCROW);
    });
  });

  // ─── executeTrade call is always last ─────────────────────────────────────

  describe('executeTrade call is always last', () => {
    test('last call is executeTrade when approveFor="seller"', () => {
      const calls = prepareExecuteTradeCalls({
        trade: baseTrade(),
        escrowAddress: ESCROW,
        approveFor: 'seller',
      });

      const lastCall = calls[calls.length - 1];
      const decoded = decodeFunctionData({
        abi: secondaryMarketEscrowAbi,
        data: lastCall.data,
      });
      expect(decoded.functionName).toBe('executeTrade');
      expect(lastCall.to).toBe(ESCROW);
    });

    test('last call is executeTrade when approveFor="buyer"', () => {
      const calls = prepareExecuteTradeCalls({
        trade: baseTrade(),
        escrowAddress: ESCROW,
        approveFor: 'buyer',
      });

      const lastCall = calls[calls.length - 1];
      const decoded = decodeFunctionData({
        abi: secondaryMarketEscrowAbi,
        data: lastCall.data,
      });
      expect(decoded.functionName).toBe('executeTrade');
      expect(lastCall.to).toBe(ESCROW);
    });

    test('last call is executeTrade when approveFor="none"', () => {
      const calls = prepareExecuteTradeCalls({
        trade: baseTrade(),
        escrowAddress: ESCROW,
        approveFor: 'none',
      });

      const lastCall = calls[calls.length - 1];
      const decoded = decodeFunctionData({
        abi: secondaryMarketEscrowAbi,
        data: lastCall.data,
      });
      expect(decoded.functionName).toBe('executeTrade');
      expect(lastCall.to).toBe(ESCROW);
    });

    test('first call is NOT executeTrade when approval is included', () => {
      const calls = prepareExecuteTradeCalls({
        trade: baseTrade(),
        escrowAddress: ESCROW,
        approveFor: 'seller',
      });

      const firstCall = decodeFunctionData({
        abi: erc20Abi,
        data: calls[0].data,
      });
      expect(firstCall.functionName).toBe('approve');
    });
  });

  // ─── Session key data defaults to '0x' ───────────────────────────────────

  describe('session key data defaults', () => {
    test('sellerSessionKeyData defaults to 0x when not provided', () => {
      const calls = prepareExecuteTradeCalls({
        trade: baseTrade(),
        escrowAddress: ESCROW,
        approveFor: 'none',
      });

      const decoded = decodeFunctionData({
        abi: secondaryMarketEscrowAbi,
        data: calls[0].data,
      });
      const request = (decoded.args as unknown[])[0] as Record<string, unknown>;
      expect(request.sellerSessionKeyData).toBe('0x');
    });

    test('buyerSessionKeyData defaults to 0x when not provided', () => {
      const calls = prepareExecuteTradeCalls({
        trade: baseTrade(),
        escrowAddress: ESCROW,
        approveFor: 'none',
      });

      const decoded = decodeFunctionData({
        abi: secondaryMarketEscrowAbi,
        data: calls[0].data,
      });
      const request = (decoded.args as unknown[])[0] as Record<string, unknown>;
      expect(request.buyerSessionKeyData).toBe('0x');
    });

    test('preserves provided session key data', () => {
      const sellerKeyData: Hex = '0xdeadbeef';
      const buyerKeyData: Hex = '0xcafebabe';

      const calls = prepareExecuteTradeCalls({
        trade: baseTrade({
          sellerSessionKeyData: sellerKeyData,
          buyerSessionKeyData: buyerKeyData,
        }),
        escrowAddress: ESCROW,
        approveFor: 'none',
      });

      const decoded = decodeFunctionData({
        abi: secondaryMarketEscrowAbi,
        data: calls[0].data,
      });
      const request = (decoded.args as unknown[])[0] as Record<string, unknown>;
      expect(request.sellerSessionKeyData).toBe(sellerKeyData);
      expect(request.buyerSessionKeyData).toBe(buyerKeyData);
    });
  });

  // ─── executeTrade calldata correctness ────────────────────────────────────

  describe('executeTrade calldata correctness', () => {
    test('encodes all trade fields into the executeTrade call', () => {
      const trade = baseTrade();
      const calls = prepareExecuteTradeCalls({
        trade,
        escrowAddress: ESCROW,
        approveFor: 'none',
      });

      const decoded = decodeFunctionData({
        abi: secondaryMarketEscrowAbi,
        data: calls[0].data,
      });
      expect(decoded.functionName).toBe('executeTrade');

      const request = (decoded.args as unknown[])[0] as Record<string, unknown>;
      expect(request.token).toBe(TOKEN);
      expect(request.collateral).toBe(COLLATERAL);
      expect(request.seller).toBe(SELLER);
      expect(request.buyer).toBe(BUYER);
      expect(request.tokenAmount).toBe(1000n);
      expect(request.price).toBe(500n);
      expect(request.sellerNonce).toBe(1n);
      expect(request.buyerNonce).toBe(2n);
      expect(request.sellerDeadline).toBe(1700000000n);
      expect(request.buyerDeadline).toBe(1700000000n);
      expect(request.sellerSignature).toBe(SELLER_SIG);
      expect(request.buyerSignature).toBe(BUYER_SIG);
      expect(request.refCode).toBe(REF_CODE);
    });
  });
});
