'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@sapience/ui/components/ui/button';
import { Card, CardContent } from '@sapience/ui/components/ui/card';
import { Input } from '@sapience/ui/components/ui/input';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@sapience/ui/components/ui/tabs';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@sapience/ui/components/ui/tooltip';
import { useAccount } from 'wagmi';
import { parseUnits } from 'viem';
import { Vault as VaultIcon } from 'lucide-react';
import { usePassiveLiquidityVault } from '~/hooks/contract/usePassiveLiquidityVault';
import NumberDisplay from '~/components/shared/NumberDisplay';

// Shared Coming Soon Overlay Component
const ComingSoonOverlay = () => (
  <div className="absolute inset-0 z-[60] bg-background/30 backdrop-blur-sm flex items-center justify-center rounded-md">
    <div className="text-center">
      <h3 className="text-lg font-semibold text-muted-foreground">
        Coming Soon
      </h3>
    </div>
  </div>
);

const VaultsPageContent = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { isConnected } = useAccount();
  // Constants for vault integration
  const VAULT_CHAIN_ID = 42161; // Arbitrum One
  const VAULT_ADDRESS = '0xD0Fd2e76dFB4449F422cdB2D0Bc3EA67A33b34b2';

  // Vaults feature flag detection
  const [vaultsFeatureEnabled, setVaultsFeatureEnabled] = useState(false);

  // Vault integration
  const {
    vaultData,
    userData,
    depositRequest,
    withdrawalRequest,
    userAssetBalance,
    assetDecimals,
    isLoadingUserData,
    isVaultPending,
    deposit,
    requestWithdrawal,
    cancelDeposit,
    cancelWithdrawal,
    formatAssetAmount,
    formatSharesAmount,
    minDeposit,
    allowance,
    pricePerShare,
    vaultManager: _vaultManager,
    quoteSignatureValid,
  } = usePassiveLiquidityVault({
    vaultAddress: VAULT_ADDRESS,
    chainId: VAULT_CHAIN_ID,
  });

  // Form state
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  // No slippage; we rely on manager-provided decimal pricePerShare quote

  // Derived validation
  const depositWei =
    depositAmount && assetDecimals !== undefined
      ? (() => {
          try {
            return parseUnits(depositAmount, assetDecimals);
          } catch {
            return 0n;
          }
        })()
      : 0n;
  const belowMinDeposit =
    (minDeposit ?? 0n) > 0n &&
    (depositWei === 0n || depositWei < (minDeposit ?? 0n));
  const requiresApproval = depositWei > 0n && (allowance ?? 0n) < depositWei;

  // UI helpers
  const shortWalletBalance = (() => {
    try {
      const num = Number(
        userAssetBalance ? formatAssetAmount(userAssetBalance) : '0'
      );
      if (Number.isFinite(num)) return num.toFixed(2);
      return '0.00';
    } catch {
      return '0.00';
    }
  })();

  const _pendingWithdrawalDisplay = (() => {
    const pending = userData?.pendingWithdrawal ?? 0n;
    if (pending <= 0n) return null;
    try {
      const num = Number(formatAssetAmount(pending));
      if (!Number.isFinite(num)) return null;
      return num.toFixed(2);
    } catch {
      return null;
    }
  })();

  const _pendingDepositDisplay = (() => {
    const pending = userData?.pendingDeposit ?? 0n;
    if (pending <= 0n) return null;
    try {
      const num = Number(formatAssetAmount(pending));
      if (!Number.isFinite(num)) return null;
      return num.toFixed(2);
    } catch {
      return null;
    }
  })();

  const depositQueuePosition = (() => {
    const index = userData?.depositIndex ?? 0n;
    if (index <= 0n) return null;
    try {
      const num = Number(index);
      if (!Number.isFinite(num)) return null;
      return num;
    } catch {
      return null;
    }
  })();

  // Removed withdrawal delay header display; keep minimal derived UI state only

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        // Allow enabling via URL ?vaults=true (dev convenience)
        if (params.get('vaults') === 'true') {
          window.localStorage.setItem('sapience.vaults', 'true');
        }
        const stored = window.localStorage.getItem('sapience.vaults');
        setVaultsFeatureEnabled(stored === 'true');
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[VaultPage] feature flags', {
            stored,
            NEXT_PUBLIC_ENABLE_VAULTS: process.env.NEXT_PUBLIC_ENABLE_VAULTS,
          });

          console.debug('[VaultPage] inputs', {
            VAULT_CHAIN_ID,
            VAULT_ADDRESS,
          });
        }
      }
    } catch {
      setVaultsFeatureEnabled(false);
    }
  }, []);

  // Quotes: estimated shares/assets and minimum thresholds with slippage
  const estDepositShares = useMemo(() => {
    if (!depositAmount || !assetDecimals) return 0n;
    try {
      const amountWei = parseUnits(depositAmount, assetDecimals);
      const ppsScaled = parseUnits(
        pricePerShare && pricePerShare !== '0' ? pricePerShare : '1',
        assetDecimals
      );
      return ppsScaled === 0n
        ? 0n
        : (amountWei * 10n ** BigInt(assetDecimals)) / ppsScaled;
    } catch {
      return 0n;
    }
  }, [depositAmount, assetDecimals, pricePerShare]);

  const estWithdrawAssets = useMemo(() => {
    if (!withdrawAmount || !assetDecimals) return 0n;
    try {
      const sharesWei = parseUnits(withdrawAmount, assetDecimals);
      const ppsScaled = parseUnits(
        pricePerShare && pricePerShare !== '0' ? pricePerShare : '1',
        assetDecimals
      );
      return (sharesWei * ppsScaled) / 10n ** BigInt(assetDecimals);
    } catch {
      return 0n;
    }
  }, [withdrawAmount, assetDecimals, pricePerShare]);

  const withdrawSharesWei = useMemo(() => {
    if (!withdrawAmount || !assetDecimals) return 0n;
    try {
      return parseUnits(withdrawAmount, assetDecimals);
    } catch {
      return 0n;
    }
  }, [withdrawAmount, assetDecimals]);

  const withdrawExceedsShareBalance = useMemo(() => {
    const balanceShares = userData?.balance ?? 0n;
    try {
      return withdrawSharesWei > balanceShares;
    } catch {
      return false;
    }
  }, [withdrawSharesWei, userData]);

  // Force light mode rendering for the iframe
  useEffect(() => {
    const handleIframeLoad = () => {
      const iframe = iframeRef.current;
      // Guard already exists here, but keeping it doesn't hurt
      if (typeof document === 'undefined') return;
      if (iframe && iframe.contentDocument) {
        try {
          // Try to inject a style element to force light mode
          const style = iframe.contentDocument.createElement('style');
          style.textContent =
            'html { color-scheme: light !important; } * { filter: none !important; }';
          iframe.contentDocument.head.appendChild(style);
        } catch (e) {
          // Security policy might prevent this
          console.error('Could not inject styles into iframe:', e);
        }
      }
    };

    const iframe = iframeRef.current;
    if (iframe) {
      // Ensure load event listener is attached only once iframe exists
      iframe.addEventListener('load', handleIframeLoad);
      // Clean up listener on unmount
      return () => iframe.removeEventListener('load', handleIframeLoad);
    }
  }, []); // Empty dependency array ensures this runs once client-side

  const renderVaultForm = () => (
    <Tabs defaultValue="deposit" className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-4">
        <TabsTrigger value="deposit">Deposit</TabsTrigger>
        <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
      </TabsList>

      <TabsContent value="deposit" className="space-y-2 mt-1">
        {/* Amount Input */}
        <div className="space-y-0.5">
          <div className="border border-input bg-background rounded-md px-3 py-3">
            <div className="flex items-center justify-between mb-0">
              <Input
                placeholder="0.0"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="text-lg bg-transparent border-none p-0 h-auto font-normal placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <div className="flex items-center gap-2">
                <span className="text-lg text-muted-foreground">testUSDe</span>
              </div>
            </div>
          </div>
        </div>

        {/* Balance and Requested row (outside input box) */}
        <div className="flex items-center justify-between text-sm text-muted-foreground py-0">
          <div className="flex items-center gap-2">
            <span>
              Balance: <NumberDisplay value={Number(shortWalletBalance)} />{' '}
              testUSDe
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setDepositAmount(shortWalletBalance)}
            >
              MAX
            </Button>
          </div>
          {depositAmount &&
          estDepositShares > 0n &&
          ((minDeposit ?? 0n) === 0n || depositWei >= (minDeposit ?? 0n)) ? (
            <div className="text-right">
              Requested Shares: {formatSharesAmount(estDepositShares)} sapLP
            </div>
          ) : (
            (minDeposit ?? 0n) > 0n && (
              <div className="text-right">
                Minimum Deposit: {formatAssetAmount(minDeposit ?? 0n)} testUSDe
              </div>
            )
          )}
        </div>

        {/* Deposit Button */}
        <Button
          size="lg"
          className="w-full text-base !mt-6"
          disabled={
            !isConnected ||
            !depositAmount ||
            isVaultPending ||
            vaultData?.paused ||
            belowMinDeposit ||
            quoteSignatureValid === false
          }
          onClick={async () => {
            await deposit(depositAmount, VAULT_CHAIN_ID);
            setDepositAmount('');
          }}
        >
          {!isConnected
            ? 'Connect Wallet'
            : isVaultPending
              ? 'Processing...'
              : vaultData?.paused
                ? 'Vault Paused'
                : quoteSignatureValid === false
                  ? 'Invalid Quote Signature'
                  : requiresApproval
                    ? 'Approve & Deposit'
                    : 'Submit Deposit'}
        </Button>

        {/* Pending Deposits list (boxes) below */}
        {depositRequest &&
          (userData?.depositIndex ?? 0n) > 0n &&
          !depositRequest.processed && (
            <div className="mt-4 space-y-2">
              <div className="p-3 bg-muted/30 border border-border rounded-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium">Pending Deposit</p>
                    <p className="text-xs">
                      {formatAssetAmount(depositRequest.amount)} testUSDe
                      {depositQueuePosition
                        ? ` · Queue #${depositQueuePosition}`
                        : ''}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      Date.now() <
                      (Number(depositRequest.timestamp) +
                        Number(vaultData?.withdrawalDelay ?? 0n)) *
                        1000
                    }
                    onClick={() => cancelDeposit(VAULT_CHAIN_ID)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
      </TabsContent>

      <TabsContent value="withdraw" className="space-y-2 mt-1">
        {/* Amount Input */}
        <div className="space-y-0.5">
          <div className="border border-input bg-background rounded-md px-3 py-3">
            <div className="flex items-center justify-between mb-0">
              <Input
                placeholder="0.0"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="text-lg bg-transparent border-none p-0 h-auto font-normal placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <div className="flex items-center gap-2">
                <span className="text-lg text-muted-foreground">testUSDe</span>
              </div>
            </div>
          </div>
        </div>

        {/* Balance and Requested row (outside input box) */}
        <div className="flex items-center justify-between text-sm text-muted-foreground py-0">
          <div className="flex items-center gap-2">
            <span>
              Balance:{' '}
              {userData ? formatSharesAmount(userData?.balance ?? 0n) : '0'}{' '}
              sapLP
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() =>
                setWithdrawAmount(
                  userData ? formatSharesAmount(userData?.balance ?? 0n) : '0'
                )
              }
            >
              MAX
            </Button>
          </div>
          {withdrawAmount &&
            estWithdrawAssets > 0n &&
            !withdrawExceedsShareBalance && (
              <div className="text-right">
                Requested Collateral: {formatAssetAmount(estWithdrawAssets)}{' '}
                testUSDe
              </div>
            )}
        </div>

        {/* Withdraw Button */}
        <Button
          size="lg"
          className="w-full text-base !mt-6"
          disabled={
            !isConnected ||
            !withdrawAmount ||
            isVaultPending ||
            vaultData?.paused ||
            quoteSignatureValid === false
          }
          onClick={() => requestWithdrawal(withdrawAmount, VAULT_CHAIN_ID)}
        >
          {!isConnected
            ? 'Connect Wallet'
            : isVaultPending
              ? 'Processing...'
              : vaultData?.paused
                ? 'Vault Paused'
                : quoteSignatureValid === false
                  ? 'Invalid Quote Signature'
                  : 'Request Withdrawal'}
        </Button>

        {/* Pending Withdrawal as cancel button below */}
        {withdrawalRequest &&
          (userData?.withdrawalIndex ?? 0n) > 0n &&
          !withdrawalRequest.processed && (
            <Button
              variant="outline"
              className="w-full mt-4"
              disabled={
                Date.now() <
                (Number(withdrawalRequest.timestamp) +
                  Number(vaultData?.withdrawalDelay ?? 0n)) *
                  1000
              }
              onClick={() => cancelWithdrawal(VAULT_CHAIN_ID)}
            >
              Pending withdrawal: {formatSharesAmount(withdrawalRequest.shares)}{' '}
              · Cancel
            </Button>
          )}
      </TabsContent>
    </Tabs>
  );

  return (
    <div className="relative min-h-screen">
      {/* Spline Background - Full Width */}
      <div className="absolute inset-0 pointer-events-none top-0 left-0 w-full h-100dvh -scale-y-100 -translate-y-1/4 opacity-50 dark:opacity-75">
        <iframe
          ref={iframeRef}
          src="https://my.spline.design/particlesfutarchy-SDhuN0OYiCRHRPt2fFec4bCm/"
          className="w-full h-full"
          style={{
            opacity: 0.5,
            border: 'none',
            colorScheme: 'light',
            filter: 'none',
          }}
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-same-origin allow-scripts allow-downloads allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
        />
        <div className="absolute top-0 left-0 h-full w-[100px] bg-gradient-to-r from-background to-transparent hidden md:block" />
      </div>

      {/* Main Content */}
      <div className="container max-w-[600px] mx-auto px-4 pt-32 pb-12 relative z-10">
        <div className="mb-5 md:mb-10 flex items-center justify-between">
          <h1 className="text-3xl md:text-5xl font-heading font-normal">
            Vaults
          </h1>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex pointer-events-auto" tabIndex={0}>
                <Button size="sm" disabled aria-label="Coming soon">
                  <VaultIcon className="h-8 w-8" aria-hidden="true" />
                  Deploy Vault
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Coming soon</TooltipContent>
          </Tooltip>
        </div>

        <div className="grid grid-cols-1 gap-8">
          {/* Vault */}
          <div>
            {/* TEMP: Gate Active UI behind env. Set NEXT_PUBLIC_ENABLE_VAULTS="1" to enable. */}
            {vaultsFeatureEnabled &&
            process.env.NEXT_PUBLIC_ENABLE_VAULTS === '1' ? (
              /* Active Vault Interface */
              <Card className="relative isolate overflow-hidden bg-background/[0.2] backdrop-blur-[2px] border border-gray-500/20 rounded-xl shadow-sm">
                <CardContent className="p-6">
                  <div className="space-y-6">
                    {/* Vault Header */}
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-2xl font-medium mb-1">
                          Protocol Vault
                        </h3>
                        <p className="text-muted-foreground text-lg">
                          This vault is used to bid on parlay requests.
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">
                          Your Deposits
                        </div>
                        <div className="text-lg font-medium">
                          {isLoadingUserData
                            ? '...'
                            : userData
                              ? formatSharesAmount(userData?.balance ?? 0n)
                              : '0.00'}{' '}
                          testUSDe
                        </div>
                      </div>
                    </div>

                    {/* Deposit/Withdraw Tabs */}
                    {renderVaultForm()}
                    {/* moved pending deposit cancel into deposit tab below button */}
                  </div>
                </CardContent>
              </Card>
            ) : (
              /* Coming Soon State - Normal Interface with Overlay */
              <Card className="relative isolate overflow-hidden bg-background/[0.2] backdrop-blur-[2px] border border-gray-500/20 rounded-xl shadow-sm">
                <CardContent
                  className={`relative z-10 p-6 ${!vaultsFeatureEnabled ? 'pointer-events-none select-none filter blur-sm' : ''}`}
                >
                  <div className="space-y-6">
                    {/* Vault Header */}
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-2xl font-medium">
                          Parlay Liquidity Vault
                        </h3>
                      </div>
                    </div>

                    {/* Deposit/Withdraw Tabs */}
                    {renderVaultForm()}
                  </div>
                </CardContent>
                {!vaultsFeatureEnabled && <ComingSoonOverlay />}
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VaultsPageContent;
