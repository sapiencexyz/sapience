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
});
