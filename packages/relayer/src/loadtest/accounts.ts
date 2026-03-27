/**
 * Pre-generated viem account pool with monotonic nonce counters.
 */

import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import type { Hex } from 'viem';

export interface LoadTestAccount {
  key: Hex;
  account: ReturnType<typeof privateKeyToAccount>;
  nonce: number;
}

export function nextNonce(acct: LoadTestAccount): number {
  return acct.nonce++;
}

function createAccount(): LoadTestAccount {
  const key = generatePrivateKey();
  return {
    key,
    account: privateKeyToAccount(key),
    nonce: 0,
  };
}

export interface AccountPool {
  predictors: LoadTestAccount[];
  counterparties: LoadTestAccount[];
}

export function createAccountPool(
  predictorCount = 50,
  counterpartyCount = 200
): AccountPool {
  const predictors: LoadTestAccount[] = [];
  const counterparties: LoadTestAccount[] = [];

  for (let i = 0; i < predictorCount; i++) {
    predictors.push(createAccount());
  }
  for (let i = 0; i < counterpartyCount; i++) {
    counterparties.push(createAccount());
  }

  return { predictors, counterparties };
}

export function randomPredictor(pool: AccountPool): LoadTestAccount {
  return pool.predictors[Math.floor(Math.random() * pool.predictors.length)];
}

export function randomCounterparty(pool: AccountPool): LoadTestAccount {
  return pool.counterparties[
    Math.floor(Math.random() * pool.counterparties.length)
  ];
}
