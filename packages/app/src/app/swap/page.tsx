'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { formatEther, formatUnits, parseUnits, isAddress } from 'viem';
import { useAccount, useSwitchChain, useBalance } from 'wagmi';
import { ArrowDownUp, ArrowRight, ExternalLink, Search } from 'lucide-react';

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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@sapience/ui/components/ui/command';
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
import { useTokenList, type TokenListToken } from '~/hooks/bridge/useTokenList';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHAINS = [
  { id: CHAIN_ID_ETHEREAL, name: 'Ethereal', nativeCurrency: 'USDe' },
  { id: CHAIN_ID_ARBITRUM, name: 'Arbitrum', nativeCurrency: 'ETH' },
] as const;

const ARBITRUM_TOKENS = [
  { symbol: 'USDC', name: 'USD Coin', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6, logoURI: '' },
  { symbol: 'USDT', name: 'Tether USD', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6, logoURI: '' },
  { symbol: 'WETH', name: 'Wrapped Ether', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18, logoURI: '' },
  { symbol: 'ARB', name: 'Arbitrum', address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18, logoURI: '' },
  { symbol: 'DAI', name: 'Dai Stablecoin', address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18, logoURI: '' },
  { symbol: 'WBTC', name: 'Wrapped BTC', address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', decimals: 8, logoURI: '' },
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

function truncateName(name: string, maxLen = 60): string {
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen - 1) + '…';
}

// ---------------------------------------------------------------------------
// Token Selector – searchable popover with position tokens
// ---------------------------------------------------------------------------
function PositionTokenSelector({
  tokens,
  balances,
  selectedAddress,
  onSelect,
  disabled,
  isLoading,
}: {
  tokens: TokenListToken[];
  balances: PositionBalance[];
  selectedAddress: string;
  onSelect: (address: string, token: TokenListToken) => void;
  disabled?: boolean;
  isLoading?: boolean;
}) {
  const [open, setOpen] = useState(false);

  // Build a balance lookup by token address (lowercase)
  const balanceMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of balances) {
      if (BigInt(b.balance) > 0n) {
        map.set(b.tokenAddress.toLowerCase(), b.balance);
      }
    }
    return map;
  }, [balances]);

  // Sort: tokens with balance first, then alphabetically
  const sortedTokens = useMemo(() => {
    return [...tokens].sort((a, b) => {
      const aHasBal = balanceMap.has(a.address.toLowerCase());
      const bHasBal = balanceMap.has(b.address.toLowerCase());
      if (aHasBal && !bHasBal) return -1;
      if (!aHasBal && bHasBal) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [tokens, balanceMap]);

  const selectedToken = tokens.find(
    (t) => t.address.toLowerCase() === selectedAddress.toLowerCase()
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between text-left font-normal h-auto min-h-[2.5rem] whitespace-normal"
          disabled={disabled}
        >
          {isLoading ? (
            'Loading tokens…'
          ) : selectedToken ? (
            <span className="line-clamp-2 text-sm">
              {truncateName(selectedToken.name, 50)}
            </span>
          ) : (
            'Select position token…'
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by name or symbol…" />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>No tokens found.</CommandEmpty>
            {balanceMap.size > 0 && (
              <CommandGroup heading="With Balance">
                {sortedTokens
                  .filter((t) => balanceMap.has(t.address.toLowerCase()))
                  .map((token) => {
                    const bal = balanceMap.get(token.address.toLowerCase());
                    return (
                      <CommandItem
                        key={token.address}
                        value={`${token.name} ${token.symbol}`}
                        onSelect={() => {
                          onSelect(token.address, token);
                          setOpen(false);
                        }}
                      >
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <span className="text-sm font-medium truncate">
                            {truncateName(token.name, 55)}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">
                            {token.symbol}
                          </span>
                        </div>
                        {bal && (
                          <span className="text-xs text-muted-foreground ml-2 shrink-0">
                            {formatBalance(bal)}
                          </span>
                        )}
                      </CommandItem>
                    );
                  })}
              </CommandGroup>
            )}
            <CommandGroup heading={balanceMap.size > 0 ? 'All Tokens' : 'Position Tokens'}>
              {sortedTokens
                .filter((t) => !balanceMap.has(t.address.toLowerCase()))
                .map((token) => (
                  <CommandItem
                    key={token.address}
                    value={`${token.name} ${token.symbol}`}
                    onSelect={() => {
                      onSelect(token.address, token);
                      setOpen(false);
                    }}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span className="text-sm truncate">
                        {truncateName(token.name, 55)}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {token.symbol}
                      </span>
                    </div>
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Swap section – bridge + swap position tokens for Arbitrum tokens
// ---------------------------------------------------------------------------
function SwapSection() {
  const { currentAddress, isConnected } = useCurrentAddress();
  const { address: walletAddress } = useAccount();

  // Token list from API (Ethereal chain tokens for the source side)
  const { tokens: allTokens, isLoading: isLoadingTokens } = useTokenList();

  // Filter to only Ethereal-chain position tokens
  const etherealTokens = useMemo(
    () => allTokens.filter((t) => t.chainId === CHAIN_ID_ETHEREAL),
    [allTokens]
  );

  // Position balances for connected wallet (smart account or EOA)
  const { data: positionBalances } = usePositionBalances({
    holder: currentAddress,
    chainId: CHAIN_ID_ETHEREAL,
  });

  // Also fetch EOA balances if different from currentAddress
  const { data: eoaBalances } = usePositionBalances({
    holder: walletAddress && walletAddress !== currentAddress ? walletAddress : undefined,
    chainId: CHAIN_ID_ETHEREAL,
  });

  // Merge balances
  const allBalances = useMemo(() => {
    const merged = [...positionBalances];
    for (const eb of eoaBalances) {
      if (!merged.find((m) => m.tokenAddress.toLowerCase() === eb.tokenAddress.toLowerCase())) {
        merged.push(eb);
      }
    }
    return merged;
  }, [positionBalances, eoaBalances]);

  // Selected tokens
  const [selectedSourceAddress, setSelectedSourceAddress] = useState('');
  const [selectedSourceToken, setSelectedSourceToken] = useState<TokenListToken | null>(null);
  const [selectedDestToken, setSelectedDestToken] = useState(ARBITRUM_TOKENS[0].symbol);
  const [amount, setAmount] = useState('');

  const destToken = ARBITRUM_TOKENS.find((t) => t.symbol === selectedDestToken) ?? ARBITRUM_TOKENS[0];

  // Find balance for selected source token
  const sourceBalance = useMemo(() => {
    if (!selectedSourceAddress) return undefined;
    return allBalances.find(
      (b) => b.tokenAddress.toLowerCase() === selectedSourceAddress.toLowerCase() && BigInt(b.balance) > 0n
    );
  }, [selectedSourceAddress, allBalances]);

  const handleMaxAmount = useCallback(() => {
    if (sourceBalance) {
      setAmount(formatUnits(BigInt(sourceBalance.balance), 18));
    }
  }, [sourceBalance]);

  // CowSwap link with pre-filled sell token (the bridged token's Arbitrum address)
  const cowSwapUrl = useMemo(() => {
    if (!selectedSourceAddress) return 'https://swap.cow.fi/#/42161/swap/';
    // Token list has both Ethereal and Arbitrum entries — find the Arbitrum version
    const arbToken = allTokens.find(
      (t) =>
        t.chainId === CHAIN_ID_ARBITRUM &&
        t.address.toLowerCase() === selectedSourceAddress.toLowerCase()
    );
    const sellToken = arbToken?.address ?? '';
    const buyToken = destToken.address;
    return `https://swap.cow.fi/#/42161/swap/${sellToken}/${buyToken}`;
  }, [selectedSourceAddress, allTokens, destToken]);

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <div>
          <p className="text-sm text-muted-foreground">
            Bridge position tokens from Ethereal to Arbitrum, then swap them for
            popular tokens via CowSwap.
          </p>
        </div>

        {/* Token selection row */}
        <div className="flex items-start gap-3">
          {/* Source: Position token */}
          <div className="flex-1 space-y-1.5 min-w-0">
            <Label className="text-xs text-muted-foreground">
              From (Ethereal)
            </Label>
            <PositionTokenSelector
              tokens={etherealTokens}
              balances={allBalances}
              selectedAddress={selectedSourceAddress}
              onSelect={(addr, token) => {
                setSelectedSourceAddress(addr);
                setSelectedSourceToken(token);
              }}
              disabled={!isConnected}
              isLoading={isLoadingTokens}
            />
          </div>

          <div className="flex items-center pt-7">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>

          {/* Destination: Arbitrum token */}
          <div className="flex-1 space-y-1.5 min-w-0">
            <Label className="text-xs text-muted-foreground">
              To (Arbitrum)
            </Label>
            <Select
              value={selectedDestToken}
              onValueChange={setSelectedDestToken}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ARBITRUM_TOKENS.map((token) => (
                  <SelectItem key={token.symbol} value={token.symbol}>
                    {token.symbol} — {token.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Amount */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Amount</Label>
            {sourceBalance && (
              <span className="text-xs text-muted-foreground">
                Balance: {formatBalance(sourceBalance.balance)}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0.0"
              value={amount}
              onChange={(e) => {
                if (/^[0-9]*\.?[0-9]*$/.test(e.target.value)) {
                  setAmount(e.target.value);
                }
              }}
              disabled={!selectedSourceAddress}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleMaxAmount}
              disabled={!sourceBalance}
              className="shrink-0"
            >
              Max
            </Button>
          </div>
        </div>

        {/* Route info */}
        <div className="rounded-md bg-muted px-3 py-3 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Route:</span>
            <span className="font-medium">Bridge (Ethereal → Arbitrum)</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">CowSwap</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Step 1: Bridge your position token to Arbitrum using the Bridge tab.
            Step 2: Swap the bridged token on CowSwap for {destToken.symbol}.
          </p>
        </div>

        {/* CowSwap link */}
        <Button
          className="w-full"
          size="lg"
          variant="outline"
          asChild
          disabled={!selectedSourceAddress}
        >
          <a
            href={cowSwapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={!selectedSourceAddress ? 'pointer-events-none opacity-50' : ''}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Swap on CowSwap
          </a>
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          First bridge your tokens using the Bridge tab, then swap them on
          CowSwap.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Bridge section – bridge with EOA-default recipient
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

  // Recipient — defaults to EOA wallet address, not smart account
  const recipient = useMemo(() => {
    if (recipientInput && isAddress(recipientInput)) {
      return recipientInput as `0x${string}`;
    }
    return walletAddress as `0x${string}` | undefined;
  }, [recipientInput, walletAddress]);

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

          {/* Recipient — defaults to EOA address */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Recipient (defaults to your EOA wallet)
            </Label>
            <Input
              type="text"
              placeholder={walletAddress ?? '0x…'}
              value={recipientInput}
              onChange={(e) => setRecipientInput(e.target.value)}
            />
            {walletAddress && !recipientInput && (
              <p className="text-xs text-muted-foreground">
                Sending to: {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
              </p>
            )}
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
