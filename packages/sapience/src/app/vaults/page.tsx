'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@sapience/ui/components/ui/button';
import { Card, CardContent } from '@sapience/ui/components/ui/card';
import { Input } from '@sapience/ui/components/ui/input';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@sapience/ui/components/ui/tabs';
import { useAccount, useChainId } from 'wagmi';
import { usePassiveLiquidityVault } from '~/hooks/contract/usePassiveLiquidityVault';

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

const VaultsPage = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { isConnected } = useAccount();
  const chainId = useChainId();

  // OTC feature flag detection (same as in betslip)
  const [parlayFeatureOverrideEnabled, setParlayFeatureOverrideEnabled] =
    useState(false);

  // Vault integration
  const {
    vaultData,
    userData,
    userAssetBalance,
    isLoadingUserData,
    isVaultPending,
    deposit,
    requestWithdrawal,
    formatAssetAmount,
    formatSharesAmount,
    formatUtilizationRate,
    formatWithdrawalDelay,
  } = usePassiveLiquidityVault();

  // Form state
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');

  useEffect(() => {
    try {
      const params =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search)
          : null;
      const urlParlays = params?.get('otc');
      if (urlParlays === 'true') {
        window.localStorage.setItem('otc', 'true');
      }
      const stored =
        typeof window !== 'undefined'
          ? window.localStorage.getItem('otc')
          : null;
      if (stored === 'true') {
        setParlayFeatureOverrideEnabled(true);
      }
    } catch {
      // no-op
    }
  }, []);

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
      <div className="container max-w-[750px] mx-auto px-4 pt-32 pb-12 relative z-10">
        <h1 className="text-3xl md:text-5xl font-heading font-normal mb-6 md:mb-12">
          Vaults
        </h1>

        <div className="grid grid-cols-1 gap-16">
          {/* Vault */}
          <div>
            {/* TEMP: Gate Active UI behind env. Set NEXT_PUBLIC_ENABLE_VAULTS="1" to enable. */}
            {parlayFeatureOverrideEnabled &&
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
                        <p className="text-muted-foreground">
                          This vault is used to bid on auction orders.
                        </p>
                        {vaultData && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            Utilization:{' '}
                            {formatUtilizationRate(
                              vaultData?.utilizationRate ?? 0n
                            )}
                            % • Delay:{' '}
                            {formatWithdrawalDelay(
                              vaultData?.withdrawalDelay ?? 0n
                            )}
                            {vaultData?.emergencyMode &&
                              ' • Emergency Mode Active'}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">
                          Your Balance
                        </div>
                        <div className="text-lg font-medium">
                          {isLoadingUserData
                            ? '...'
                            : userData
                              ? formatSharesAmount(userData?.balance ?? 0n)
                              : '0.00'}{' '}
                          testUSDe
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {isLoadingUserData
                            ? '...'
                            : userAssetBalance
                              ? formatAssetAmount(userAssetBalance)
                              : '0.00'}{' '}
                          testUSDe available
                        </div>
                      </div>
                    </div>

                    {/* Deposit/Withdraw Tabs */}
                    <Tabs defaultValue="deposit" className="w-full">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="deposit">Deposit</TabsTrigger>
                        <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
                      </TabsList>

                      <TabsContent value="deposit" className="space-y-4 mt-6">
                        {/* Amount Input */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium">
                            Amount to Deposit
                          </label>
                          <div className="border border-input bg-background rounded-md p-3">
                            <div className="flex items-center justify-between mb-1">
                              <Input
                                placeholder="0.0"
                                value={depositAmount}
                                onChange={(e) =>
                                  setDepositAmount(e.target.value)
                                }
                                className="text-2xl bg-transparent border-none p-0 h-auto font-normal placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                              />
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-muted rounded-full flex items-center justify-center">
                                  <span className="text-xs font-bold text-muted-foreground">
                                    $
                                  </span>
                                </div>
                                <span className="text-sm font-medium">
                                  testUSDe
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">
                                ≈ ${depositAmount || '0'}
                              </span>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  onClick={() =>
                                    setDepositAmount(
                                      userAssetBalance
                                        ? formatAssetAmount(userAssetBalance)
                                        : '0'
                                    )
                                  }
                                >
                                  MAX
                                </Button>
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <span>
                                    {userAssetBalance
                                      ? formatAssetAmount(userAssetBalance)
                                      : '0'}{' '}
                                    testUSDe
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Deposit Button */}
                        <Button
                          className="w-full py-3 px-4 rounded text-base font-normal"
                          disabled={
                            !isConnected ||
                            !depositAmount ||
                            isVaultPending ||
                            vaultData?.paused
                          }
                          onClick={() => deposit(depositAmount, chainId)}
                        >
                          {!isConnected
                            ? 'Connect Wallet'
                            : isVaultPending
                              ? 'Processing...'
                              : vaultData?.paused
                                ? 'Vault Paused'
                                : 'Deposit testUSDe'}
                        </Button>
                      </TabsContent>

                      <TabsContent value="withdraw" className="space-y-4 mt-6">
                        {/* Amount Input */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium">
                            Amount to Withdraw
                          </label>
                          <div className="border border-input bg-background rounded-md p-3">
                            <div className="flex items-center justify-between mb-1">
                              <Input
                                placeholder="0.0"
                                value={withdrawAmount}
                                onChange={(e) =>
                                  setWithdrawAmount(e.target.value)
                                }
                                className="text-2xl bg-transparent border-none p-0 h-auto font-normal placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                              />
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-muted rounded-full flex items-center justify-center">
                                  <span className="text-xs font-bold text-muted-foreground">
                                    S
                                  </span>
                                </div>
                                <span className="text-sm font-medium">
                                  testUSDe
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">
                                ≈ ${withdrawAmount || '0'}
                              </span>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  onClick={() =>
                                    setWithdrawAmount(
                                      userData
                                        ? formatSharesAmount(
                                            userData?.balance ?? 0n
                                          )
                                        : '0'
                                    )
                                  }
                                >
                                  MAX
                                </Button>
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <span>
                                    {userData
                                      ? formatSharesAmount(
                                          userData?.balance ?? 0n
                                        )
                                      : '0'}{' '}
                                    testUSDe
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Pending Withdrawal Info */}
                        {(userData?.pendingWithdrawal ?? 0n) > 0n && (
                          <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
                            <div className="text-sm text-yellow-700 dark:text-yellow-300">
                              <p className="font-medium">Pending Withdrawal</p>
                              <p className="text-xs">
                                {formatAssetAmount(
                                  userData?.pendingWithdrawal ?? 0n
                                )}{' '}
                                testUSDe queued for withdrawal
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Withdrawal Info */}
                        <div className="p-3 bg-muted/50 rounded-md">
                          <div className="text-sm text-muted-foreground">
                            Withdrawals are queued with a{' '}
                            {vaultData
                              ? formatWithdrawalDelay(
                                  vaultData?.withdrawalDelay ?? 0n
                                )
                              : '1 day'}{' '}
                            delay to ensure vault stability and proper liquidity
                            management.
                          </div>
                        </div>

                        {/* Withdraw Button */}
                        <Button
                          className="w-full py-3 px-4 rounded text-base font-normal"
                          disabled={
                            !isConnected ||
                            !withdrawAmount ||
                            isVaultPending ||
                            vaultData?.paused
                          }
                          onClick={() =>
                            requestWithdrawal(withdrawAmount, chainId)
                          }
                        >
                          {!isConnected
                            ? 'Connect Wallet →'
                            : isVaultPending
                              ? 'Processing...'
                              : vaultData?.paused
                                ? 'Vault Paused'
                                : 'Request Withdrawal'}
                        </Button>
                      </TabsContent>
                    </Tabs>
                  </div>
                </CardContent>
              </Card>
            ) : (
              /* Coming Soon State - Normal Interface with Overlay */
              <Card className="relative isolate overflow-hidden bg-background/[0.2] backdrop-blur-[2px] border border-gray-500/20 rounded-xl shadow-sm">
                <CardContent className="relative z-10 p-6 pointer-events-none select-none filter blur-sm">
                  <div className="space-y-6">
                    {/* Vault Header */}
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-medium">Protocol Vault</h3>
                        <p className="text-sm text-muted-foreground">
                          This vault is used to bid on auction orders.
                        </p>
                        {vaultData && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            Utilization:{' '}
                            {formatUtilizationRate(
                              vaultData?.utilizationRate ?? 0n
                            )}
                            % • Delay:{' '}
                            {formatWithdrawalDelay(
                              vaultData?.withdrawalDelay ?? 0n
                            )}
                            {vaultData?.emergencyMode &&
                              ' • Emergency Mode Active'}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">
                          Your Balance
                        </div>
                        <div className="text-lg font-medium">
                          {isLoadingUserData
                            ? '...'
                            : userData
                              ? formatSharesAmount(userData.balance)
                              : '0.00'}{' '}
                          testUSDe
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {isLoadingUserData
                            ? '...'
                            : userAssetBalance
                              ? formatAssetAmount(userAssetBalance)
                              : '0.00'}{' '}
                          testUSDe available
                        </div>
                      </div>
                    </div>

                    {/* Deposit/Withdraw Tabs */}
                    <Tabs defaultValue="deposit" className="w-full">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="deposit">Deposit</TabsTrigger>
                        <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
                      </TabsList>

                      <TabsContent value="deposit" className="space-y-4 mt-6">
                        {/* Amount Input */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium">
                            Amount to Deposit
                          </label>
                          <div className="border border-input bg-background rounded-md p-3">
                            <div className="flex items-center justify-between mb-1">
                              <Input
                                placeholder="0.0"
                                value={depositAmount}
                                onChange={(e) =>
                                  setDepositAmount(e.target.value)
                                }
                                className="text-2xl bg-transparent border-none p-0 h-auto font-normal placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                              />
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-muted rounded-full flex items-center justify-center">
                                  <span className="text-xs font-bold text-muted-foreground">
                                    $
                                  </span>
                                </div>
                                <span className="text-sm font-medium">
                                  testUSDe
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">
                                ≈ ${depositAmount || '0'}
                              </span>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  onClick={() =>
                                    setDepositAmount(
                                      userAssetBalance
                                        ? formatAssetAmount(userAssetBalance)
                                        : '0'
                                    )
                                  }
                                >
                                  MAX
                                </Button>
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <span>
                                    {userAssetBalance
                                      ? formatAssetAmount(userAssetBalance)
                                      : '0'}{' '}
                                    testUSDe
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Deposit Button */}
                        <Button
                          className="w-full py-3 px-4 rounded text-base font-normal"
                          disabled={
                            !isConnected ||
                            !depositAmount ||
                            isVaultPending ||
                            vaultData?.paused
                          }
                          onClick={() => deposit(depositAmount, chainId)}
                        >
                          {!isConnected
                            ? 'Connect Wallet →'
                            : isVaultPending
                              ? 'Processing...'
                              : vaultData?.paused
                                ? 'Vault Paused'
                                : 'Deposit testUSDe'}
                        </Button>
                      </TabsContent>

                      <TabsContent value="withdraw" className="space-y-4 mt-6">
                        {/* Amount Input */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium">
                            Amount to Withdraw
                          </label>
                          <div className="border border-input bg-background rounded-md p-3">
                            <div className="flex items-center justify-between mb-1">
                              <Input
                                placeholder="0.0"
                                value={withdrawAmount}
                                onChange={(e) =>
                                  setWithdrawAmount(e.target.value)
                                }
                                className="text-2xl bg-transparent border-none p-0 h-auto font-normal placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                              />
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-muted rounded-full flex items-center justify-center">
                                  <span className="text-xs font-bold text-muted-foreground">
                                    S
                                  </span>
                                </div>
                                <span className="text-sm font-medium">
                                  testUSDe
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">
                                ≈ ${withdrawAmount || '0'}
                              </span>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  onClick={() =>
                                    setWithdrawAmount(
                                      userData
                                        ? formatSharesAmount(
                                            userData?.balance ?? 0n
                                          )
                                        : '0'
                                    )
                                  }
                                >
                                  MAX
                                </Button>
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <span>
                                    {userData
                                      ? formatSharesAmount(
                                          userData?.balance ?? 0n
                                        )
                                      : '0'}{' '}
                                    testUSDe
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Pending Withdrawal Info */}
                        {(userData?.pendingWithdrawal ?? 0n) > 0n && (
                          <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
                            <div className="text-sm text-yellow-700 dark:text-yellow-300">
                              <p className="font-medium">Pending Withdrawal</p>
                              <p className="text-xs">
                                {formatAssetAmount(
                                  userData?.pendingWithdrawal ?? 0n
                                )}{' '}
                                testUSDe queued for withdrawal
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Withdrawal Info */}
                        <div className="p-3 bg-muted/50 rounded-md">
                          <div className="text-sm text-muted-foreground">
                            <p className="mb-1">Withdrawal Process:</p>
                            <p className="text-xs">
                              Withdrawals are queued with a{' '}
                              {vaultData
                                ? formatWithdrawalDelay(
                                    vaultData?.withdrawalDelay ?? 0n
                                  )
                                : '1 day'}{' '}
                              delay to ensure vault stability and proper
                              liquidity management.
                            </p>
                          </div>
                        </div>

                        {/* Withdraw Button */}
                        <Button
                          className="w-full py-3 px-4 rounded text-base font-normal"
                          disabled={
                            !isConnected ||
                            !withdrawAmount ||
                            isVaultPending ||
                            vaultData?.paused
                          }
                          onClick={() =>
                            requestWithdrawal(withdrawAmount, chainId)
                          }
                        >
                          {!isConnected
                            ? 'Connect Wallet'
                            : isVaultPending
                              ? 'Processing...'
                              : vaultData?.paused
                                ? 'Vault Paused'
                                : 'Request Withdrawal'}
                        </Button>
                      </TabsContent>
                    </Tabs>
                  </div>
                </CardContent>

                <ComingSoonOverlay />
              </Card>
            )}
          </div>

          {/* User Vaults */}
          <div>
            <h2 className="text-2xl font-heading font-normal mb-4">
              User Vaults
            </h2>
            <p className="text-muted-foreground mb-4">Coming soon.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VaultsPage;
