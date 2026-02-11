/**
 * Production safety utilities
 */

import * as readline from 'readline';
import { DEFAULT_SAPIENCE_API_URL } from '../constants';

/**
 * Check if the given API URL is pointing to production
 */
export function isProductionUrl(apiUrl: string): boolean {
  return apiUrl.includes('api.sapience.xyz');
}

/**
 * Prompt user for confirmation via stdin
 */
async function promptConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Confirm production access if pointing to production without NODE_ENV=production
 *
 * Call this at the start of any script that writes to the API.
 * Exits the process if user declines.
 */
export async function confirmProductionAccess(apiUrl: string = DEFAULT_SAPIENCE_API_URL): Promise<void> {
  const nodeEnv = process.env.NODE_ENV;
  const isProduction = isProductionUrl(apiUrl);

  if (isProduction && nodeEnv !== 'production') {
    console.warn('\n⚠️  WARNING: You are about to access PRODUCTION (api.sapience.xyz)');
    console.warn(`   but NODE_ENV is "${nodeEnv || 'undefined'}" (not "production")\n`);

    const confirmed = await promptConfirmation('Do you want to continue?');

    if (!confirmed) {
      console.log('Aborted.');
      process.exit(0);
    }

    console.log(''); // Empty line for readability
  }
}
