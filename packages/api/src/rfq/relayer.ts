import type { HexString } from './types';

export async function relayRawSignedTx(
  rawSignedTx: HexString
): Promise<{ txHash: HexString } | { error: string }> {
  // MVP stub: do nothing and return a placeholder
  if (!rawSignedTx || !rawSignedTx.startsWith('0x'))
    return { error: 'invalid_raw_tx' };
  const fakeHash = `0x${'deadbeef'.padEnd(64, '0')}` as HexString;
  return { txHash: fakeHash };
}
