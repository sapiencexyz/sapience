import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  parseAbi,
  type Chain,
  type PublicClient,
  type WalletClient,
  type Transport,
  type Account,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { collateralToken, predictionMarket } from '../contracts/addresses';
import { CHAIN_ID_ETHEREAL } from '../constants/chain';

type Hex = `0x${string}`;

// Ethereal chain definition (trading chain)
export const tradingChain: Chain = {
  id: CHAIN_ID_ETHEREAL,
  name: 'Ethereal',
  nativeCurrency: { name: 'USDe', symbol: 'USDe', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.ethereal.trade'] },
  },
  blockExplorers: {
    default: { name: 'Ethereal Explorer', url: 'https://explorer.ethereal.trade' },
  },
};

// Default trading RPC URL
export const TRADING_RPC_URL = 'https://rpc.ethereal.trade';

// WUSDe (Wrapped USDe) contract address - collateral token for trading
export const WUSDE_ADDRESS = collateralToken[CHAIN_ID_ETHEREAL]?.address as Hex;

// WUSDe ABI for wrap/unwrap operations
const WUSDE_ABI = parseAbi([
  'function deposit() payable',
  'function withdraw(uint256 amount)',
  'function balanceOf(address account) view returns (uint256)',
]);

// ERC20 ABI for approvals
const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
]);

/**
 * Create a public client for the trading chain
 */
export function createTradingPublicClient(
  rpcUrl?: string
): PublicClient<Transport, Chain> {
  return createPublicClient({
    chain: tradingChain,
    transport: http(rpcUrl || TRADING_RPC_URL),
  });
}

/**
 * Create a wallet client for the trading chain
 */
export function createTradingWalletClient(
  privateKey: Hex,
  rpcUrl?: string
): WalletClient<Transport, Chain, Account> {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: tradingChain,
    transport: http(rpcUrl || TRADING_RPC_URL),
  });
}

/**
 * Get WUSDe (wrapped collateral) balance for an address
 */
export async function getWUSDEBalance(
  address: Hex,
  rpcUrl?: string
): Promise<bigint> {
  const client = createTradingPublicClient(rpcUrl);
  const balance = await client.readContract({
    address: WUSDE_ADDRESS,
    abi: WUSDE_ABI,
    functionName: 'balanceOf',
    args: [address],
  });
  return balance as bigint;
}

/**
 * Get native USDe balance for an address
 */
export async function getUSDEBalance(
  address: Hex,
  rpcUrl?: string
): Promise<bigint> {
  const client = createTradingPublicClient(rpcUrl);
  return await client.getBalance({ address });
}

/**
 * Wrap native USDe into WUSDe (required before trading)
 * @returns Transaction hash
 */
export async function wrapUSDe(args: {
  privateKey: Hex;
  amount: bigint;
  rpcUrl?: string;
}): Promise<{ hash: Hex }> {
  const { privateKey, amount, rpcUrl } = args;
  
  if (amount <= 0n) {
    throw new Error('Amount must be greater than 0');
  }

  const walletClient = createTradingWalletClient(privateKey, rpcUrl);
  
  const hash = await walletClient.sendTransaction({
    to: WUSDE_ADDRESS,
    data: encodeFunctionData({
      abi: WUSDE_ABI,
      functionName: 'deposit',
    }),
    value: amount,
  });

  return { hash };
}

/**
 * Unwrap WUSDe back to native USDe
 * @returns Transaction hash
 */
export async function unwrapUSDe(args: {
  privateKey: Hex;
  amount: bigint;
  rpcUrl?: string;
}): Promise<{ hash: Hex }> {
  const { privateKey, amount, rpcUrl } = args;
  
  if (amount <= 0n) {
    throw new Error('Amount must be greater than 0');
  }

  const walletClient = createTradingWalletClient(privateKey, rpcUrl);
  
  const hash = await walletClient.sendTransaction({
    to: WUSDE_ADDRESS,
    data: encodeFunctionData({
      abi: WUSDE_ABI,
      functionName: 'withdraw',
      args: [amount],
    }),
    value: 0n,
  });

  return { hash };
}

/**
 * Get the current WUSDe allowance for a spender
 */
export async function getWUSDEAllowance(args: {
  owner: Hex;
  spender: Hex;
  rpcUrl?: string;
}): Promise<bigint> {
  const { owner, spender, rpcUrl } = args;
  const publicClient = createTradingPublicClient(rpcUrl);
  
  const allowance = await publicClient.readContract({
    address: WUSDE_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [owner, spender],
  });
  
  return allowance as bigint;
}

/**
 * Complete preparation for trading: wraps USDe to WUSDe and approves for spending.
 * 
 * This function optimizes wrapping by only converting the additional USDe needed:
 * 1. Check existing WUSDe balance and only wrap the difference needed
 * 2. Check allowance and approve only if insufficient
 * 3. Execute transactions sequentially, waiting for each to confirm
 * 
 * On Ethereal chain, native token is USDe but contracts expect WUSDe (Wrapped USDe).
 * This function handles the wrapping and approval automatically.
 * 
 * @example
 * ```ts
 * const { ready, wrapTxHash, approvalTxHash } = await prepareForTrade({
 *   privateKey: '0x...',
 *   collateralAmount: parseEther('10'),
 * });
 * if (ready) {
 *   // Execute trade mint...
 * }
 * ```
 */
export async function prepareForTrade(args: {
  privateKey: Hex;
  collateralAmount: bigint;
  spender?: Hex;
  rpcUrl?: string;
}): Promise<{
  ready: boolean;
  wrapTxHash?: Hex;
  approvalTxHash?: Hex;
  wusdBalance: bigint;
}> {
  const { privateKey, collateralAmount, rpcUrl } = args;
  const spender = args.spender || (predictionMarket[CHAIN_ID_ETHEREAL]?.address as Hex);
  
  if (!spender) {
    throw new Error('No spender address provided and no default PredictionMarket address found');
  }

  const account = privateKeyToAccount(privateKey);
  const publicClient = createTradingPublicClient(rpcUrl);
  const walletClient = createTradingWalletClient(privateKey, rpcUrl);
  
  let wrapTxHash: Hex | undefined;
  let approvalTxHash: Hex | undefined;

  // Step 1: Check existing WUSDe balance and only wrap the additional amount needed
  const currentWUSDEBalance = await getWUSDEBalance(account.address, rpcUrl);
  const amountToWrap = collateralAmount > currentWUSDEBalance 
    ? collateralAmount - currentWUSDEBalance 
    : 0n;

  if (amountToWrap > 0n) {
    // Check if we have enough native USDe to wrap the additional amount
    const nativeBalance = await publicClient.getBalance({ address: account.address });
    if (nativeBalance < amountToWrap) {
      throw new Error(
        `Insufficient native USDe balance. Need ${amountToWrap} more to wrap, but only have ${nativeBalance}`
      );
    }

    const { hash } = await wrapUSDe({
      privateKey,
      amount: amountToWrap,
      rpcUrl,
    });
    wrapTxHash = hash;
    
    // Wait for wrap transaction to confirm before proceeding (nonce handling)
    await publicClient.waitForTransactionReceipt({ hash: wrapTxHash });
  }

  // Step 2: Check allowance and approve only if insufficient
  const currentAllowance = await getWUSDEAllowance({
    owner: account.address,
    spender,
    rpcUrl,
  });

  if (currentAllowance < collateralAmount) {
    // Approve the exact amount needed (or could use max approval for convenience)
    const hash = await walletClient.writeContract({
      address: WUSDE_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [spender, collateralAmount],
    });
    approvalTxHash = hash;
    
    // Wait for approval transaction to confirm before proceeding (nonce handling)
    await publicClient.waitForTransactionReceipt({ hash: approvalTxHash });
  }

  // Get final WUSDe balance for reference
  const wusdBalance = await getWUSDEBalance(account.address, rpcUrl);

  return {
    ready: true,
    wrapTxHash,
    approvalTxHash,
    wusdBalance,
  };
}

