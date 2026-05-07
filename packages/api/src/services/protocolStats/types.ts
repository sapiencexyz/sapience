import { contracts } from '@sapience/sdk/contracts';

export interface VaultPnLResult {
  realizedPnL: bigint;
  positionsWon: number;
  positionsLost: number;
  totalCollateralWon: bigint;
  totalCollateralLost: bigint;
}

export interface VaultFlowsResult {
  totalDeposits: bigint;
  totalWithdrawals: bigint;
}

export interface VaultSecondaryFlowsResult {
  bought: bigint;
  sold: bigint;
}

/**
 * Per-snapshot decomposition of every leg in 1634's reconciliation identity:
 *   balance + deployed = deposits − withdrawals + settlementPnL
 *                        + (secondarySold − secondaryBought) + airdrops
 *
 * Used only when PROTOCOL_STATS_GAP_DEBUG=1 to print full attribution logs so
 * a non-zero `Δ = LHS − RHS` can be traced to a specific leg (or to legacy
 * Prediction-side accounting that the new identity supersedes).
 */
export interface VaultGapDecomposition {
  // ── Prediction-side legs (legacy diagnostic; superseded by Close-based PnL) ──
  // Active deployment (in escrow, prediction not yet resolved as of t)
  counterpartyActiveStake: bigint;
  counterpartyActiveCount: number;
  predictorActiveStake: bigint;
  predictorActiveCount: number;
  // Resolved & vault-on-side wins (from Prediction)
  winsAsCounterpartyCount: number;
  winsAsCounterpartyGain: bigint;
  winsAsCounterpartyOwed: bigint;
  winsAsPredictorCount: number;
  winsAsPredictorGain: bigint;
  winsAsPredictorOwed: bigint;
  // Resolved & vault-on-side losses (from Prediction)
  lossesAsCounterpartyCount: number;
  lossesAsCounterpartyLoss: bigint;
  lossesAsPredictorCount: number;
  lossesAsPredictorLoss: bigint;
  // Claims (TokensRedeemed events filed by vault)
  claimedByVault: bigint;
  claimCount: number;
  // ── Close-based legs (load-bearing under 1634's identity) ──
  closesPredictorHolderCount: number;
  closesPredictorHolderPayout: bigint;
  closesCounterpartyHolderCount: number;
  closesCounterpartyHolderPayout: bigint;
  primaryCollateralCommitted: bigint;
  // CollateralTransfer leg (raw inflow source for airdrop residual)
  collateralTransfersIn: bigint;
  collateralTransfersInCount: number;
}

export interface ProtocolStatsData {
  vaultBalance: bigint;
  vaultAvailableAssets: bigint;
  vaultDeployed: bigint;
  escrowBalance: bigint;
  vaultRealizedPnL: bigint;
  vaultAirdropGains: bigint;
  vaultSecondaryBought: bigint;
  vaultSecondarySold: bigint;
  vaultDeposits: bigint;
  vaultWithdrawals: bigint;
  vaultPositionsWon: number;
  vaultPositionsLost: number;
  vaultCollateralWon: bigint;
  vaultCollateralLost: bigint;
  /**
   * wUSDe earmarked for the vault from resolved wins it hasn't yet redeemed
   * (Prediction-based attribution; legacy diagnostic, not used by the
   * settlement-PnL identity which now flows from Close.predictorHolder /
   * Close.counterpartyHolder).
   */
  vaultUnredeemedClaim: bigint;
}

type VaultConfig = (typeof contracts.predictionMarketVault)[number];

export interface ConfiguredVault {
  kind: 'protocol' | 'pyth' | 'single-leg' | 'strategy-b';
  config: VaultConfig;
  address: string; // lowercased
}

export interface VaultAggregator {
  deployedAt: (timestamp: number, vaultAddressLower: string) => bigint;
  pnlAt: (timestamp: number, vaultAddressLower: string) => VaultPnLResult;
  flowsAt: (timestamp: number, vaultAddressLower: string) => VaultFlowsResult;
  unredeemedClaimAt: (timestamp: number, vaultAddressLower: string) => bigint;
  secondaryAt: (
    timestamp: number,
    vaultAddressLower: string
  ) => VaultSecondaryFlowsResult;
  airdropsAt: (timestamp: number, vaultAddressLower: string) => bigint;
  gapDecompositionAt: (
    timestamp: number,
    vaultAddressLower: string
  ) => VaultGapDecomposition;
}
