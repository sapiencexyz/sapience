'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { formatUnits, parseUnits } from 'viem';
import { useAccount, useSwitchChain, useBalance } from 'wagmi';
import { ArrowLeftRight } from 'lucide-react';
import Image from 'next/image';

const CowSwapEmbed = dynamic(
  () =>
    import('~/components/swap/CowSwapEmbed').then((mod) => mod.CowSwapEmbed),
  { ssr: false }
);

import {
  Tabs,
  TabsContent,
  TabsTrigger,
} from '@sapience/ui/components/ui/tabs';
import { Input } from '@sapience/ui/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/ui/components/ui/select';
import { CHAIN_ID_ETHEREAL, CHAIN_ID_ARBITRUM } from '@sapience/sdk/constants';
import { useToast } from '@sapience/ui/hooks/use-toast';
import SegmentedTabsList from '~/components/shared/SegmentedTabsList';

import { useCurrentAddress } from '~/hooks/blockchain/useCurrentAddress';
import { useConnectDialog } from '~/lib/context/ConnectDialogContext';
import { useSession } from '~/lib/context/SessionContext';
import {
  usePositionBalances,
  type PositionBalance,
} from '~/hooks/graphql/usePositions';
import { useConditionsByIds } from '~/hooks/graphql/useConditionsByIds';
import {
  useBridgeQuote,
  useBridgeApproval,
  useBridgeExecute,
  usePendingBridges,
} from '~/hooks/bridge/useBridge';
import {
  StackedIcons,
  StackedPredictionsTitle,
} from '~/components/shared/StackedPredictions';
import { toPicks } from '~/components/positions/toPickLegs';
import type { ConditionsMap } from '~/components/positions/toPickLegs';
import CounterpartyBadge from '~/components/shared/CounterpartyBadge';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHAINS = [
  { id: CHAIN_ID_ETHEREAL, name: 'Ethereal', nativeCurrency: 'USDe' },
  { id: CHAIN_ID_ARBITRUM, name: 'Arbitrum', nativeCurrency: 'ETH' },
] as const;

function getChainName(id: number) {
  return CHAINS.find((c) => c.id === id)?.name ?? `Chain ${id}`;
}

function getChainNativeCurrency(id: number) {
  return CHAINS.find((c) => c.id === id)?.nativeCurrency ?? 'ETH';
}

function formatTokenLabel(pos: PositionBalance): string {
  const side = pos.isPredictorToken ? 'Predictor' : 'Counterparty';
  const id = pos.pickConfigId.slice(0, 8);
  return `${side} · ${id}…`;
}

function formatBalance(balance: string, decimals = 18): string {
  try {
    const val = formatUnits(BigInt(balance), decimals);
    const num = parseFloat(val);
    if (num === 0) return '0';
    if (num < 0.0001) return '<0.0001';
    return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
  } catch {
    return '0';
  }
}

// ---------------------------------------------------------------------------
// Chain icon components
// ---------------------------------------------------------------------------

function ArbitrumIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M21.84 17.32L25.52 11.36L32.44 22.16L32.46 24.82L32.42 11.7C32.38 11.14 32.06 10.64 31.58 10.36L20.84 4.2C20.36 3.94 19.76 3.94 19.28 4.18L8.42 10.36C7.94 10.64 7.62 11.14 7.58 11.7L7.56 24.66L14.38 13.92C15.18 12.54 17.06 12.08 19.02 12.14L20.52 12.18L9.18 30.76L10.5 31.52L21.98 12.2L26.78 12.18L15.14 31.72L19.62 34.3L20 34.52L20.4 34.3L31.62 27.96L28.56 29.72L21.84 17.32Z"
        fill="white"
      />
      <path
        d="M28.56 29.72L31.62 27.96L32.46 24.82L32.44 22.16L25.52 11.36L21.84 17.32L28.56 29.72Z"
        fill="white"
        fillOpacity="0.6"
      />
      <path
        d="M7.56 27.38L9.18 30.76L20.52 12.18L19.02 12.14C17.06 12.08 15.18 12.54 14.38 13.92L7.56 24.66V27.38Z"
        fill="white"
        fillOpacity="0.6"
      />
    </svg>
  );
}

function EtherealIcon() {
  return (
    <Image src="/ethereal-logomark.svg" alt="Ethereal" width={20} height={20} />
  );
}

function ChainIcon({ chainId }: { chainId: number }) {
  if (chainId === CHAIN_ID_ARBITRUM) return <ArbitrumIcon />;
  return <EtherealIcon />;
}

// ---------------------------------------------------------------------------
// Swap section – embedded CowSwap widget for Arbitrum position tokens
// ---------------------------------------------------------------------------
function SwapSection() {
  return <CowSwapEmbed />;
}

// ---------------------------------------------------------------------------
// Bridge section – bridge with EOA-default recipient
// ---------------------------------------------------------------------------
function BridgeSection() {
  const { currentAddress, isConnected } = useCurrentAddress();
  const { address: walletAddress, chain: walletChain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { openConnectDialog } = useConnectDialog();
  const { smartAccountAddress } = useSession();
  const { toast } = useToast();

  // Direction
  const [fromChainId, setFromChainId] = useState<number>(CHAIN_ID_ETHEREAL);
  const toChainId =
    fromChainId === CHAIN_ID_ETHEREAL ? CHAIN_ID_ARBITRUM : CHAIN_ID_ETHEREAL;

  // Token selection
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<string>('');
  const [amountInput, setAmountInput] = useState('');

  // Recipient toggle: when bridging to Ethereal, choose smart account vs EOA
  const [sendToEoa, setSendToEoa] = useState(false);

  // Load positions on from chain
  const { data: positions, isLoading: isLoadingPositions } =
    usePositionBalances({
      holder: currentAddress,
      chainId: fromChainId,
    });

  // Filter positions with non-zero balance
  const availablePositions = useMemo(
    () => positions.filter((p) => BigInt(p.balance) > 0n),
    [positions]
  );

  // Collect all condition IDs for category icon stacks
  const conditionIds = useMemo(
    () =>
      Array.from(
        new Set(
          availablePositions.flatMap(
            (p) => p.pickConfig?.picks.map((pk) => pk.conditionId) ?? []
          )
        )
      ),
    [availablePositions]
  );
  const { map: conditionsMap } = useConditionsByIds(conditionIds);

  // Selected position
  const selectedPosition = useMemo(
    () =>
      availablePositions.find((p) => p.tokenAddress === selectedTokenAddress),
    [availablePositions, selectedTokenAddress]
  );

  // Parse amount
  const parsedAmount = useMemo(() => {
    if (!amountInput) return undefined;
    try {
      return parseUnits(amountInput, 18);
    } catch {
      return undefined;
    }
  }, [amountInput]);

  // Recipient logic:
  // - To Ethereal: smart account by default, EOA if toggled
  // - To Arbitrum: always EOA wallet
  const recipient = useMemo(() => {
    if (toChainId === CHAIN_ID_ETHEREAL && !sendToEoa && smartAccountAddress) {
      return smartAccountAddress;
    }
    return walletAddress;
  }, [toChainId, sendToEoa, smartAccountAddress, walletAddress]);

  // Quote
  const {
    nativeFee,
    nativeFeeFormatted,
    isLoading: isQuoting,
  } = useBridgeQuote({
    tokenAddress: selectedTokenAddress as `0x${string}`,
    amount: parsedAmount,
    fromChainId,
    enabled: !!selectedTokenAddress && !!parsedAmount && parsedAmount > 0n,
  });

  // Approval
  const { hasAllowance, isLoadingAllowance, approve, isApproving } =
    useBridgeApproval({
      tokenAddress: selectedTokenAddress as `0x${string}`,
      amount: parsedAmount,
      fromChainId,
      enabled: !!selectedTokenAddress && !!parsedAmount && parsedAmount > 0n,
    });

  // Bridge execution
  const { bridge, isBridging, bridgeSuccess, resetBridgeSuccess } =
    useBridgeExecute({ fromChainId });

  // Pending bridges (check both chains)
  const { bridgeIds: pendingFromSource } = usePendingBridges({
    fromChainId,
    enabled: isConnected,
  });

  // Native balance for LZ fee check
  const { data: nativeBalance } = useBalance({
    address: walletAddress,
    chainId: fromChainId,
    query: { enabled: isConnected && !!walletAddress },
  });

  const insufficientNativeBalance = useMemo(() => {
    if (!nativeFee || !nativeBalance) return false;
    return nativeBalance.value < nativeFee;
  }, [nativeFee, nativeBalance]);

  // Swap direction
  const handleSwapDirection = useCallback(() => {
    setFromChainId(toChainId);
    setSelectedTokenAddress('');
    setAmountInput('');
    resetBridgeSuccess();
  }, [toChainId, resetBridgeSuccess]);

  // Max button
  const handleMax = useCallback(() => {
    if (selectedPosition) {
      const bal = formatUnits(BigInt(selectedPosition.balance), 18);
      setAmountInput(bal);
    }
  }, [selectedPosition]);

  // Clear form on success
  useEffect(() => {
    if (bridgeSuccess) {
      setAmountInput('');
      setSelectedTokenAddress('');
    }
  }, [bridgeSuccess]);

  // Validation
  const amountExceedsBalance = useMemo(() => {
    if (!parsedAmount || !selectedPosition) return false;
    return parsedAmount > BigInt(selectedPosition.balance);
  }, [parsedAmount, selectedPosition]);

  const canBridge =
    isConnected &&
    !!selectedTokenAddress &&
    !!parsedAmount &&
    parsedAmount > 0n &&
    !amountExceedsBalance &&
    !!recipient &&
    !!nativeFee;

  const handleBridge = async () => {
    if (!canBridge || !nativeFee || !recipient) return;

    // Ensure wallet is on the correct source chain
    if (walletChain?.id !== fromChainId) {
      try {
        await switchChainAsync({ chainId: fromChainId });
      } catch {
        // User rejected chain switch
      }
      return; // Let user click again after chain switch
    }

    try {
      if (!hasAllowance) {
        await approve();
        // Approval will trigger refetchAllowance, user clicks again for bridge
        return;
      }

      await bridge({
        tokenAddress: selectedTokenAddress as `0x${string}`,
        recipient,
        amount: parsedAmount,
        nativeFee,
      });
    } catch (error) {
      toast({
        title: 'Bridge Failed',
        description:
          error instanceof Error ? error.message : 'Transaction failed',
        variant: 'destructive',
      });
    }
  };

  // Button text
  const getButtonText = () => {
    if (!isConnected) return 'Connect Wallet';
    if (!selectedTokenAddress) return 'Select a Token';
    if (!amountInput || !parsedAmount || parsedAmount === 0n)
      return 'Enter Amount';
    if (amountExceedsBalance) return 'Insufficient Balance';
    if (insufficientNativeBalance)
      return `Insufficient ${getChainNativeCurrency(fromChainId)} for Fee`;
    if (walletChain?.id !== fromChainId)
      return `Switch to ${getChainName(fromChainId)}`;
    if (isQuoting) return 'Getting Quote…';
    if (isApproving) return 'Approving…';
    if (isBridging) return 'Bridging…';
    if (!hasAllowance && !isLoadingAllowance) return 'Approve & Bridge';
    return 'Bridge';
  };

  // Allow clicking for connect wallet and chain switching even when canBridge is false
  const needsChainSwitch =
    isConnected && walletChain?.id !== fromChainId && canBridge;
  const isButtonDisabled =
    (!isConnected ? false : needsChainSwitch ? false : !canBridge) ||
    isApproving ||
    isBridging ||
    amountExceedsBalance ||
    insufficientNativeBalance;

  return (
    <>
      <div className="overflow-hidden rounded-[25px] bg-bridge-card p-5 space-y-4">
        {/* Chain direction row */}
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
              From
            </span>
            <div className="flex h-10 items-center gap-2 rounded-xl bg-bridge-input px-3 text-sm font-medium text-white">
              <ChainIcon chainId={fromChainId} />
              {getChainName(fromChainId)}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSwapDirection}
            title="Swap direction"
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bridge-swap-button transition-colors hover:brightness-125"
          >
            <ArrowLeftRight className="h-3.5 w-3.5 text-accent-gold" />
          </button>

          <div className="flex-1 space-y-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
              To
            </span>
            <div className="flex h-10 items-center gap-2 rounded-xl bg-bridge-input px-3 text-sm font-medium text-white">
              <ChainIcon chainId={toChainId} />
              {getChainName(toChainId)}
            </div>
          </div>
        </div>

        {/* Recipient toggle — only when bridging to Ethereal */}
        {toChainId === CHAIN_ID_ETHEREAL &&
          isConnected &&
          smartAccountAddress && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Recipient
              </span>
              <div className="flex items-center gap-1 rounded-xl bg-bridge-input p-1">
                <button
                  type="button"
                  onClick={() => setSendToEoa(false)}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    !sendToEoa
                      ? 'bg-bridge-accent text-bridge-card'
                      : 'text-white/50 hover:text-white/70'
                  }`}
                >
                  Smart Account
                </button>
                <button
                  type="button"
                  onClick={() => setSendToEoa(true)}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    sendToEoa
                      ? 'bg-bridge-accent text-bridge-card'
                      : 'text-white/50 hover:text-white/70'
                  }`}
                >
                  EOA
                </button>
              </div>
              {recipient && (
                <p className="text-[11px] text-white/40 pl-1 font-mono">
                  {recipient.slice(0, 6)}…{recipient.slice(-4)}
                </p>
              )}
            </div>
          )}

        {/* Token selector */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
            Position Token
          </span>
          <Select
            value={selectedTokenAddress}
            onValueChange={(v) => {
              setSelectedTokenAddress(v);
              setAmountInput('');
            }}
            disabled={!isConnected || isLoadingPositions}
          >
            <SelectTrigger className="border-none text-white rounded-xl h-10 bg-bridge-input">
              <SelectValue
                placeholder={
                  isLoadingPositions
                    ? 'Loading positions…'
                    : availablePositions.length === 0
                      ? 'No positions on this chain'
                      : 'Select a position token'
                }
              />
            </SelectTrigger>
            <SelectContent className="border-none rounded-xl bg-bridge-input min-w-[340px]">
              {availablePositions.map((pos) => {
                const picks = pos.pickConfig?.picks
                  ? toPicks(
                      pos.pickConfig.picks,
                      pos.isPredictorToken,
                      conditionsMap as ConditionsMap
                    )
                  : [];
                return (
                  <SelectItem
                    key={pos.tokenAddress}
                    value={pos.tokenAddress}
                    className="pl-2 [&>span]:w-full"
                  >
                    <span className="flex w-full items-center gap-3">
                      <span className="flex items-center gap-2 min-w-0 flex-1">
                        {picks.length > 0 ? (
                          <>
                            <StackedIcons picks={picks} />
                            <StackedPredictionsTitle
                              picks={picks}
                              maxWidthClass="max-w-[200px]"
                            />
                            {!pos.isPredictorToken && <CounterpartyBadge />}
                          </>
                        ) : (
                          <>
                            <span
                              className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                                pos.isPredictorToken
                                  ? 'bg-green-500'
                                  : 'bg-red-500'
                              }`}
                            />
                            <span className="text-white truncate">
                              {formatTokenLabel(pos)}
                            </span>
                          </>
                        )}
                      </span>
                      <span className="text-sm font-mono text-white shrink-0 tabular-nums ml-6">
                        {formatBalance(pos.balance)}
                      </span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Amount input */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
              Amount
            </span>
            {selectedPosition && (
              <span className="text-xs text-white/40">
                Balance: {formatBalance(selectedPosition.balance)}
              </span>
            )}
          </div>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0.0"
            value={amountInput}
            onChange={(e) => {
              const val = e.target.value;
              if (/^[0-9]*\.?[0-9]*$/.test(val)) {
                setAmountInput(val);
              }
            }}
            disabled={!selectedTokenAddress}
            className="border-none text-lg text-white rounded-xl h-12 pr-16 bg-bridge-input"
            endAdornment={
              <button
                type="button"
                onClick={handleMax}
                disabled={!selectedPosition}
                className="mr-3 text-xs font-semibold text-accent-gold transition-opacity disabled:opacity-30"
              >
                MAX
              </button>
            }
          />
          {amountExceedsBalance && (
            <p className="text-xs text-destructive">
              Amount exceeds available balance
            </p>
          )}
        </div>

        {/* Fee display */}
        {nativeFeeFormatted && (
          <div className="flex items-center justify-between rounded-xl bg-bridge-input px-3 py-2.5 text-sm">
            <span className="text-white/40">LayerZero Fee</span>
            <span className="text-bridge-accent">
              {parseFloat(nativeFeeFormatted).toLocaleString(undefined, {
                maximumSignificantDigits: 6,
              })}{' '}
              {getChainNativeCurrency(fromChainId)}
            </span>
          </div>
        )}

        {/* Insufficient native balance warning */}
        {insufficientNativeBalance && nativeFeeFormatted && (
          <div className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Insufficient {getChainNativeCurrency(fromChainId)} to cover the
            LayerZero fee (
            {parseFloat(nativeFeeFormatted).toLocaleString(undefined, {
              maximumSignificantDigits: 6,
            })}{' '}
            {getChainNativeCurrency(fromChainId)} required)
          </div>
        )}

        {/* Bridge button */}
        <button
          type="button"
          className={`w-full rounded-xl py-3.5 text-base font-semibold transition-colors ${
            isButtonDisabled
              ? 'bg-bridge-swap-button text-white/30 cursor-not-allowed'
              : 'bg-bridge-accent text-bridge-card cursor-pointer'
          }`}
          disabled={isButtonDisabled}
          onClick={() => {
            if (!isConnected) {
              openConnectDialog();
              return;
            }
            void handleBridge();
          }}
        >
          {getButtonText()}
        </button>

        {bridgeSuccess && (
          <div className="rounded-xl bg-green-500/10 p-3 text-center text-sm text-green-400">
            Bridge transaction submitted! Your tokens will arrive on{' '}
            {getChainName(toChainId)} shortly.
          </div>
        )}

        {/* Powered by LayerZero — inside card */}
        <p className="pt-1 text-center text-[10px] text-white/25">
          Powered by LayerZero
        </p>
      </div>

      {/* Pending bridges */}
      {isConnected && pendingFromSource.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-[25px] bg-bridge-card p-5">
          <h2 className="mb-3 text-base font-semibold text-white">
            Pending Bridges
          </h2>
          <p className="mb-2 text-xs text-white/40">
            From {getChainName(fromChainId)} — {pendingFromSource.length}{' '}
            pending
          </p>
          <div className="space-y-2">
            {pendingFromSource.map((id) => (
              <div
                key={id}
                className="flex items-center justify-between rounded-xl bg-bridge-input border border-white/[0.08] px-3 py-2 text-xs font-mono"
              >
                <span className="truncate text-white" title={id}>
                  {id.slice(0, 10)}…{id.slice(-8)}
                </span>
                <span className="ml-2 shrink-0 rounded-lg bg-yellow-500/20 px-2 py-0.5 text-yellow-400">
                  Pending
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main layout with tab switcher (URL-routed)
// ---------------------------------------------------------------------------
export function SwapBridgeTabs({
  activeTab,
}: {
  activeTab: 'swap' | 'bridge';
}) {
  return (
    <div className="mx-auto w-full max-w-[480px] px-3 md:px-6 lg:px-8 py-8">
      <Tabs value={activeTab} className="w-full">
        <SegmentedTabsList
          className="w-full mb-4 h-12"
          triggerClassName="h-10 text-base"
        >
          <TabsTrigger value="swap" className="flex-1 justify-center" asChild>
            <Link href="/swap">Swap</Link>
          </TabsTrigger>
          <TabsTrigger value="bridge" className="flex-1 justify-center" asChild>
            <Link href="/bridge">Bridge</Link>
          </TabsTrigger>
        </SegmentedTabsList>

        <TabsContent value="swap" className="mt-0">
          <SwapSection />
        </TabsContent>
        <TabsContent value="bridge" className="mt-0">
          <BridgeSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
