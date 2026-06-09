import { describe, expect, it } from 'vitest';

import { isSessionPolicyError } from './handleViemError';

describe('isSessionPolicyError', () => {
  it('detects the existing AA23 + param-rule session policy failure', () => {
    expect(
      isSessionPolicyError(
        new Error(
          'UserOperation reverted during simulation with reason: AA23 reverted: CallViolatesParamRule(0x59d52e40)'
        )
      )
    ).toBe(true);
  });

  it('detects account-validation failures for unauthorized target contracts', () => {
    expect(
      isSessionPolicyError(
        new Error(
          'account validation reverted: target contract not authorized by current session'
        )
      )
    ).toBe(true);
  });

  it('does not classify broad account-validation errors as session policy errors', () => {
    expect(
      isSessionPolicyError(new Error('AA23 reverted: invalid signature'))
    ).toBe(false);
  });

  it('does not classify policy-looking messages outside user-op validation', () => {
    expect(
      isSessionPolicyError(new Error('target contract not authorized'))
    ).toBe(false);
  });

  it("does not treat a target contract's own authorization revert as a session policy error", () => {
    // A called contract's own access control reverts during simulation with the
    // same "not authorized" wording. Without a session-specific marker this must
    // NOT tear down the session.
    expect(
      isSessionPolicyError(
        new Error(
          'UserOperation reverted during simulation with reason: execution reverted: Ownable: caller is not authorized'
        )
      )
    ).toBe(false);
  });

  it('does not classify generic ERC20-style authorization reverts as session policy errors', () => {
    expect(
      isSessionPolicyError(
        new Error('AA23 reverted: ERC20: transfer amount not authorized')
      )
    ).toBe(false);
  });

  it('still detects generic authorization failures that reference the session', () => {
    expect(
      isSessionPolicyError(
        new Error(
          'AA23 reverted: call not authorized by the current session policy'
        )
      )
    ).toBe(true);
  });
});
