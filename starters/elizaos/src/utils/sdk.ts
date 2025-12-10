import path from "path";
import { pathToFileURL } from "url";

type SdkModule = Record<string, any>;

export async function loadSdk(): Promise<SdkModule> {
  let originalSdk: SdkModule = {};
  
  // Try to load from SDK package or override path
  const override = process.env.SAPIENCE_SDK_PATH;
  if (override && override.trim().length > 0) {
    try {
      const resolved = path.isAbsolute(override)
        ? override
        : path.resolve(process.cwd(), override);
      const url = pathToFileURL(resolved).href;
      originalSdk = await import(url);
    } catch (e) {
      // Fallback to package import if override fails
      try {
        originalSdk = await import("@sapience/sdk");
      } catch {
        console.warn("Failed to load @sapience/sdk, using local implementations");
      }
    }
  } else {
    try {
      originalSdk = await import("@sapience/sdk");
    } catch {
      console.warn("Failed to load @sapience/sdk, using local implementations");
    }
  }
  
  // Create a new mutable object with all SDK properties
  const sdk: SdkModule = { ...originalSdk };
  
  // Add local fallback implementations if missing from SDK
  if (!sdk.buildForecastCalldata) {
    console.log("[SDK] buildForecastCalldata not found in SDK, using local fallback");
    try {
      const { buildForecastCalldata, buildAttestationCalldata, getDefaultResolver, decodeProbabilityFromD18 } = await import("../utils/eas.js");
      sdk.buildForecastCalldata = buildForecastCalldata;
      sdk.buildAttestationCalldata = buildAttestationCalldata;
      sdk.getDefaultResolver = getDefaultResolver;
      sdk.decodeProbabilityFromD18 = decodeProbabilityFromD18;
    } catch (e) {
      console.warn("Failed to load local forecast calldata implementation:", e);
    }
  } else {
    console.log("[SDK] Using buildForecastCalldata from @sapience/sdk");
  }
  
  // Add transaction functions from actions if missing
  if (!sdk.simulateTransaction) {
    sdk.simulateTransaction = async (args: any) => {
      // Simple simulation implementation using viem
      const { createPublicClient, http } = await import("viem");
      const client = createPublicClient({
        transport: http(args.rpc)
      });
      return await client.simulateContract({
        ...args.tx,
        address: args.tx.to,
        abi: [] // Empty ABI for generic calls
      });
    };
  }
  
  if (!sdk.submitTransaction) {
    sdk.submitTransaction = async (args: any) => {
      const { createWalletClient, createPublicClient, http } = await import("viem");
      const { privateKeyToAccount } = await import("viem/accounts");
      const { arbitrum } = await import("viem/chains");
      const { etherealChain, CHAIN_ID_ETHEREAL } = await import("./blockchain.js");
      
      if (!args.privateKey) throw new Error("Missing private key for transaction submission");
      
      // Determine which chain to use based on chainId or RPC URL
      const isEthereal = args.chainId === CHAIN_ID_ETHEREAL || 
                         (args.rpc && args.rpc.includes('ethereal'));
      const chain = isEthereal ? etherealChain : arbitrum;
      const chainName = isEthereal ? 'ethereal' : 'arbitrum';
      
      const account = privateKeyToAccount(args.privateKey);
      const client = createWalletClient({
        account,
        chain,
        transport: http(args.rpc)
      });
      
      // Log the full transaction for debugging
      console.log("[SDK] Submitting transaction:", {
        to: args.tx.to,
        data: args.tx.data ? `${args.tx.data.slice(0, 10)}...` : undefined,
        value: args.tx.value,
        chain: chainName
      });
      
      try {
        // Get the current nonce to prevent nonce conflicts
        const publicClient = createPublicClient({
          chain,
          transport: http(args.rpc)
        });
        
        const nonce = await publicClient.getTransactionCount({
          address: account.address,
          blockTag: "pending"
        });
        
        console.log(`[SDK] Using nonce: ${nonce} for address: ${account.address} on ${chainName}`);
        
        const hash = await client.sendTransaction({
          to: args.tx.to,
          data: args.tx.data,
          value: BigInt(args.tx.value || 0),
          nonce,
          account,
          chain
        });
        
        console.log("[SDK] Transaction submitted:", hash);
        return { hash };
      } catch (error) {
        console.error("[SDK] Transaction failed:", error);
        throw error;
      }
    };
  }

  // Add trading WUSDe utilities if not available from SDK
  // On chains where native token != collateral (e.g., Ethereal uses USDe natively
  // but contracts expect WUSDe), we need to wrap before trading
  //
  // This function optimizes wrapping by only converting the additional USDe needed:
  // 1. Check existing WUSDe balance and only wrap the difference needed
  // 2. Check allowance and approve only if insufficient
  // 3. Execute transactions sequentially, waiting for each to confirm
  if (!sdk.prepareForTrade) {
    const { 
      createPublicClient, 
      createWalletClient, 
      http, 
      encodeFunctionData, 
      parseAbi 
    } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { etherealChain, getTradingContractAddresses, getTradingRpcUrl } = await import("./blockchain.js");

    const WUSDE_ADDRESS = getTradingContractAddresses().USDE_TOKEN;
    const PREDICTION_MARKET = getTradingContractAddresses().PREDICTION_MARKET;

    const WUSDE_ABI = parseAbi([
      'function deposit() payable',
      'function withdraw(uint256 amount)',
      'function balanceOf(address account) view returns (uint256)',
    ]);

    const ERC20_ABI = parseAbi([
      'function approve(address spender, uint256 amount) returns (bool)',
      'function allowance(address owner, address spender) view returns (uint256)',
      'function balanceOf(address account) view returns (uint256)',
    ]);

    const createPublicClientLocal = (rpcUrl?: string) => createPublicClient({
      chain: etherealChain,
      transport: http(rpcUrl || getTradingRpcUrl()),
    });

    const createWalletClientLocal = (privateKey: `0x${string}`, rpcUrl?: string) => {
      const account = privateKeyToAccount(privateKey);
      return createWalletClient({
        account,
        chain: etherealChain,
        transport: http(rpcUrl || getTradingRpcUrl()),
      });
    };

    sdk.getWUSDEBalance = async (address: `0x${string}`, rpcUrl?: string) => {
      const client = createPublicClientLocal(rpcUrl);
      return await client.readContract({
        address: WUSDE_ADDRESS,
        abi: WUSDE_ABI,
        functionName: 'balanceOf',
        args: [address],
      }) as bigint;
    };

    sdk.wrapUSDe = async (args: { privateKey: `0x${string}`; amount: bigint; rpcUrl?: string }) => {
      const walletClient = createWalletClientLocal(args.privateKey, args.rpcUrl);
      const hash = await walletClient.sendTransaction({
        to: WUSDE_ADDRESS,
        data: encodeFunctionData({
          abi: WUSDE_ABI,
          functionName: 'deposit',
        }),
        value: args.amount,
      });
      return { hash };
    };

    sdk.getWUSDEAllowance = async (args: {
      owner: `0x${string}`;
      spender: `0x${string}`;
      rpcUrl?: string;
    }) => {
      const publicClient = createPublicClientLocal(args.rpcUrl);
      return await publicClient.readContract({
        address: WUSDE_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [args.owner, args.spender],
      }) as bigint;
    };

    sdk.prepareForTrade = async (args: {
      privateKey: `0x${string}`;
      collateralAmount: bigint;
      spender?: `0x${string}`;
      rpcUrl?: string;
    }) => {
      const spender = args.spender || PREDICTION_MARKET;
      const account = privateKeyToAccount(args.privateKey);
      const publicClient = createPublicClientLocal(args.rpcUrl);
      const walletClient = createWalletClientLocal(args.privateKey, args.rpcUrl);
      
      let wrapTxHash: `0x${string}` | undefined;
      let approvalTxHash: `0x${string}` | undefined;

      console.log("[SDK] Preparing for trade - checking WUSDe balance and approval...");
      console.log(`[SDK] Collateral amount: ${args.collateralAmount}`);

      // Step 1: Check existing WUSDe balance and only wrap the additional amount needed
      const currentWUSDEBalance = await sdk.getWUSDEBalance(account.address, args.rpcUrl);
      console.log(`[SDK] Current WUSDe balance: ${currentWUSDEBalance}`);
      
      const amountToWrap = args.collateralAmount > currentWUSDEBalance 
        ? args.collateralAmount - currentWUSDEBalance 
        : 0n;

      if (amountToWrap > 0n) {
        // Check if we have enough native USDe to wrap the additional amount
        const nativeBalance = await publicClient.getBalance({ address: account.address });
        console.log(`[SDK] Native USDe balance: ${nativeBalance}`);
        
        if (nativeBalance < amountToWrap) {
          throw new Error(
            `Insufficient native USDe balance. Need ${amountToWrap} more to wrap, but only have ${nativeBalance}`
          );
        }

        console.log(`[SDK] Wrapping ${amountToWrap} USDe to WUSDe...`);
        const wrapResult = await sdk.wrapUSDe({
          privateKey: args.privateKey,
          amount: amountToWrap,
          rpcUrl: args.rpcUrl,
        });
        wrapTxHash = wrapResult.hash;
        console.log(`[SDK] Wrap tx submitted: ${wrapTxHash}`);
        
        // Wait for wrap transaction to confirm before proceeding (nonce handling)
        await publicClient.waitForTransactionReceipt({ hash: wrapTxHash as `0x${string}` });
        console.log("[SDK] Wrap tx confirmed");
      } else {
        console.log("[SDK] Sufficient WUSDe balance exists, skipping wrap");
      }

      // Step 2: Check allowance and approve only if insufficient
      const currentAllowance = await sdk.getWUSDEAllowance({
        owner: account.address,
        spender,
        rpcUrl: args.rpcUrl,
      });
      console.log(`[SDK] Current WUSDe allowance: ${currentAllowance}`);

      if (currentAllowance < args.collateralAmount) {
        console.log(`[SDK] Approving ${args.collateralAmount} WUSDe for ${spender}...`);
        // Approve the exact amount needed
        const hash = await walletClient.writeContract({
          address: WUSDE_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [spender, args.collateralAmount],
        });
        approvalTxHash = hash;
        console.log(`[SDK] Approval tx submitted: ${approvalTxHash}`);
        
        // Wait for approval transaction to confirm before proceeding (nonce handling)
        await publicClient.waitForTransactionReceipt({ hash: approvalTxHash });
        console.log("[SDK] Approval tx confirmed");
      } else {
        console.log("[SDK] Sufficient allowance exists, skipping approval");
      }

      // Get final WUSDe balance for reference
      const wusdBalance = await sdk.getWUSDEBalance(account.address, args.rpcUrl);
      console.log(`[SDK] Final WUSDe balance: ${wusdBalance}`);

      return {
        ready: true,
        wrapTxHash,
        approvalTxHash,
        wusdBalance,
      };
    };

    console.log("[SDK] Added trading WUSDe utilities (local fallback)");
  }
  
  return sdk;
}

// Local fallback for MCP client if not available from SDK
export type LocalMcpClient = {
  callTool<T = unknown>(name: string, args?: Record<string, any>): Promise<T>;
  readResource<T = unknown>(uri: string): Promise<T>;
  close(): Promise<void>;
};

function createLocalMcpClient(opts: {
  baseUrl: string;
  fetchImpl?: (input: any, init?: any) => Promise<Response>;
  headers?: Record<string, string>;
}): LocalMcpClient {
  const fetchFn = opts.fetchImpl ?? (globalThis.fetch as any);
  const baseUrl = opts.baseUrl.replace(/\/$/, "");
  const defaultHeaders = opts.headers ?? {};

  let nextId = 1;
  let sessionId: string | null = null;

  function getMcpEndpoint(): string {
    const normalized = baseUrl.replace(/\/$/, "");
    return normalized.endsWith("/mcp") ? normalized : `${normalized}/mcp`;
  }

  async function ensureSession(): Promise<string> {
    if (sessionId) return sessionId;
    const req = {
      jsonrpc: "2.0",
      id: nextId++,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "@sapience/sdk", version: "0.1.0" },
      },
    } as const;
    const res = await fetchFn(`${getMcpEndpoint()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...defaultHeaders,
      },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`MCP initialize failed (${res.status}): ${text}`);
    }
    const sid = res.headers.get("mcp-session-id");
    if (!sid) throw new Error("MCP initialize missing mcp-session-id");
    sessionId = sid;
    return sid;
  }

  return {
    async callTool(name, args) {
      await ensureSession();
      const req = {
        jsonrpc: "2.0",
        id: nextId++,
        method: "tools/call",
        params: { name, arguments: args || {} },
      } as const;
      const res = await fetchFn(`${getMcpEndpoint()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": sessionId as string,
          ...defaultHeaders,
        },
        body: JSON.stringify(req),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || json.error) {
        const message = json.error?.message || `HTTP ${res.status}`;
        throw new Error(`MCP tool error: ${message}`);
      }
      return (json.result as any) ?? (undefined as any);
    },
    async readResource(uri) {
      await ensureSession();
      const req = {
        jsonrpc: "2.0",
        id: nextId++,
        method: "resources/read",
        params: { uri },
      } as const;
      const res = await fetchFn(`${getMcpEndpoint()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": sessionId as string,
          ...defaultHeaders,
        },
        body: JSON.stringify(req),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || json.error) {
        const message = json.error?.message || `HTTP ${res.status}`;
        throw new Error(`MCP resource error: ${message}`);
      }
      return (json.result as any) ?? (undefined as any);
    },
    async close() {
      try {
        const sid = sessionId;
        if (!sid) return;
        await fetchFn(`${getMcpEndpoint()}`, {
          method: "DELETE",
          headers: { "mcp-session-id": sid, ...defaultHeaders },
        }).catch(() => {});
      } finally {
        sessionId = null;
      }
    },
  };
}

export async function loadCreateMcpClient(): Promise<
  (opts: Parameters<typeof createLocalMcpClient>[0]) => LocalMcpClient
> {
  try {
    const mod = await loadSdk();
    if (mod && typeof mod.createMcpClient === "function") {
      return mod.createMcpClient.bind(mod);
    }
  } catch {}
  // Fallback to local implementation
  return (opts) => createLocalMcpClient(opts);
}

