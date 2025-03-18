// MCP Tool for IFoilStructs
import { createPublicClient, http, createWalletClient } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
// Configure viem clients
const publicClient = createPublicClient({
    chain: base,
    transport: http()
});
// Get private key from environment
const privateKey = process.env.PRIVATE_KEY;
const hasPrivateKey = !!privateKey;
const walletClient = hasPrivateKey ? createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: base,
    transport: http()
}) : null;
// MCP Tool Definitions
export const IFoilStructsTools = {};
