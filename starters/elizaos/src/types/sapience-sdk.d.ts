declare module "@sapience/sdk" {
  // Simplified API - always targets Arbitrum
  export type ForecastCalldata = {
    to: `0x${string}`;
    data: `0x${string}`;
    value: "0";
    chainId: 42161;
  };

  /**
   * Build calldata for submitting a forecast attestation to Arbitrum EAS.
   * @param conditionId - The condition/question ID (bytes32)
   * @param probability - Probability 0-100 that the condition resolves YES
   * @param comment - Optional comment/reasoning (max 180 chars)
   */
  export function buildForecastCalldata(
    conditionId: `0x${string}`,
    probability: number,
    comment?: string,
  ): ForecastCalldata;

  /**
   * Submit a forecast attestation to Arbitrum EAS.
   * @param args.conditionId - The condition/question ID (bytes32)
   * @param args.probability - Probability 0-100 that the condition resolves YES
   * @param args.comment - Optional comment/reasoning (max 180 chars)
   * @param args.privateKey - Wallet private key for signing
   * @param args.rpc - Arbitrum RPC URL (defaults to public endpoint)
   */
  export function submitForecast(args: {
    conditionId: `0x${string}`;
    probability: number;
    comment?: string;
    privateKey: `0x${string}`;
    rpc?: string;
  }): Promise<{ hash: `0x${string}`; calldata: ForecastCalldata }>;

  // Legacy API (deprecated)
  export type AttestationCalldata = {
    to: `0x${string}`;
    data: `0x${string}`;
    value: string;
    chainId: number;
    description: string;
  };
  /** @deprecated Use buildForecastCalldata instead */
  export function buildAttestationCalldata(
    prediction: { probability: number; reasoning: string; confidence: number },
    chainId: number,
    conditionId?: `0x${string}`,
  ): Promise<AttestationCalldata | null>;
  export function decodeProbabilityFromUint160(value: string): number | null;

  export function simulateTransaction(args: {
    rpc: string;
    tx: { to: `0x${string}`; data?: `0x${string}`; value?: bigint | string };
  }): Promise<{ result: any }>;
  export function submitTransaction(args: {
    rpc: string;
    privateKey?: `0x${string}`;
    account?: any;
    tx: { to: `0x${string}`; data?: `0x${string}`; value?: bigint | string };
  }): Promise<{ hash: `0x${string}` }>;
}
