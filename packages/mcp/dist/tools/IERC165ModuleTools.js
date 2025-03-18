// MCP Tool for IERC165Module
import { createPublicClient, http, parseAbi, createWalletClient } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
// Import ABI from Foundry artifacts
import IERC165ModuleABI from '../out/IERC165Module.ast.json';
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
export const IERC165ModuleTools = {
    supportsInterface: {
        description: "Call supportsInterface function on IERC165Module contract",
        parameters: {
            type: "object",
            properties: {
                contractAddress: {
                    type: "string",
                    description: "The address of the contract to interact with"
                },
            },
            required: ["contractAddress"]
        },
        function: async ({ contractAddress }) => {
            try {
                const result = await publicClient.readContract({
                    address: contractAddress,
                    abi: parseAbi(IERC165ModuleABI),
                    functionName: "supportsInterface",
                });
                return { success: true };
            }
            catch (error) {
                return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
            }
        }
    },
};
