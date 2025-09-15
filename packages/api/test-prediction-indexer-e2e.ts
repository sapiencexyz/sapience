/**
 * PredictionMarket Indexer End-to-End Test
 * 
 * This script tests the PredictionMarket contract mint and burn functions
 * and verifies that the indexer correctly captures the events.
 * 
 * Usage:
 *   npm run test:prediction-mint    - Test only the mint function
 *   npm run test:prediction-burn    - Test only the burn function (requires mint first)
 *   npm run test:prediction-both    - Test both mint and burn in sequence
 * 
 * The script saves NFT IDs to test-nft-ids.json between operations,
 * allowing you to run mint and burn tests separately.
 */

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from './generated/prisma';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { 
  createWalletClient, 
  http,
  encodeAbiParameters,
  keccak256,
  toHex,
  decodeEventLog,
  parseAbiParameters,
  getAddress,
  type PublicClient,
  type WalletClient,
  type Account,
  type TransactionReceipt
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';

// Import the WebSocket-based client from utils
import { getProviderForChain } from './src/utils/utils';

// EIP-712 types for signature
const APPROVE_TYPES = {
  Approve: [
    { name: 'messageHash', type: 'bytes32' },
    { name: 'owner', type: 'address' }
  ]
} as const;

// Types for prediction signing
interface PredictionSigningParams {
  encodedPredictedOutcomes: string;
  takerCollateral: bigint;
  makerCollateral: bigint;
  resolver: string;
  maker: string;
  taker: string;
  takerDeadline: number;
  predictionMarketAddress: string;
}

// Environment variables
const TEST_PRIVATE_KEY = process.env.TEST_PRIVATE_KEY;
const PREDICTION_MARKET_CONTRACT_ADDRESS = process.env.PREDICTION_MARKET_CONTRACT_ADDRESS || '0xA5d368857C39267966f2096C4Fb509F3094E4E4a';
const TEST_RESOLVER_ADDRESS = process.env.TEST_RESOLVER_ADDRESS || '0xA0B6d6fd2Fe9E14A34DA49Ca4de7426F6b65667c';

if (!TEST_PRIVATE_KEY) {
  console.error('❌ TEST_PRIVATE_KEY is required. Please set it in your .env file.');
  process.exit(1);
}

// CLI argument parsing
const args = process.argv.slice(2);
const operation = args[0];

if (!operation || !['mint', 'burn', 'both'].includes(operation)) {
  console.error('❌ Please specify operation: mint, burn, or both');
  console.error('Usage: npm run test-prediction-indexer-e2e [mint|burn|both]');
  process.exit(1);
}

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// NFT storage file path
const NFT_STORAGE_FILE = path.join(__dirname, 'test-nft-ids.json');

// Interface for stored NFT data
interface StoredNFTData {
  makerNftTokenId: string;
  takerNftTokenId: string;
  transactionHash: string;
  timestamp: number;
}

// Initialize Prisma
const prisma = new PrismaClient();

// Global variables
let publicClient: PublicClient;
let walletClient: WalletClient;
let account: Account;
let contractConfig: { collateralToken: string; minCollateral: bigint };

// Configuration for signing
const config = {
  chainId: 42161, // Arbitrum
  privateKey: TEST_PRIVATE_KEY,
  rpcUrl: `https://arbitrum-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`
};

// Helper function to get chain from ID
function getChainFromId(chainId: number) {
  switch (chainId) {
    case 42161:
      return arbitrum;
    default:
      throw new Error(`Unsupported chain ID: ${chainId}`);
  }
}

// NFT storage helper functions
function saveNFTData(nftData: StoredNFTData): void {
  try {
    fs.writeFileSync(NFT_STORAGE_FILE, JSON.stringify(nftData, null, 2));
    console.log(`💾 NFT data saved to ${NFT_STORAGE_FILE}`);
  } catch (error) {
    console.error('❌ Failed to save NFT data:', (error as Error).message);
  }
}

function loadNFTData(): StoredNFTData | null {
  try {
    if (!fs.existsSync(NFT_STORAGE_FILE)) {
      return null;
    }
    const data = fs.readFileSync(NFT_STORAGE_FILE, 'utf8');
    return JSON.parse(data) as StoredNFTData;
  } catch (error) {
    console.error('❌ Failed to load NFT data:', (error as Error).message);
    return null;
  }
}

function clearNFTData(): void {
  try {
    if (fs.existsSync(NFT_STORAGE_FILE)) {
      fs.unlinkSync(NFT_STORAGE_FILE);
      console.log('🗑️  NFT data file cleared');
    }
  } catch (error) {
    console.error('❌ Failed to clear NFT data:', (error as Error).message);
  }
}

// PredictionMarket contract ABI
const PREDICTION_MARKET_ABI = [
  {
    type: 'function',
    name: 'mint',
    inputs: [
      {
        name: 'mintPredictionRequestData',
        type: 'tuple',
        components: [
          { name: 'encodedPredictedOutcomes', type: 'bytes' },
          { name: 'resolver', type: 'address' },
          { name: 'makerCollateral', type: 'uint256' },
          { name: 'takerCollateral', type: 'uint256' },
          { name: 'maker', type: 'address' },
          { name: 'taker', type: 'address' },
          { name: 'takerSignature', type: 'bytes' },
          { name: 'takerDeadline', type: 'uint256' },
          { name: 'refCode', type: 'bytes32' }
        ]
      }
    ],
    outputs: [
      { name: 'makerNftTokenId', type: 'uint256' },
      { name: 'takerNftTokenId', type: 'uint256' }
    ],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'burn',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'refCode', type: 'bytes32' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'consolidatePrediction',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'refCode', type: 'bytes32' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'getConfig',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'collateralToken', type: 'address' },
          { name: 'minCollateral', type: 'uint256' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'getApprovalHash',
    inputs: [
      { name: 'messageHash', type: 'bytes32' },
      { name: 'owner', type: 'address' }
    ],
    outputs: [{ name: 'approvalHash', type: 'bytes32' }],
    stateMutability: 'view'
  }
] as const;

// Event ABI for decoding
const PREDICTION_MINTED_EVENT = {
  type: 'event',
  name: 'PredictionMinted',
  inputs: [
    { name: 'maker', type: 'address', indexed: true },
    { name: 'taker', type: 'address', indexed: true },
    { name: 'makerNftTokenId', type: 'uint256', indexed: false },
    { name: 'takerNftTokenId', type: 'uint256', indexed: false },
    { name: 'makerCollateral', type: 'uint256', indexed: false },
    { name: 'takerCollateral', type: 'uint256', indexed: false },
    { name: 'totalCollateral', type: 'uint256', indexed: false },
    { name: 'refCode', type: 'bytes32', indexed: false }
  ]
} as const;


const PREDICTION_BURNED_EVENT = {
  type: 'event',
  name: 'PredictionBurned',
  inputs: [
    { name: 'maker', type: 'address', indexed: true },
    { name: 'taker', type: 'address', indexed: true },
    { name: 'makerNftTokenId', type: 'uint256', indexed: false },
    { name: 'takerNftTokenId', type: 'uint256', indexed: false },
    { name: 'payout', type: 'uint256', indexed: false },
    { name: 'makerWon', type: 'bool', indexed: false },
    { name: 'refCode', type: 'bytes32', indexed: false }
  ]
} as const;


interface PredictionData {
  encodedPredictedOutcomes: string;
  takerSignature: string;
}

async function setup(): Promise<void> {
  console.log('🔧 Setting up test environment...');
  
  // Create account from private key
  account = privateKeyToAccount(TEST_PRIVATE_KEY as `0x${string}`);
  
  // Use the WebSocket-based client from utils
  publicClient = getProviderForChain(42161); // Arbitrum chain ID
  
  // Create wallet client using Infura RPC for consistency
  walletClient = createWalletClient({
    account,
    chain: arbitrum,
    transport: http(`https://arbitrum-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`)
  });

  console.log(`✅ Wallet created for address: ${account.address}`);
  
  // Get contract configuration
  contractConfig = await publicClient.readContract({
    address: PREDICTION_MARKET_CONTRACT_ADDRESS as `0x${string}`,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getConfig'
  });

  console.log('📋 Contract Configuration:');
  console.log(`  Collateral Token: ${contractConfig.collateralToken}`);
  console.log(`  Min Collateral: ${contractConfig.minCollateral.toString()}`);

  // Check balances
  const ethBalance = await publicClient.getBalance({ address: account.address });
  const tokenBalance = await publicClient.readContract({
    address: contractConfig.collateralToken as `0x${string}`,
    abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: 'balance', type: 'uint256' }] }],
    functionName: 'balanceOf',
    args: [account.address]
  });

  console.log(`💰 ETH Balance: ${ethBalance.toString()} ETH`);
  console.log(`💰 Collateral Token Balance: ${tokenBalance.toString()}`);

  // Check and approve collateral tokens
  const allowance = await publicClient.readContract({
    address: contractConfig.collateralToken as `0x${string}`,
    abi: [{ name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: 'allowance', type: 'uint256' }] }],
    functionName: 'allowance',
    args: [account.address, PREDICTION_MARKET_CONTRACT_ADDRESS as `0x${string}`]
  });

  const requiredCollateral = contractConfig.minCollateral * BigInt(4); // maker + taker + buffer
  console.log(`🔐 Collateral Token Allowance: ${allowance.toString()}`);
  
  if (allowance < requiredCollateral) {
    console.log(`🔐 Insufficient allowance. Approving ${requiredCollateral.toString()} tokens...`);
    await walletClient.writeContract({
      address: contractConfig.collateralToken as `0x${string}`,
      abi: [{ name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: 'success', type: 'bool' }] }],
      functionName: 'approve',
      args: [PREDICTION_MARKET_CONTRACT_ADDRESS as `0x${string}`, requiredCollateral],
      account: account,
      chain: arbitrum
    });
    console.log('✅ Collateral tokens approved');
  } else {
    console.log('✅ Sufficient allowance for transaction');
  }
}

async function signPredictionApproval(params: PredictionSigningParams, account: Account): Promise<string> {
  try {
    const chain = getChainFromId(config.chainId);
    
    const walletClient = createWalletClient({
      chain: chain,
      transport: http(config.rpcUrl),
      account: account
    });

    // Step 1: Create the inner message hash (matches PredictionMarket.sol lines 99-108)
    const innerMessageHash = keccak256(
      encodeAbiParameters(
        parseAbiParameters('bytes, uint256, uint256, address, address, uint256'),
        [
          params.encodedPredictedOutcomes as `0x${string}`,
          params.takerCollateral,
          params.makerCollateral,
          getAddress(params.resolver),
          getAddress(params.maker),
          BigInt(params.takerDeadline)
        ]
      )
    );

    console.log(`🔐 [PredictionSigner] Inner message hash: ${innerMessageHash}`);

    // Step 2: Create the EIP-712 domain (matches SignatureProcessor)
    const domain = {
      name: 'SignatureProcessor',
      version: '1',
      chainId: config.chainId,
      verifyingContract: getAddress(params.predictionMarketAddress)
    };

    // Step 3: Create the Approve message structure
    const message = {
      messageHash: innerMessageHash,
      owner: getAddress(params.taker)
    };

    // Step 4: Sign the typed data using the Approve structure
    const signature = await walletClient.signTypedData({
      account,
      domain,
      types: APPROVE_TYPES,
      primaryType: 'Approve',
      message
    });

    console.log(`✅ [PredictionSigner] Signed prediction approval`);
    console.log(`   Taker: ${params.taker}`);
    console.log(`   Maker: ${params.maker}`);
    console.log(`   Taker Collateral: ${params.takerCollateral.toString()}`);
    console.log(`   Maker Collateral: ${params.makerCollateral.toString()}`);
    console.log(`   Deadline: ${params.takerDeadline}`);
    console.log(`   Resolver: ${params.resolver}`);
    
    return signature;

  } catch (error) {
    console.error('❌ [PredictionSigner] Error signing prediction approval:', error);
    throw new Error(`Failed to sign prediction approval: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function createPredictionData(takerDeadline: number): Promise<PredictionData> {
  console.log('🔧 Creating prediction data...');
  
  // Get real active market groups from database
  const nowSeconds = Math.floor(Date.now() / 1000);
  const marketGroups = await prisma.marketGroup.findMany({
    where: { 
      chainId: 42161,
      address: { 
        not: null,
        notIn: ['0x0000000000000000000000000000000000000000']
      }
    },
    include: { 
      market: {
        where: {
          endTimestamp: {
            gt: nowSeconds
          },
          settled: {
            not: true
          }
        }
      }
    },
    take: 1
  });

  let marketGroupAddress: string;
  let marketId: number;

  if (marketGroups.length === 0 || !marketGroups[0].address || marketGroups[0].market.length === 0) {
    // Fallback to a known market group address
    marketGroupAddress = '0xeecfc3deee7d224094807189d2aa818f89d7f000';
    marketId = 1;
    console.log('📋 Using fallback market group (no active markets found in database)');
  } else {
    marketGroupAddress = marketGroups[0].address;
    marketId = marketGroups[0].market[0].marketId;
    console.log(`📋 Using active market group from database: ${marketGroupAddress}`);
    console.log(`📋 Using active market ID: ${marketId}`);
  }

  // Create predicted outcomes
  const predictedOutcomes = [
    {
      market: {
        marketGroup: marketGroupAddress as `0x${string}`,
        marketId: BigInt(marketId)
      },
      prediction: true
    }
  ];

  // Encode the predicted outcomes
  const encodedPredictedOutcomes = encodeAbiParameters(
    [{ name: 'predictedOutcomes', type: 'tuple[]', components: [
      { name: 'market', type: 'tuple', components: [
        { name: 'marketGroup', type: 'address' },
        { name: 'marketId', type: 'uint256' }
      ]},
      { name: 'prediction', type: 'bool' }
    ]}],
    [predictedOutcomes]
  );

  // Create taker signature using EIP-712 typed data signing
  const takerSignature = await signPredictionApproval({
    encodedPredictedOutcomes,
    takerCollateral: contractConfig.minCollateral,
    makerCollateral: contractConfig.minCollateral,
    resolver: TEST_RESOLVER_ADDRESS,
    maker: account.address,
    taker: account.address,
    takerDeadline,
    predictionMarketAddress: PREDICTION_MARKET_CONTRACT_ADDRESS
  }, account);

  return {
    encodedPredictedOutcomes,
    takerSignature
  };
}

async function testMintFunction(): Promise<{ success: boolean; hash?: string; receipt?: TransactionReceipt; error?: string }> {
  console.log('🧪 Testing mint() function...');
  
  try {
    // Define the timestamp once and use it consistently
    const takerDeadline = Math.floor(Date.now() / 1000) + 3600;
    
    // Create prediction data
    const predictionData = await createPredictionData(takerDeadline);
    
    // Create mint parameters
    const mintParams = {
      encodedPredictedOutcomes: predictionData.encodedPredictedOutcomes as `0x${string}`,
      resolver: TEST_RESOLVER_ADDRESS as `0x${string}`,
      makerCollateral: contractConfig.minCollateral,
      takerCollateral: contractConfig.minCollateral,
      maker: account.address,
      taker: account.address,
      takerSignature: predictionData.takerSignature as `0x${string}`,
      takerDeadline: BigInt(takerDeadline),
      refCode: keccak256(toHex('test_mint'))
    };

    console.log('🚀 Attempting to call mint()...');
    
    // Estimate gas first
    try {
      const gasEstimate = await publicClient.estimateContractGas({
        address: PREDICTION_MARKET_CONTRACT_ADDRESS as `0x${string}`,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'mint',
        args: [mintParams],
        account: account.address
      });
      console.log(`⛽ Gas estimate: ${gasEstimate.toString()}`);
    } catch (gasError) {
      console.log('❌ Gas estimation failed:', (gasError as Error).message);
    }
    
    // Send transaction
    let hash: `0x${string}`;
    try {
      hash = await walletClient.writeContract({
        address: PREDICTION_MARKET_CONTRACT_ADDRESS as `0x${string}`,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'mint',
        args: [mintParams],
        account: account,
        chain: arbitrum,
        gas: BigInt(1000000)
      });
      console.log(`✅ Mint transaction sent: ${hash}`);
    } catch (txError) {
      console.log('❌ Transaction sending failed:', (txError as Error).message);
      return { success: false, error: (txError as Error).message };
    }
      
    // Wait for transaction receipt
    let receipt: TransactionReceipt;
    try {
      receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`✅ Mint transaction confirmed in block: ${receipt.blockNumber}`);
    } catch (receiptError) {
      console.log('❌ Receipt waiting failed:', (receiptError as Error).message);
      return { success: false, error: (receiptError as Error).message };
    }
      
    // Check for PredictionMinted event
    const mintedEvent = receipt.logs.find(log => {
      try {
        const decoded = decodeEventLog({
          abi: [PREDICTION_MINTED_EVENT],
          data: log.data,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          topics: log.topics as any
        });
        return (decoded as { eventName: string }).eventName === 'PredictionMinted';
      } catch {
        return false;
      }
    });

    if (mintedEvent) {
      console.log('🎉 PredictionMinted event found in transaction receipt!');
      
      // Extract and save NFT data
      try {
        const decoded = decodeEventLog({
          abi: [PREDICTION_MINTED_EVENT],
          data: mintedEvent.data,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          topics: mintedEvent.topics as any
        });
        const eventData = decoded as { args: { makerNftTokenId: bigint; takerNftTokenId: bigint } };
        
        const nftData: StoredNFTData = {
          makerNftTokenId: eventData.args.makerNftTokenId.toString(),
          takerNftTokenId: eventData.args.takerNftTokenId.toString(),
          transactionHash: hash,
          timestamp: Date.now()
        };
        
        saveNFTData(nftData);
        console.log(`📋 Saved NFT IDs - Maker: ${nftData.makerNftTokenId}, Taker: ${nftData.takerNftTokenId}`);
      } catch (decodeError) {
        console.log('⚠️  Failed to decode minted event for storage:', (decodeError as Error).message);
      }
      
      return { success: true, hash, receipt };
    } else {
      console.log('⚠️  No PredictionMinted event found in transaction receipt');
      return { success: false, hash, receipt };
    }

  } catch (error) {
    console.log('❌ Mint function call failed:', (error as Error).message);
    return { success: false, error: (error as Error).message };
  }
}

async function testBurnFunction(makerNftTokenId: bigint): Promise<{ success: boolean; hash?: string; receipt?: TransactionReceipt; error?: string }> {
  console.log('🔥 Testing burn() function...');
  
  try {
    const refCode = keccak256(toHex('test_mint'));
    
    console.log(`🔥 Attempting to burn prediction for maker NFT: ${makerNftTokenId.toString()}`);
    
    // Estimate gas first
    try {
      const gasEstimate = await publicClient.estimateContractGas({
        address: PREDICTION_MARKET_CONTRACT_ADDRESS as `0x${string}`,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'burn',
        args: [makerNftTokenId, refCode],
        account: account.address
      });
      console.log(`⛽ Gas estimate: ${gasEstimate.toString()}`);
    } catch (gasError) {
      console.log('❌ Gas estimation failed:', (gasError as Error).message);
    }
    
    // Send transaction
    let hash: `0x${string}`;
    try {
      hash = await walletClient.writeContract({
        address: PREDICTION_MARKET_CONTRACT_ADDRESS as `0x${string}`,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'burn',
        args: [makerNftTokenId, refCode],
        account: account,
        chain: arbitrum,
        gas: BigInt(1000000)
      });
      console.log(`✅ Burn transaction sent: ${hash}`);
    } catch (txError) {
      console.log('❌ Transaction sending failed:', (txError as Error).message);
      return { success: false, error: (txError as Error).message };
    }
      
    // Wait for transaction receipt
    let receipt: TransactionReceipt;
    try {
      receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`✅ Burn transaction confirmed in block: ${receipt.blockNumber}`);
    } catch (receiptError) {
      console.log('❌ Receipt waiting failed:', (receiptError as Error).message);
      return { success: false, error: (receiptError as Error).message };
    }
      
    // Check for PredictionBurned event
    const burnedEvent = receipt.logs.find(log => {
      try {
        const decoded = decodeEventLog({
          abi: [PREDICTION_BURNED_EVENT],
          data: log.data,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          topics: log.topics as any
        });
        return (decoded as { eventName: string }).eventName === 'PredictionBurned';
      } catch {
        return false;
      }
    });

    if (burnedEvent) {
      console.log('🎉 PredictionBurned event found in transaction receipt!');
      return { success: true, hash, receipt };
    } else {
      console.log('⚠️  No PredictionBurned event found in transaction receipt');
      return { success: false, hash, receipt };
    }

  } catch (error) {
    console.log('❌ Burn function call failed:', (error as Error).message);
    return { success: false, error: (error as Error).message };
  }
}

async function checkIndexerEvents(transactionHashes: string[]): Promise<number> {
  console.log('🔍 Checking if indexer picked up events...');
  
  if (transactionHashes.length === 0) {
    console.log('⚠️  No transaction hashes to check');
    return 0;
  }

  console.log('⏳ Waiting 10 seconds for indexer to process events...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  try {
    const events = await prisma.event.findMany({
      where: {
        transactionHash: { in: transactionHashes }
      }
    });

    console.log(`📊 Found ${events.length} events in database for our transactions:`);
    
    events.forEach((event, index) => {
      const logData = event.logData as Record<string, unknown>;
      console.log(`  Event ${index + 1}: ${logData.eventType} (Block: ${event.blockNumber})`);
    });

    return events.length;
  } catch (error) {
    console.error('❌ Error checking indexer events:', (error as Error).message);
    return 0;
  }
}

async function runMintTest(): Promise<void> {
  console.log('🧪 Starting Mint Test');
  console.log('============================================================');

  try {
    await setup();
    console.log('============================================================');

    console.log('MINT FUNCTION');
    console.log('============================================================');
    const mintResult = await testMintFunction();
    
    if (mintResult.success) {
      console.log('✅ Mint function test passed');
    } else {
      console.log('❌ Mint function test failed');
      if (mintResult.error) {
        console.log(`   Error: ${mintResult.error}`);
      }
    }

    console.log('============================================================');

    // Check indexer events
    console.log('INDEXER VERIFICATION');
    console.log('============================================================');
    const transactionHashes: string[] = [];
    if (mintResult.hash) transactionHashes.push(mintResult.hash);
    
    const eventCount = await checkIndexerEvents(transactionHashes);

    console.log('============================================================');
    console.log('MINT TEST SUMMARY');
    console.log('============================================================');
    console.log(`Mint Function: ${mintResult.success ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Indexer Events Found: ${eventCount}`);
    
    if (eventCount === 0) {
      console.log('⚠️  No indexer events found. Check if indexer is running.');
    }

  } catch (error) {
    console.error('❌ Mint test failed:', (error as Error).message);
  } finally {
    await prisma.$disconnect();
  }
}

async function runBurnTest(): Promise<void> {
  console.log('🔥 Starting Burn Test');
  console.log('============================================================');

  try {
    await setup();
    console.log('============================================================');

    // Load NFT data from file
    const nftData = loadNFTData();
    if (!nftData) {
      console.log('❌ No NFT data found. Please run mint test first.');
      console.log('   Usage: npm run test-prediction-indexer-e2e mint');
      return;
    }

    console.log(`📋 Loaded NFT data from file:`);
    console.log(`   Maker NFT ID: ${nftData.makerNftTokenId}`);
    console.log(`   Taker NFT ID: ${nftData.takerNftTokenId}`);
    console.log(`   Original Transaction: ${nftData.transactionHash}`);
    console.log(`   Timestamp: ${new Date(nftData.timestamp).toISOString()}`);

    console.log('============================================================');

    console.log('BURN FUNCTION');
    console.log('============================================================');
    const burnResult = await testBurnFunction(BigInt(nftData.makerNftTokenId));
    
    if (burnResult.success) {
      console.log('✅ Burn function test passed');
      // Clear the NFT data after successful burn
      clearNFTData();
    } else {
      console.log('❌ Burn function test failed');
      if (burnResult.error) {
        console.log(`   Error: ${burnResult.error}`);
      }
    }

    console.log('============================================================');

    // Check indexer events
    console.log('INDEXER VERIFICATION');
    console.log('============================================================');
    const transactionHashes: string[] = [];
    if (burnResult.hash) transactionHashes.push(burnResult.hash);
    
    const eventCount = await checkIndexerEvents(transactionHashes);

    console.log('============================================================');
    console.log('BURN TEST SUMMARY');
    console.log('============================================================');
    console.log(`Burn Function: ${burnResult.success ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Indexer Events Found: ${eventCount}`);
    
    if (eventCount === 0) {
      console.log('⚠️  No indexer events found. Check if indexer is running.');
    }

  } catch (error) {
    console.error('❌ Burn test failed:', (error as Error).message);
  } finally {
    await prisma.$disconnect();
  }
}

async function runBothTests(): Promise<void> {
  console.log('🧪 Starting Complete End-to-End Test');
  console.log('============================================================');

  try {
    await setup();
    console.log('============================================================');

    // Test 1: Mint Function
    console.log('TEST 1: MINT FUNCTION');
    console.log('============================================================');
    const mintResult = await testMintFunction();
    
    if (mintResult.success) {
      console.log('✅ Mint function test passed');
    } else {
      console.log('❌ Mint function test failed');
      if (mintResult.error) {
        console.log(`   Error: ${mintResult.error}`);
      }
    }

    console.log('============================================================');

    // Test 2: Burn Function (if mint was successful)
    let burnResult: { success: boolean; hash?: string; receipt?: TransactionReceipt; error?: string } = { success: false };
    
    if (mintResult.success) {
      console.log('TEST 2: BURN FUNCTION');
      console.log('============================================================');
      
      // Load NFT data from the file (saved during mint)
      const nftData = loadNFTData();
      if (nftData) {
        console.log(`📋 Using saved NFT data - Maker: ${nftData.makerNftTokenId}, Taker: ${nftData.takerNftTokenId}`);
        burnResult = await testBurnFunction(BigInt(nftData.makerNftTokenId));
        
        if (burnResult.success) {
          console.log('✅ Burn function test passed');
          clearNFTData();
        } else {
          console.log('❌ Burn function test failed');
          if (burnResult.error) {
            console.log(`   Error: ${burnResult.error}`);
          }
        }
      } else {
        console.log('❌ Could not load NFT data from file');
        burnResult = { success: false, error: 'Could not load NFT data' };
      }
    } else {
      console.log('⚠️  Skipping burn test - mint function failed');
    }

    console.log('============================================================');

    // Check indexer events
    console.log('INDEXER VERIFICATION');
    console.log('============================================================');
    const transactionHashes: string[] = [];
    if (mintResult.hash) transactionHashes.push(mintResult.hash);
    if (burnResult.hash) transactionHashes.push(burnResult.hash);
    
    const eventCount = await checkIndexerEvents(transactionHashes);

    console.log('============================================================');
    console.log('COMPLETE TEST SUMMARY');
    console.log('============================================================');
    console.log(`Mint Function: ${mintResult.success ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Burn Function: ${burnResult.success ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Indexer Events Found: ${eventCount}`);
    
    if (eventCount === 0) {
      console.log('⚠️  No indexer events found. Check if indexer is running.');
    }

  } catch (error) {
    console.error('❌ Complete test failed:', (error as Error).message);
  } finally {
    await prisma.$disconnect();
  }
}

// Main execution based on CLI argument
async function main(): Promise<void> {
  switch (operation) {
    case 'mint':
      await runMintTest();
      break;
    case 'burn':
      await runBurnTest();
      break;
    case 'both':
      await runBothTests();
      break;
    default:
      console.error('❌ Invalid operation. Use: mint, burn, or both');
      process.exit(1);
  }
}

// Run the appropriate test based on CLI argument
main().catch(console.error);