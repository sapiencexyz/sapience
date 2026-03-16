/**
 * Shared validation helpers used by both escrow and secondary market validation.
 *
 * @module auction/validationUtils
 */

/** Check if a value is a valid Ethereum address (0x + 40 hex chars). */
export function isValidAddress(addr: unknown): addr is string {
  return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

/**
 * Check if a value looks like a valid signature format.
 * Compact ECDSA (EIP-2098) = 64 bytes = "0x" + 128 hex = 130 chars minimum.
 */
export function isValidSignatureFormat(sig: unknown): sig is string {
  return typeof sig === 'string' && sig.startsWith('0x') && sig.length >= 130;
}
