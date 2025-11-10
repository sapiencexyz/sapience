'use client';

import type React from 'react';
import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  parseUnits,
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  getAddress,
  decodeAbiParameters,
} from 'viem';
import { Pin, ChevronDown } from 'lucide-react';
import { type UiTransaction } from '~/components/markets/DataDrawer/TransactionCells';
import { useAuctionBids } from '~/lib/auction/useAuctionBids';
import AuctionRequestInfo from '~/components/terminal/AuctionRequestInfo';
import AuctionRequestChart from '~/components/terminal/AuctionRequestChart';
import {
  useAccount,
  useSignTypedData,
  useReadContract,
  useReadContracts,
} from 'wagmi';
import { useConnectOrCreateWallet } from '@privy-io/react-auth';
import { useSettings } from '~/lib/context/SettingsContext';
import { toAuctionWsUrl } from '~/lib/ws';
import { predictionMarket } from '@sapience/sdk/contracts';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import { predictionMarketAbi } from '@sapience/sdk';
import erc20Abi from '@sapience/sdk/queries/abis/erc20abi.json';
import { DEFAULT_COLLATERAL_ASSET } from '~/components/admin/constants';
import { useToast } from '@sapience/sdk/ui/hooks/use-toast';
import { useConditionsByIds } from '~/hooks/graphql/useConditionsByIds';
import { getSharedAuctionWsClient } from '~/lib/ws/AuctionWsClient';
import { useApprovalDialog } from '~/components/terminal/ApprovalDialogContext';

type Props = {
  uiTx: UiTransaction;
  predictionsContent: React.ReactNode;
  auctionId: string | null;
  makerWager: string | null;
  maker: string | null;
  resolver: string | null;
  predictedOutcomes: string[];
  makerNonce: number | null;
  collateralAssetTicker: string;
  onTogglePin?: (auctionId: string | null) => void;
  isPinned?: boolean;
};

const AuctionRequestRow: React.FC<Props> = ({
  uiTx,
  predictionsContent,
  auctionId,
  makerWager,
  maker,
  resolver,
  predictedOutcomes,
  makerNonce,
  collateralAssetTicker,
  onTogglePin,
  isPinned,
}) => {
  const { bids } = useAuctionBids(auctionId);
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { connectOrCreateWallet } = useConnectOrCreateWallet({});
  const { apiBaseUrl } = useSettings();
  const wsUrl = useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);
  const chainId = useChainIdFromLocalStorage();
  const verifyingContract = predictionMarket[chainId]?.address as
    | `0x${string}`
    | undefined;
  const { toast } = useToast();
  const { openApproval } = useApprovalDialog();
  // Resolve collateral token from PredictionMarket config (fallback to default constant)
  const PREDICTION_MARKET_ADDRESS = predictionMarket[chainId]?.address;
  const predictionMarketConfigRead = useReadContracts({
    contracts: PREDICTION_MARKET_ADDRESS
      ? [
          {
            address: PREDICTION_MARKET_ADDRESS,
            abi: predictionMarketAbi,
            functionName: 'getConfig',
            chainId: chainId,
          },
        ]
      : [],
    query: { enabled: !!PREDICTION_MARKET_ADDRESS },
  });
  const COLLATERAL_ADDRESS = useMemo(() => {
    const item = predictionMarketConfigRead.data?.[0];
    if (item && item.status === 'success') {
      try {
        const cfg = item.result as { collateralToken: `0x${string}` };
        if (cfg?.collateralToken) return cfg.collateralToken;
      } catch {
        /* noop */
      }
    }
    return DEFAULT_COLLATERAL_ASSET as `0x${string}` | undefined;
  }, [predictionMarketConfigRead.data]);
  // Read token decimals
  const { data: tokenDecimalsData } = useReadContract({
    abi: erc20Abi,
    address: COLLATERAL_ADDRESS,
    functionName: 'decimals',
    chainId: chainId,
    query: { enabled: Boolean(COLLATERAL_ADDRESS) },
  });
  const tokenDecimals = useMemo(() => {
    try {
      return typeof tokenDecimalsData === 'number'
        ? tokenDecimalsData
        : Number(tokenDecimalsData ?? 18);
    } catch {
      return 18;
    }
  }, [tokenDecimalsData]);
  // Read allowance for connected address -> PredictionMarket
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20Abi,
    address: COLLATERAL_ADDRESS,
    functionName: 'allowance',
    args: [
      (address as `0x${string}`) ||
        '0x0000000000000000000000000000000000000000',
      verifyingContract as `0x${string}`,
    ],
    chainId: chainId,
    query: {
      enabled: Boolean(address && COLLATERAL_ADDRESS && verifyingContract),
    },
  });
  // Read maker nonce on-chain for the provided maker address
  const { data: makerNonceOnChain, refetch: refetchMakerNonce } =
    useReadContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: predictionMarketAbi,
      functionName: 'nonces',
      args: typeof maker === 'string' ? [maker as `0x${string}`] : undefined,
      chainId: chainId,
      query: {
        enabled: Boolean(PREDICTION_MARKET_ADDRESS && maker),
      },
    });
  const [isExpanded, setIsExpanded] = useState(false);
  const [highlightNewBid, setHighlightNewBid] = useState(false);
  const numBids = useMemo(
    () => (Array.isArray(bids) ? bids.length : 0),
    [bids]
  );
  const bidsLabel = useMemo(
    () => (numBids === 1 ? '1 BID' : `${numBids} BIDS`),
    [numBids]
  );

  // Pulse highlight when a new bid is received
  const prevBidsRef = useRef<number>(0);
  const initializedRef = useRef<boolean>(false);
  const pulseTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    const count = numBids;
    // Skip initial mount to avoid false-positive pulse when the row is first rendered
    if (!initializedRef.current) {
      prevBidsRef.current = count;
      initializedRef.current = true;
      setHighlightNewBid(false);
      return;
    }
    if (count > prevBidsRef.current) {
      setHighlightNewBid(true);
      // Update ref immediately so we only pulse once per new bid
      prevBidsRef.current = count;
      if (pulseTimeoutRef.current != null)
        window.clearTimeout(pulseTimeoutRef.current);
      pulseTimeoutRef.current = window.setTimeout(() => {
        setHighlightNewBid(false);
        pulseTimeoutRef.current = null;
      }, 900);
    } else {
      prevBidsRef.current = count;
    }
  }, [numBids]);
  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current != null)
        window.clearTimeout(pulseTimeoutRef.current);
    };
  }, []);

  // Decode predicted outcomes to extract condition IDs
  const conditionIds = useMemo(() => {
    try {
      const arr = Array.isArray(predictedOutcomes)
        ? (predictedOutcomes as `0x${string}`[])
        : [];
      if (arr.length === 0) return [] as string[];
      const decodedUnknown = decodeAbiParameters(
        [
          {
            type: 'tuple[]',
            components: [
              { name: 'marketId', type: 'bytes32' },
              { name: 'prediction', type: 'bool' },
            ],
          },
        ] as const,
        arr[0]
      ) as unknown;
      const decodedArr = Array.isArray(decodedUnknown)
        ? (decodedUnknown as any)[0]
        : [];
      const ids = [] as string[];
      for (const o of decodedArr || []) {
        const id = o?.marketId as string | undefined;
        if (id && typeof id === 'string') ids.push(id);
      }
      return ids;
    } catch {
      return [] as string[];
    }
  }, [predictedOutcomes]);

  // Fetch conditions by IDs to get endTime values
  const { list: conditionEnds = [] } = useConditionsByIds(conditionIds);

  const maxEndTimeSec = useMemo(() => {
    try {
      if (!Array.isArray(conditionEnds) || conditionEnds.length === 0)
        return null;
      const ends = conditionEnds
        .map((c) => Number(c?.endTime || 0))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (ends.length === 0) return null;
      return Math.max(...ends);
    } catch {
      return null;
    }
  }, [conditionEnds]);

  const submitBid = useCallback(
    async (data: {
      amount: string;
      expirySeconds: number;
      mode: 'duration' | 'datetime';
    }) => {
      try {
        if (!auctionId) {
          toast({
            title: 'Auction not ready',
            description: 'This auction is not active yet. Please try again.',
          });
          return;
        }
        // Ensure connected wallet FIRST so Privy opens immediately if needed
        let taker = address;
        if (!taker) {
          // eslint-disable-next-line @typescript-eslint/await-thenable
          await connectOrCreateWallet();
          // try to read again (wagmi state updates asynchronously)
          taker = (window as any)?.wagmi?.state?.address as
            | `0x${string}`
            | undefined;
        }
        if (!taker) {
          openApproval(String(data.amount || ''));
          return;
        }
        // Amount in display units -> wei (token decimals) and allowance check FIRST
        const decimalsToUse = Number.isFinite(tokenDecimals)
          ? tokenDecimals
          : 18;
        const takerWagerWei = parseUnits(
          String(data.amount || '0'),
          decimalsToUse
        );
        if (takerWagerWei <= 0n) {
          toast({
            title: 'Invalid amount',
            description: 'Enter a valid bid amount greater than 0.',
          });
          return;
        }

        // Ensure sufficient ERC20 allowance to PredictionMarket
        try {
          const fresh = await Promise.resolve(refetchAllowance?.());
          const currentAllowance = (fresh?.data ?? allowance ?? 0n) as bigint;
          if (currentAllowance < takerWagerWei) {
            openApproval(String(data.amount || ''));
            return;
          }
        } catch {
          // If allowance check fails, open approval dialog anyway with requested amount
          openApproval(String(data.amount || ''));
          return;
        }

        // Ensure essential auction context (after allowance handling)
        const encodedPredicted =
          Array.isArray(predictedOutcomes) && predictedOutcomes[0]
            ? (predictedOutcomes[0] as `0x${string}`)
            : undefined;
        const makerAddr = typeof maker === 'string' ? maker : undefined;
        const resolverAddr =
          typeof resolver === 'string' ? resolver : undefined;
        const makerWagerWei = (() => {
          try {
            return BigInt(String(makerWager ?? '0'));
          } catch {
            return 0n;
          }
        })();
        // Resolve maker nonce: prefer feed-provided, fall back to on-chain
        let makerNonceVal: number | undefined =
          typeof makerNonce === 'number' ? makerNonce : undefined;
        if (makerNonceVal === undefined) {
          try {
            const fresh = await Promise.resolve(refetchMakerNonce?.());
            const raw = fresh?.data ?? makerNonceOnChain;
            const n = Number(raw);
            if (Number.isFinite(n)) makerNonceVal = n;
          } catch {
            /* noop */
          }
        }
        if (
          !encodedPredicted ||
          !makerAddr ||
          !resolverAddr ||
          makerNonceVal === undefined ||
          makerWagerWei <= 0n
        ) {
          const missing: string[] = [];
          if (!encodedPredicted) missing.push('predicted outcomes');
          if (!makerAddr) missing.push('maker');
          if (!resolverAddr) missing.push('resolver');
          if (makerNonceVal === undefined) missing.push('maker nonce');
          if (makerWagerWei <= 0n) missing.push('maker wager');
          toast({
            title: 'Request not ready',
            description:
              missing.length > 0
                ? `Missing: ${missing.join(', ')}`
                : 'Required data not available yet. Please try again.',
            variant: 'destructive' as any,
          });
          return;
        }

        const nowSec = Math.floor(Date.now() / 1000);
        const requested = Math.max(0, Number(data.expirySeconds || 0));
        const clampedExpiry = (() => {
          const end = Number(maxEndTimeSec || 0);
          if (!Number.isFinite(end) || end <= 0) return requested;
          const remaining = Math.max(0, end - nowSec);
          return Math.min(requested, remaining);
        })();
        const takerDeadline = nowSec + clampedExpiry;

        // Build inner message hash (bytes, uint256, uint256, address, address, uint256)
        const innerMessageHash = keccak256(
          encodeAbiParameters(
            parseAbiParameters(
              'bytes, uint256, uint256, address, address, uint256'
            ),
            [
              encodedPredicted,
              takerWagerWei,
              makerWagerWei,
              getAddress(resolverAddr as `0x${string}`),
              getAddress(makerAddr as `0x${string}`),
              BigInt(takerDeadline),
            ]
          )
        );

        // EIP-712 domain and types per SignatureProcessor
        if (!verifyingContract) {
          toast({
            title: 'Signing failed',
            description: 'Missing verifying contract',
            variant: 'destructive' as any,
          });
          return;
        }
        const domain = {
          name: 'SignatureProcessor',
          version: '1',
          chainId: chainId,
          verifyingContract,
        } as const;
        const types = {
          Approve: [
            { name: 'messageHash', type: 'bytes32' },
            { name: 'owner', type: 'address' },
          ],
        } as const;
        const message = {
          messageHash: innerMessageHash,
          owner: getAddress(taker),
        } as const;

        // Sign typed data via wagmi/viem
        let takerSignature: `0x${string}` | null = null;
        try {
          takerSignature = await signTypedDataAsync({
            domain,
            types,
            primaryType: 'Approve',
            message,
          });
        } catch (e: any) {
          toast({
            title: 'Signature rejected',
            description: String(e?.message || e),
          });
          return;
        }
        if (!takerSignature) {
          toast({
            title: 'Signing failed',
            description: 'No signature returned',
            variant: 'destructive' as any,
          });
          return;
        }

        // Build bid payload
        const payload = {
          auctionId,
          taker,
          takerWager: takerWagerWei.toString(),
          takerDeadline,
          takerSignature,
          makerNonce: makerNonceVal,
        };

        // Send over shared Auction WS and await ack
        if (!wsUrl) {
          toast({
            title: 'Unable to submit',
            description: 'Realtime connection not configured',
            variant: 'destructive' as any,
          });
          return;
        }
        const client = getSharedAuctionWsClient(wsUrl);
        let acked = false;
        try {
          await client.sendWithAck('bid.submit', payload, { timeoutMs: 12000 });
          acked = true;
        } catch (e: any) {
          if (String(e?.message) !== 'ack_timeout') throw e;
        }
        try {
          window.dispatchEvent(new Event('auction.bid.submitted'));
        } catch {
          void 0;
        }
        if (acked) {
          toast({
            title: 'Bid submitted',
            description: 'Your bid was submitted successfully.',
          });
        }
      } catch {
        toast({
          title: 'Bid failed',
          description: 'Unable to submit bid',
          variant: 'destructive' as any,
        });
      }
    },
    [
      auctionId,
      predictedOutcomes,
      maker,
      resolver,
      makerWager,
      makerNonce,
      address,
      connectOrCreateWallet,
      wsUrl,
      verifyingContract,
      signTypedDataAsync,
      toast,
    ]
  );

  return (
    <div
      className={
        'px-4 py-3 relative group h-full min-h-0 border-b border-border/60'
      }
    >
      <div className="flex items-center justify-between gap-2 min-h-[28px]">
        <div className="flex-1 min-w-0">
          {/* label removed */}
          <div className={'mb-0'}>{predictionsContent}</div>
        </div>
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setIsExpanded((v) => {
                const next = !v;
                try {
                  window.dispatchEvent(new Event('terminal.row.toggled'));
                  window.dispatchEvent(
                    new Event(
                      next ? 'terminal.row.expanded' : 'terminal.row.collapsed'
                    )
                  );
                } catch {
                  void 0;
                }
                return next;
              })
            }
            className={
              highlightNewBid
                ? 'inline-flex items-center justify-center h-6 px-2 rounded-md border border-[hsl(var(--accent-gold)/0.7)] bg-background hover:bg-accent hover:text-accent-foreground text-[10px] flex-shrink-0 transition-colors duration-300 ease-out bg-[hsl(var(--accent-gold)/0.06)] text-accent-gold'
                : 'inline-flex items-center justify-center h-6 px-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-[10px] flex-shrink-0 text-brand-white transition-colors duration-300 ease-out'
            }
            aria-label={
              isExpanded ? `Collapse: ${bidsLabel}` : `Expand: ${bidsLabel}`
            }
          >
            <span className="font-mono">{bidsLabel}</span>
            <ChevronDown
              className={
                (isExpanded
                  ? 'ml-1 h-3.5 w-3.5 rotate-180'
                  : 'ml-1 h-3.5 w-3.5 rotate-0') +
                ' transition-transform duration-300 ease-out'
              }
            />
          </button>
          <button
            type="button"
            onClick={() => onTogglePin?.(auctionId || null)}
            className={
              isPinned
                ? 'inline-flex items-center justify-center h-6 w-6 rounded-md bg-primary text-primary-foreground text-[10px] flex-shrink-0'
                : 'inline-flex items-center justify-center h-6 w-6 rounded-md border border-input bg-background hover:bg-accent text-brand-white hover:text-brand-white text-[10px] flex-shrink-0'
            }
            aria-label={isPinned ? 'Unpin auction' : 'Pin auction'}
          >
            <Pin className="h-3 w-3" />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            key="expanded"
            className="py-3 grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-8 items-stretch min-h-0"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
            onAnimationComplete={() => {
              try {
                window.dispatchEvent(new Event('terminal.row.layout'));
              } catch {
                void 0;
              }
            }}
          >
            <AuctionRequestChart
              bids={bids}
              makerWager={makerWager}
              collateralAssetTicker={collateralAssetTicker}
              maxEndTimeSec={maxEndTimeSec ?? undefined}
              maker={maker}
              hasMultipleConditions={conditionIds.length > 1}
              tokenDecimals={tokenDecimals}
            />
            <AuctionRequestInfo
              uiTx={uiTx}
              bids={bids}
              makerWager={makerWager}
              collateralAssetTicker={collateralAssetTicker}
              maxEndTimeSec={maxEndTimeSec ?? undefined}
              onSubmit={submitBid}
              maker={maker}
              predictedOutcomes={predictedOutcomes}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default AuctionRequestRow;
