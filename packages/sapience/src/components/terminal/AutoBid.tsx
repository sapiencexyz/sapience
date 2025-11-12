'use client';

import type React from 'react';
import { useMemo, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { Pencil } from 'lucide-react';
import { predictionMarket } from '@sapience/sdk/contracts';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import { DEFAULT_COLLATERAL_ASSET } from '~/components/admin/constants';
import erc20Abi from '@sapience/sdk/queries/abis/erc20abi.json';
// removed dialog imports
import { useTokenApproval } from '~/hooks/contract/useTokenApproval';
import { formatFiveSigFigs } from '~/lib/utils/util';
import { useApprovalDialog } from '~/components/terminal/ApprovalDialogContext';
import { COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';

const AutoBid: React.FC = () => {
  const { address } = useAccount();
  const chainId = useChainIdFromLocalStorage();
  const collateralSymbol = COLLATERAL_SYMBOLS[chainId] || 'testUSDe';

  const COLLATERAL_ADDRESS = DEFAULT_COLLATERAL_ASSET as
    | `0x${string}`
    | undefined;
  const SPENDER_ADDRESS = predictionMarket[chainId]?.address as
    | `0x${string}`
    | undefined;

  const { data: decimals } = useReadContract({
    abi: erc20Abi,
    address: COLLATERAL_ADDRESS,
    functionName: 'decimals',
    chainId: chainId,
    query: { enabled: Boolean(COLLATERAL_ADDRESS) },
  });

  const { data: rawBalance } = useReadContract({
    abi: erc20Abi,
    address: COLLATERAL_ADDRESS,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: chainId,
    query: { enabled: Boolean(address && COLLATERAL_ADDRESS) },
  });

  // removed balance dialog state
  const { openApproval } = useApprovalDialog();
  const [spenderAddressInput] = useState<string>(
    (SPENDER_ADDRESS as string | undefined) ?? ''
  );

  const tokenDecimals = useMemo(() => {
    try {
      return typeof decimals === 'number' ? decimals : Number(decimals ?? 18);
    } catch {
      return 18;
    }
  }, [decimals]);

  const balanceDisplay = useMemo(() => {
    try {
      if (!rawBalance) return '0';
      const human = Number(
        formatUnits(rawBalance as unknown as bigint, tokenDecimals)
      );
      return formatFiveSigFigs(human);
    } catch {
      return '0';
    }
  }, [rawBalance, tokenDecimals]);

  const { allowance } = useTokenApproval({
    tokenAddress: COLLATERAL_ADDRESS,
    spenderAddress: (spenderAddressInput || SPENDER_ADDRESS) as
      | `0x${string}`
      | undefined,
    amount: '',
    chainId: chainId,
    decimals: tokenDecimals,
    enabled: Boolean(
      COLLATERAL_ADDRESS && (spenderAddressInput || SPENDER_ADDRESS)
    ),
  });

  const allowanceDisplay = useMemo(() => {
    try {
      if (allowance == null) return '0';
      const human = Number(
        formatUnits(allowance as unknown as bigint, tokenDecimals)
      );
      return formatFiveSigFigs(human);
    } catch {
      return '0';
    }
  }, [allowance, tokenDecimals]);

  // Approval dialog is controlled via context; no event listeners needed

  // removed balance dialog URLs

  return (
    <div className="border border-border/60 rounded-lg bg-brand-black text-brand-white h-full flex flex-col min-h-0 overflow-hidden">
      <div className="pl-4 pr-3 h-[57px] border-b border-border/60 bg-muted/10 flex items-center">
        <div className="flex items-center justify-between w-full">
          <div className="eyebrow text-foreground">Auto-Bid</div>
          <span className="font-mono text-[10px] leading-none text-accent-gold tracking-[0.18em] inline-flex items-center">
            EXPERIMENTAL
          </span>
        </div>
      </div>
      <div className="p-4 flex-1 min-h-0 flex flex-col">
        <div className="mb-3">
          <div className="grid grid-cols-2 gap-2">
            {/* Left: Approved Spend */}
            <div className="px-1">
              <div className="text-xs font-medium">Approved Spend</div>
              <div className="font-mono text-[13px] text-brand-white inline-flex items-center gap-1">
                {allowanceDisplay} {collateralSymbol}
                <button
                  type="button"
                  className="inline-flex items-center justify-center"
                  aria-label="Edit approved spend"
                  onClick={() => openApproval()}
                >
                  <Pencil className="h-3 w-3 text-accent-gold" />
                </button>
              </div>
            </div>

            {/* Right: Account Balance */}
            <div className="px-1">
              <div className="text-xs font-medium">Account Balance</div>
              <div className="font-mono text-[13px] text-brand-white inline-flex items-center gap-1">
                {balanceDisplay} {collateralSymbol}
              </div>
            </div>
          </div>
        </div>

        <div className="relative border border-border/60 rounded-md flex-1 min-h-0 overflow-hidden">
          {/* Mock UI content */}
          <div className="pointer-events-none p-4 md:p-6 h-full">
            <div className="space-y-4 h-full flex flex-col">
              <div className="grid grid-cols-2 gap-3">
                <div className="h-6 rounded bg-muted/20" />
                <div className="h-6 rounded bg-muted/20" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="h-9 rounded-md bg-muted/20" />
                <div className="h-9 rounded-md bg-muted/20" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="h-9 rounded-md bg-muted/20" />
                <div className="h-9 rounded-md bg-muted/20" />
                <div className="h-9 rounded-md bg-muted/20" />
              </div>
              <div className="h-24 rounded-md bg-muted/20" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-9 rounded-md bg-muted/20" />
                <div className="h-9 rounded-md bg-muted/20" />
              </div>
              <div className="flex-1 rounded-md bg-muted/20" />
            </div>
          </div>

          {/* Overlay CTA */}
          <div className="absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm bg-background/20 rounded-md overflow-hidden">
            <div className="text-center px-4">
              <p className="text-xs text-muted-foreground">
                Request early access in{' '}
                <a
                  href="https://discord.gg/sapience"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-white underline decoration-dotted underline-offset-4"
                >
                  Discord
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* removed balance dialog */}

      {/* Approved spend dialog is provided at page level */}
    </div>
  );
};

export default AutoBid;
