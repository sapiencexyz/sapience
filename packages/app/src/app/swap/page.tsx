'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { formatEther, formatUnits, parseUnits, isAddress } from 'viem';
import { useAccount, useSwitchChain, useBalance } from 'wagmi';
import { ArrowDownUp } from 'lucide-react';
import { CowSwapWidget } from '@cowprotocol/widget-react';
import { CowSwapWidgetParams, TradeType } from '@cowprotocol/widget-lib';

import { Button } from '@sapience/ui/components/ui/button';
import { Card, CardContent } from '@sapience/ui/components/ui/card';
import { Input } from '@sapience/ui/components/ui/input';
import { Label } from '@sapience/ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/ui/components/ui/select';
import {
  etherealChain,
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ARBITRUM,
} from '@sapience/sdk/constants';

import { useCurrentAddress } from '~/hooks/blockchain/useCurrentAddress';
import { useConnectDialog } from '~/lib/context/ConnectDialogContext';
import {
  usePositionBalances,
  type PositionBalance,
} from '~/hooks/graphql/usePositions';
import {
  useBridgeQuote,
  useBridgeApproval,
  useBridgeExecute,
  usePendingBridges,
} from '~/hooks/bridge/useBridge';

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
// CowSwap widget params for Arbitrum swaps
// ---------------------------------------------------------------------------
const cowSwapParams: CowSwapWidgetParams = {
  appCode: 'Sapience',
  width: '100%',
  height: '640px',
  chainId: 42161, // Arbitrum
  tradeType: TradeType.SWAP,
  sell: { asset: '' },
  buy: { asset: 'USDC' },
  theme: 'dark',
};

// ---------------------------------------------------------------------------
// Swap section – CowSwap iframe widget
// ---------------------------------------------------------------------------
function SwapSection() {
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <p className="text-sm text-muted-foreground">
          Swap your bridged position tokens for popular tokens on Arbitrum.
        </p>
        <CowSwapWidget params={cowSwapParams} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Bridge section – existing bridge functionality
// ---------------------------------------------------------------------------
function BridgeSection() {
  const { currentAddress, isConnected } = useCurrentAddress();
  const { address: walletAddress, chain: walletChain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { openConnectDialog } = useConnectDialog();

  // Direction
  const [fromChainId, setFromChainId] = useState<number>(CHAIN_ID_ETHEREAL);
  const toChainId =
    fromChainId === CHAIN_ID_ETHEREAL ? CHAIN_ID_ARBITRUM : CHAIN_ID_ETHEREAL;

  // Token selection
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<string>('');
  const [amountInput, setAmountInput] = useState('');
  const [recipientInput, setRecipientInput] = useState('');

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

  // Selected position
  const selectedPosition = useMemo(
    () => availablePositions.find((p) => p.tokenAddress === selectedTokenAddress),
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

  // Recipient
  const recipient = useMemo(() => {
    if (recipientInput && isAddress(recipientInput)) {
      return recipientInput as `0x${string}`;
    }
    return currentAddress as `0x${string}` | undefined;
  }, [recipientInput, currentAddress]);

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
  const {
    hasAllowance,
    isLoadingAllowance,
    approve,
    isApproving,
    refetchAllowance,
  } = useBridgeApproval({
    tokenAddress: selectedTokenAddress as `0x${string}`,
    amount: parsedAmount,
    fromChainId,
    enabled: !!selectedTokenAddress && !!parsedAmount && parsedAmount > 0n,
  });

  // Bridge execution
  const { bridge, isBridging, bridgeSuccess, resetBridgeSuccess } =
    useBridgeExecute({ fromChainId });

  // Pending bridges (check both chains)
  const { bridgeIds: pendingFromSource, isLoading: isLoadingPending } =
    usePendingBridges({ fromChainId, enabled: isConnected });

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

  // Set default recipient from wallet
  useEffect(() => {
    if (!recipientInput && currentAddress) {
      // We don't set it - the default is the connected address
    }
  }, [currentAddress, recipientInput]);

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

    if (!hasAllowance) {
      await approve();
      // Approval will trigger refetchAllowance, user clicks again for bridge
      return;
    }

    await bridge({
      tokenAddress: selectedTokenAddress as `0x${string}`,
      recipient,
      amount: parsedAmount!,
      nativeFee,
    });
  };

  // Button text
  const getButtonText = () => {
    if (!isConnected) return 'Connect Wallet';
    if (!selectedTokenAddress) return 'Select a Token';
    if (!amountInput || !parsedAmount || parsedAmount === 0n) return 'Enter Amount';
    if (amountExceedsBalance) return 'Insufficient Balance';
    if (insufficientNativeBalance)
      return `Insufficient ${getChainNativeCurrency(fromChainId)} for Fee`;
    if (walletChain?.id !== fromChainId) return `Switch to ${getChainName(fromChainId)}`;
    if (isQuoting) return 'Getting Quote…';
    if (isApproving) return 'Approving…';
    if (isBridging) return 'Bridging…';
    if (!hasAllowance && !isLoadingAllowance) return 'Approve & Bridge';
    return 'Bridge';
  };

  // Allow clicking for connect wallet and chain switching even when canBridge is false
  const needsChainSwitch = isConnected && walletChain?.id !== fromChainId && canBridge;
  const isButtonDisabled =
    (!isConnected ? false : needsChainSwitch ? false : !canBridge) ||
    isApproving ||
    isBridging ||
    amountExceedsBalance ||
    insufficientNativeBalance;

  return (
    <>
      <Card>
        <CardContent className="space-y-5 pt-6">
          {/* Chain selectors */}
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Select
                value={String(fromChainId)}
                onValueChange={(v) => {
                  setFromChainId(Number(v));
                  setSelectedTokenAddress('');
                  setAmountInput('');
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHAINS.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              size="icon"
              className="mb-0.5 shrink-0"
              onClick={handleSwapDirection}
              title="Swap direction"
            >
              <ArrowDownUp className="h-4 w-4" />
            </Button>

            <div className="flex-1 space-y-1.5">
              <Label className="text-xs text-muted-foreground">To</Label>
              <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm">
                {getChainName(toChainId)}
              </div>
            </div>
          </div>

          {/* Token selector */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Position Token
            </Label>
            <Select
              value={selectedTokenAddress}
              onValueChange={(v) => {
                setSelectedTokenAddress(v);
                setAmountInput('');
              }}
              disabled={!isConnected || isLoadingPositions}
            >
              <SelectTrigger>
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
              <SelectContent>
                {availablePositions.map((pos) => (
                  <SelectItem key={pos.tokenAddress} value={pos.tokenAddress}>
                    <span className="flex items-center gap-2">
                      <span>{formatTokenLabel(pos)}</span>
                      <span className="text-xs text-muted-foreground">
                        ({formatBalance(pos.balance)})
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Amount</Label>
              {selectedPosition && (
                <span className="text-xs text-muted-foreground">
                  Balance: {formatBalance(selectedPosition.balance)}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0.0"
                value={amountInput}
                onChange={(e) => {
                  // Allow only valid decimal input
                  const val = e.target.value;
                  if (/^[0-9]*\.?[0-9]*$/.test(val)) {
                    setAmountInput(val);
                  }
                }}
                disabled={!selectedTokenAddress}
                className={amountExceedsBalance ? 'border-destructive' : ''}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleMax}
                disabled={!selectedPosition}
                className="shrink-0"
              >
                Max
              </Button>
            </div>
            {amountExceedsBalance && (
              <p className="text-xs text-destructive">
                Amount exceeds available balance
              </p>
            )}
          </div>

          {/* Recipient */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Recipient (defaults to your address)
            </Label>
            <Input
              type="text"
              placeholder={currentAddress ?? '0x…'}
              value={recipientInput}
              onChange={(e) => setRecipientInput(e.target.value)}
            />
            {recipientInput && !isAddress(recipientInput) && (
              <p className="text-xs text-destructive">
                Invalid address
              </p>
            )}
          </div>

          {/* Fee display */}
          {nativeFeeFormatted && (
            <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">LayerZero Fee</span>
              <span>
                {parseFloat(nativeFeeFormatted).toLocaleString(undefined, {
                  maximumSignificantDigits: 6,
                })}{' '}
                {getChainNativeCurrency(fromChainId)}
              </span>
            </div>
          )}

          {/* Insufficient native balance warning */}
          {insufficientNativeBalance && nativeFeeFormatted && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Insufficient {getChainNativeCurrency(fromChainId)} to cover the
              LayerZero fee ({parseFloat(nativeFeeFormatted).toLocaleString(
                undefined,
                { maximumSignificantDigits: 6 }
              )}{' '}
              {getChainNativeCurrency(fromChainId)} required)
            </div>
          )}

          {/* Bridge button */}
          <Button
            className="w-full"
            size="lg"
            disabled={isButtonDisabled}
            onClick={() => {
              if (!isConnected) {
                openConnectDialog();
                return;
              }
              handleBridge();
            }}
          >
            {getButtonText()}
          </Button>

          {bridgeSuccess && (
            <div className="rounded-md bg-green-500/10 p-3 text-center text-sm text-green-600 dark:text-green-400">
              Bridge transaction submitted! Your tokens will arrive on{' '}
              {getChainName(toChainId)} shortly.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending bridges */}
      {isConnected && pendingFromSource.length > 0 && (
        <Card className="mt-6">
          <CardContent className="pt-6">
            <h2 className="mb-3 text-lg font-semibold">Pending Bridges</h2>
            <p className="mb-2 text-xs text-muted-foreground">
              From {getChainName(fromChainId)} — {pendingFromSource.length}{' '}
              pending
            </p>
            <div className="space-y-2">
              {pendingFromSource.map((id) => (
                <div
                  key={id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-xs font-mono"
                >
                  <span className="truncate" title={id}>
                    {id.slice(0, 10)}…{id.slice(-8)}
                  </span>
                  <span className="ml-2 shrink-0 rounded bg-yellow-500/20 px-2 py-0.5 text-yellow-600 dark:text-yellow-400">
                    Pending
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page with tab switcher
// ---------------------------------------------------------------------------
type Tab = 'bridge' | 'swap';

export default function SwapPage() {
  const [tab, setTab] = useState<Tab>('bridge');

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold">Swap</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Bridge position tokens between chains, or swap them for popular tokens
        on Arbitrum.
      </p>

      {/* Tab buttons */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab('bridge')}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'bridge'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          Bridge
        </button>
        <button
          onClick={() => setTab('swap')}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'swap'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          Swap
        </button>
      </div>

      {tab === 'bridge' ? <BridgeSection /> : <SwapSection />}
    </div>
  );
}
