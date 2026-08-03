import { encodeFunctionData, type Address, type Hex } from 'viem';
import { WUSDE_ABI } from '~/lib/contracts/wusdeAbi';

export interface PlanWithdrawCallsInput {
  /** Amount the user requested in raw collateral (18-decimal) units. */
  rawAmount: bigint;
  /** Native USDe held by the smart account. */
  rawNative: bigint;
  /** Wrapped USDe (wUSDe) held by the smart account. */
  rawWrapped: bigint;
  /** Address that should receive the native USDe (typically the EOA). */
  recipient: Address;
  /** wUSDe contract address on Ethereal. */
  wusdeAddress: Address;
}

export interface WithdrawCall {
  to: Address;
  data: Hex;
  value: bigint;
}

export interface PlanWithdrawCallsResult {
  /** Calls to bundle into a single UserOp. */
  calls: WithdrawCall[];
  /** Effective amount sent — clamped to `rawNative + rawWrapped`. */
  amount: bigint;
  /** Portion of `amount` covered by native USDe (no unwrap). */
  fromNative: bigint;
  /** Portion of `amount` covered by unwrapping wUSDe. */
  fromWrapped: bigint;
}

/**
 * Compose the calls a smart-account withdraw UserOp needs.
 *
 * Spends native USDe first; only unwraps as much wUSDe as required to cover
 * the rest. This minimizes calls when the SA already has native funds sitting
 * alongside wrapped, and avoids a 1-wei overdraw when float→wei rounding
 * pushes `requestedAmount` slightly past the actual balance (we clamp to
 * `rawNative + rawWrapped`).
 */
export function planWithdrawCalls({
  rawAmount,
  rawNative,
  rawWrapped,
  recipient,
  wusdeAddress,
}: PlanWithdrawCallsInput): PlanWithdrawCallsResult {
  const total = rawNative + rawWrapped;
  const amount = rawAmount > total ? total : rawAmount;

  const fromNative = amount <= rawNative ? amount : rawNative;
  const fromWrapped = amount - fromNative;

  const calls: WithdrawCall[] = [];
  if (fromWrapped > 0n) {
    calls.push({
      to: wusdeAddress,
      data: encodeFunctionData({
        abi: WUSDE_ABI,
        functionName: 'withdraw',
        args: [fromWrapped],
      }),
      value: 0n,
    });
  }
  // Native USDe transfer — bare value send, no calldata.
  calls.push({
    to: recipient,
    data: '0x',
    value: amount,
  });

  return { calls, amount, fromNative, fromWrapped };
}
