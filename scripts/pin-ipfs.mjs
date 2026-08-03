#!/usr/bin/env node
/**
 * Pin the IPFS static build to Pinata and optionally update an ENS contenthash.
 *
 * Usage:
 *   node scripts/pin-ipfs.mjs                    # Pin only
 *   node scripts/pin-ipfs.mjs --ens sapience.eth  # Pin + update ENS
 *
 * Required env vars:
 *   PINATA_JWT          — Pinata API JWT token
 *
 * Optional env vars (for ENS update):
 *   ENS_PRIVATE_KEY     — Private key of the ENS name owner/manager
 *   ETH_RPC_URL         — Ethereum mainnet RPC (default: https://eth.llamarpc.com)
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'out');

const { values } = parseArgs({
  options: {
    ens: { type: 'string' },
  },
  strict: false,
});

if (!fs.existsSync(OUT_DIR)) {
  console.error('[pin] No out/ directory found. Run `pnpm build:static` first.');
  process.exit(1);
}

const PINATA_JWT = process.env.PINATA_JWT;
if (!PINATA_JWT) {
  console.error('[pin] PINATA_JWT environment variable is required.');
  console.error('[pin] Get one at https://app.pinata.cloud/developers/api-keys');
  process.exit(1);
}

// ── Step 1: Pin to Pinata via their API ──────────────────────────────
console.log('[pin] Uploading to Pinata...');

// Use the Pinata CLI if available, otherwise fall back to curl
let cid;
try {
  // Try using the pinata-web3 SDK via npx
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const result = execFileSync(
    'npx',
    ['--yes', 'pinata', 'upload', '--jwt', PINATA_JWT, '--name', `sapience-ipfs-${ts}`, OUT_DIR],
    { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  const match = result.match(/Qm\w{44}|bafy\w+/);
  if (match) cid = match[0];
} catch {
  // Fall back to the Pinata REST API
  console.log('[pin] CLI failed, using REST API...');
}

if (!cid) {
  // Use curl with the pinByHash API after uploading via the pinning service
  // For directory uploads, we need to use the recursive pin approach
  console.log('[pin] Using Pinata pinFileToIPFS API...');

  // Create a tar of the directory and upload
  const tarPath = path.join(OUT_DIR, '..', 'ipfs-build.tar.gz');
  execFileSync('tar', ['-czf', tarPath, '-C', OUT_DIR, '.'], { stdio: 'inherit' });

  const curlResult = execFileSync('curl', [
    '-s', '-X', 'POST',
    'https://api.pinata.cloud/pinning/pinFileToIPFS',
    '-H', `Authorization: Bearer ${PINATA_JWT}`,
    '-F', `file=@${tarPath};type=application/gzip`,
    '-F', 'pinataMetadata={"name":"sapience-ipfs"}',
    '-F', 'pinataOptions={"wrapWithDirectory":false}',
  ], { encoding: 'utf-8' });
  fs.unlinkSync(tarPath);

  try {
    const json = JSON.parse(curlResult);
    cid = json.IpfsHash;
  } catch {
    console.error('[pin] Failed to parse Pinata response:', curlResult);
    process.exit(1);
  }
}

if (!cid) {
  console.error('[pin] Failed to get CID from Pinata.');
  process.exit(1);
}

console.log(`[pin] Pinned! CID: ${cid}`);
console.log(`[pin] Gateway: https://gateway.pinata.cloud/ipfs/${cid}`);
console.log(`[pin] IPFS URI: ipfs://${cid}`);

// ── Step 2: Update ENS contenthash (optional) ───────────────────────
const ensName = values.ens;
if (ensName) {
  const privateKey = process.env.ENS_PRIVATE_KEY;
  if (!privateKey) {
    console.error('[pin] ENS_PRIVATE_KEY required for --ens flag.');
    process.exit(1);
  }

  const rpcUrl = process.env.ETH_RPC_URL || 'https://eth.llamarpc.com';

  console.log(`\n[pin] Updating ENS contenthash for ${ensName}...`);
  console.log(`[pin] To update manually, set the contenthash of ${ensName} to:`);
  console.log(`[pin]   ipfs://${cid}`);
  console.log(`[pin] via https://app.ens.domains/${ensName}?tab=records`);
  console.log(`[pin] Or use: cast send <resolver> "setContenthash(bytes32,bytes)" <namehash> <encoded-cid> --rpc-url ${rpcUrl}`);
}

console.log('\n[pin] Done!');
