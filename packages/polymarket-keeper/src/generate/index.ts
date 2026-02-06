/**
 * Main entry point for generate-sapience-conditions
 */

import 'dotenv/config';
import { DEFAULT_SAPIENCE_API_URL } from '../constants';
import { validatePrivateKey, confirmProductionAccess } from '../utils';
import { fetchEndingSoonestMarkets } from './market';
import { groupMarkets, exportJSON } from './grouping';
import { printDryRun, submitToAPI } from './api';

// ============ CLI Arguments ============

export interface GenerateCLIOptions {
  dryRun: boolean;
  help: boolean;
}

export function parseArgs(): GenerateCLIOptions {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    help: args.includes('--help') || args.includes('-h'),
  };
}

export function showHelp(): void {
  console.log(`
Usage: tsx generate-sapience-conditions.ts [options]

Fetches markets ending within 7 days from Polymarket and submits them to the Sapience API.

Options:
  --dry-run      Show what would be submitted without actually submitting
  --help, -h     Show this help message

Environment Variables (required for API submission):
  SAPIENCE_API_URL     API URL to submit conditions (default: https://api.sapience.xyz)
  ADMIN_PRIVATE_KEY    64-char hex private key for signing admin requests

Examples:
  # Generate JSON file only
  tsx generate-sapience-conditions.ts

  # Dry run - show what would be submitted
  tsx generate-sapience-conditions.ts --dry-run

  # Fetch and push to API
  SAPIENCE_API_URL=http://localhost:3001 ADMIN_PRIVATE_KEY=abc123... \\
    tsx generate-sapience-conditions.ts
`);
}

// ============ Main ============

export async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  const apiUrl = process.env.SAPIENCE_API_URL || DEFAULT_SAPIENCE_API_URL;
  const rawPrivateKey = process.env.ADMIN_PRIVATE_KEY;

  // Validate and format private key (must be 0x-prefixed hex string)
  let privateKey: `0x${string}` | undefined;
  try {
    privateKey = validatePrivateKey(rawPrivateKey);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const hasAPICredentials = apiUrl && privateKey;

  // Confirm production access early (before any work is done)
  if (hasAPICredentials && !options.dryRun) {
    await confirmProductionAccess(apiUrl);
  }

  try {
    // Fetch Polymarket markets ending within 7 days
    const markets = await fetchEndingSoonestMarkets();

    const sapienceData = await groupMarkets(markets, apiUrl);

    console.log(`Fetched ${sapienceData.metadata.totalConditions} conditions`);

    // Export JSON file
    exportJSON(sapienceData);

    // Dry run mode - just print what would be submitted
    if (options.dryRun) {
      printDryRun(sapienceData);
      return;
    }

    // Submit to API if credentials are available
    if (hasAPICredentials && apiUrl && privateKey) {
      await submitToAPI(apiUrl, privateKey, sapienceData);
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}
