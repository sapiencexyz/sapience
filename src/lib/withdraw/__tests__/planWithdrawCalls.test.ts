import { describe, expect, it } from 'vitest';
import { decodeFunctionData, parseEther, type Address } from 'viem';
import { WUSDE_ABI } from '~/lib/contracts/wusdeAbi';
import { planWithdrawCalls } from '~/lib/withdraw/planWithdrawCalls';

const WUSDE: Address = '0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D';
const EOA: Address = '0x0000000000000000000000000000000000000001';

describe('planWithdrawCalls', () => {
  it('all-native: single transfer call, no unwrap', () => {
    const result = planWithdrawCalls({
      rawAmount: parseEther('5'),
      rawNative: parseEther('10'),
      rawWrapped: 0n,
      recipient: EOA,
      wusdeAddress: WUSDE,
    });

    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]).toEqual({
      to: EOA,
      data: '0x',
      value: parseEther('5'),
    });
    expect(result.fromNative).toBe(parseEther('5'));
    expect(result.fromWrapped).toBe(0n);
    expect(result.amount).toBe(parseEther('5'));
  });

  it('all-wrapped: unwraps then transfers', () => {
    const result = planWithdrawCalls({
      rawAmount: parseEther('3'),
      rawNative: 0n,
      rawWrapped: parseEther('5'),
      recipient: EOA,
      wusdeAddress: WUSDE,
    });

    expect(result.calls).toHaveLength(2);
    expect(result.calls[0].to).toBe(WUSDE);
    expect(result.calls[0].value).toBe(0n);
    const decoded = decodeFunctionData({
      abi: WUSDE_ABI,
      data: result.calls[0].data,
    });
    expect(decoded.functionName).toBe('withdraw');
    expect(decoded.args).toEqual([parseEther('3')]);

    expect(result.calls[1]).toEqual({
      to: EOA,
      data: '0x',
      value: parseEther('3'),
    });
    expect(result.fromNative).toBe(0n);
    expect(result.fromWrapped).toBe(parseEther('3'));
  });

  it('mixed: spends native first, unwraps only the deficit', () => {
    const result = planWithdrawCalls({
      rawAmount: parseEther('7'),
      rawNative: parseEther('4'),
      rawWrapped: parseEther('10'),
      recipient: EOA,
      wusdeAddress: WUSDE,
    });

    expect(result.fromNative).toBe(parseEther('4'));
    expect(result.fromWrapped).toBe(parseEther('3'));
    expect(result.calls).toHaveLength(2);
    const decoded = decodeFunctionData({
      abi: WUSDE_ABI,
      data: result.calls[0].data,
    });
    expect(decoded.args).toEqual([parseEther('3')]);
    expect(result.calls[1].value).toBe(parseEther('7'));
  });

  it('clamps requested amount to (native + wrapped) — guards 1-wei overdraw', () => {
    const max = parseEther('5') + parseEther('3');
    const result = planWithdrawCalls({
      rawAmount: max + 1n,
      rawNative: parseEther('5'),
      rawWrapped: parseEther('3'),
      recipient: EOA,
      wusdeAddress: WUSDE,
    });
    expect(result.amount).toBe(max);
    expect(result.calls[result.calls.length - 1].value).toBe(max);
  });

  it('exactly equal to native balance: no unwrap call', () => {
    const result = planWithdrawCalls({
      rawAmount: parseEther('2'),
      rawNative: parseEther('2'),
      rawWrapped: parseEther('5'),
      recipient: EOA,
      wusdeAddress: WUSDE,
    });
    expect(result.calls).toHaveLength(1);
    expect(result.fromWrapped).toBe(0n);
  });
});
