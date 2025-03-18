// MCP Tool for IUMASettlementModule
import { createPublicClient, http, parseAbi, encodeFunctionData, createWalletClient } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
// Import ABI from Foundry artifacts
import IUMASettlementModuleABI from '../out/IUMASettlementModule.ast.json';
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
export const IUMASettlementModuleTools = {
    submitSettlementPrice: {
        description: "Call submitSettlementPrice function on IUMASettlementModule contract",
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
            if (!hasPrivateKey) {
                return { error: "Write operations require PRIVATE_KEY environment variable" };
            }
            try {
                // Prepare transaction data
                const data = encodeFunctionData({
                    abi: parseAbi(IUMASettlementModuleABI),
                    functionName: "submitSettlementPrice",
                });
                // Send transaction
                const hash = await walletClient.writeContract({
                    address: contractAddress,
                    abi: parseAbi(IUMASettlementModuleABI),
                    functionName: "submitSettlementPrice",
                });
                // Wait for transaction
                const receipt = await publicClient.waitForTransactionReceipt({ hash });
                return {
                    hash,
                    receipt,
                    description: `Called submitSettlementPrice on ${contractAddress}`
                };
            }
            catch (error) {
                return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
            }
        }
    },
    assertionResolvedCallback: {
        description: "Call assertionResolvedCallback function on IUMASettlementModule contract",
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
            if (!hasPrivateKey) {
                return { error: "Write operations require PRIVATE_KEY environment variable" };
            }
            try {
                // Prepare transaction data
                const data = encodeFunctionData({
                    abi: parseAbi(IUMASettlementModuleABI),
                    functionName: "assertionResolvedCallback",
                });
                // Send transaction
                const hash = await walletClient.writeContract({
                    address: contractAddress,
                    abi: parseAbi(IUMASettlementModuleABI),
                    functionName: "assertionResolvedCallback",
                });
                // Wait for transaction
                const receipt = await publicClient.waitForTransactionReceipt({ hash });
                return {
                    hash,
                    receipt,
                    description: `Called assertionResolvedCallback on ${contractAddress}`
                };
            }
            catch (error) {
                return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
            }
        }
    },
    assertionDisputedCallback: {
        description: "Call assertionDisputedCallback function on IUMASettlementModule contract",
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
            if (!hasPrivateKey) {
                return { error: "Write operations require PRIVATE_KEY environment variable" };
            }
            try {
                // Prepare transaction data
                const data = encodeFunctionData({
                    abi: parseAbi(IUMASettlementModuleABI),
                    functionName: "assertionDisputedCallback",
                });
                // Send transaction
                const hash = await walletClient.writeContract({
                    address: contractAddress,
                    abi: parseAbi(IUMASettlementModuleABI),
                    functionName: "assertionDisputedCallback",
                });
                // Wait for transaction
                const receipt = await publicClient.waitForTransactionReceipt({ hash });
                return {
                    hash,
                    receipt,
                    description: `Called assertionDisputedCallback on ${contractAddress}`
                };
            }
            catch (error) {
                return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
            }
        }
    },
};
