/**
 * Timestamped logging utilities
 *
 * Railway doesn't sort logs that happen in the same second,
 * so we include millisecond-precision timestamps.
 */

function timestamp(): string {
  return new Date().toISOString();
}

export function log(...args: unknown[]): void {
  console.log(`[${timestamp()}]`, ...args);
}

export function logError(...args: unknown[]): void {
  console.error(`[${timestamp()}]`, ...args);
}

export function logSeparator(scriptName: string, phase: 'START' | 'END'): void {
  const line = '='.repeat(60);
  console.log(`\n${line}`);
  console.log(`[${timestamp()}] ${phase}: ${scriptName}`);
  console.log(`${line}\n`);
}
