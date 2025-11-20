'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/sdk/ui/components/ui/dialog';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import { Input } from '@sapience/sdk/ui/components/ui/input';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { createWalletClient, custom, http, keccak256, stringToHex } from 'viem';
import { mainnet } from 'viem/chains';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import { useToast } from '@sapience/sdk/ui/hooks/use-toast';
import { usePositions } from '~/hooks/graphql/usePositions';
import { useUserParlays } from '~/hooks/graphql/useUserParlays';
import { useProfileVolume } from '~/hooks/useProfileVolume';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import { COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';

interface ReferralsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletAddress?: string | null;
  onCodeSet?: (code: string) => void;
}

type ReferralRow = {
  address: string;
  index: number | null;
  withinCapacity: boolean;
};

const ReferralVolumeCell = ({ address }: { address: string }) => {
  const chainId = useChainIdFromLocalStorage();
  const collateralSymbol = COLLATERAL_SYMBOLS[chainId] || 'USDe';
  const lowerAddress = address.toLowerCase();

  const { data: positions, isLoading: positionsLoading } = usePositions({
    address: lowerAddress,
  });
  const { data: parlays, isLoading: parlaysLoading } = useUserParlays({
    address: lowerAddress,
    chainId,
  });

  const volume = useProfileVolume(positions, parlays, address);
  const loading = positionsLoading || parlaysLoading;

  return (
    <span className="tabular-nums">
      {loading ? '—' : `${volume.display} ${collateralSymbol}`}
    </span>
  );
};

const ReferralsDialog = ({
  open,
  onOpenChange,
  walletAddress,
  onCodeSet,
}: ReferralsDialogProps) => {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [maxReferrals, setMaxReferrals] = useState<number | null>(null);
  const { toast } = useToast();

  const invitesRemaining =
    maxReferrals !== null
      ? Math.max(
          0,
          maxReferrals - referrals.filter((row) => row.withinCapacity).length
        )
      : null;

  const USER_REFERRALS_QUERY = `
    query UserReferrals($wallet: String!) {
      user(where: { address: $wallet }) {
        address
        refCodeHash
        maxReferrals
        referrals {
          address
          createdAt
        }
      }
    }
  `;

  const fetchReferrals = async (address?: string | null) => {
    const targetAddress = address ?? walletAddress;
    if (!targetAddress) return;
    try {
      const data = await graphqlRequest<{
        user: {
          maxReferrals: number;
          referrals: { address: string; createdAt: string }[];
        } | null;
      }>(USER_REFERRALS_QUERY, { wallet: targetAddress.toLowerCase() });

      if (!data?.user) {
        setReferrals([]);
        setMaxReferrals(null);
        return;
      }

      const sorted = [...data.user.referrals].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      const rows: ReferralRow[] = sorted.map((r, idx) => {
        const position = idx + 1;
        const withinCapacity = position <= (data.user?.maxReferrals ?? 0);
        return {
          address: r.address,
          index: position,
          withinCapacity,
        };
      });

      setReferrals(rows);
      setMaxReferrals(data.user.maxReferrals ?? null);
    } catch (e) {
      console.error('Failed to load referrals', e);
    }
  };

  useEffect(() => {
    if (open) {
      void fetchReferrals();
    }
  }, [open, walletAddress]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || submitting) return;
    if (!walletAddress) return;

    try {
      setSubmitting(true);
      setError(null);

      if (typeof window === 'undefined' || !(window as any).ethereum) {
        throw new Error('Wallet not available for signing');
      }

      const walletClient = createWalletClient({
        chain: mainnet,
        transport: (window as any).ethereum
          ? custom((window as any).ethereum)
          : http(),
      });

      const normalizedAddress = walletAddress.toLowerCase();
      const normalizedCode = code.trim().toLowerCase();
      const codeHash = keccak256(stringToHex(normalizedCode));

      const payload = {
        prefix: 'Sapience Referral',
        walletAddress: normalizedAddress,
        codeHash,
        chainId: null,
        nonce: null,
      };

      const message = JSON.stringify(payload);
      const signature = await walletClient.signMessage({
        account: normalizedAddress as `0x${string}`,
        message,
      });

      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_FOIL_API_URL || 'https://api.sapience.xyz'}/referrals/code`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            walletAddress: normalizedAddress,
            codePlaintext: code.trim(),
            signature,
          }),
        }
      );

      if (!resp.ok) {
        const data = (await resp.json().catch(() => null)) as {
          message?: string;
        } | null;
        const message =
          data?.message || 'Unable to set referral code. Please try again.';

        if (
          data?.message ===
          'Unable to set referral code. Please choose a different code.'
        ) {
          toast({
            title: 'Unable to set referral code',
            description: 'Please choose a different code.',
            variant: 'destructive',
          });
          // Do not render this specific message inline in the dialog.
          setError(null);
        } else {
          setError(message);
        }
        return;
      }

      // Best-effort local persistence by wallet address so we can
      // avoid re-prompting users who have already provided a code.
      try {
        if (walletAddress && typeof window !== 'undefined') {
          const key = `sapience:referralCode:${walletAddress.toLowerCase()}`;
          window.localStorage.setItem(key, code.trim());
        }
      } catch {
        // If this fails (e.g. privacy mode), the dialog may reappear on next connect.
      }

      onCodeSet?.(code.trim());
      // Immediately refresh referrals so the dashboard reflects the new code
      // and any updated maxReferrals before closing.
      await fetchReferrals(walletAddress);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Invite a Friend</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex gap-3">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={submitting}
                className="flex-1"
              />
              <Button
                type="submit"
                className="shrink-0"
                disabled={submitting || !code.trim()}
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Only an encrypted version of your code is stored, so you&apos;ll
              need to reset it if you forget it.
            </p>
            {error && (
              <p className="text-xs text-destructive mt-1.5">{error}</p>
            )}
          </div>
        </form>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Referrals</h3>
            {invitesRemaining !== null && (
              <span className="text-[11px] text-muted-foreground">
                {invitesRemaining}{' '}
                {invitesRemaining === 1
                  ? 'invite remaining'
                  : 'invites remaining'}
              </span>
            )}
          </div>
          <div className="rounded-md border border-border bg-muted/40">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/70 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">
                    Account Address
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Trading Volume
                  </th>
                </tr>
              </thead>
              <tbody>
                {referrals.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-muted-foreground" colSpan={2}>
                      You haven&apos;t referred any accounts yet.
                    </td>
                  </tr>
                ) : (
                  referrals.map((row) => (
                    <tr
                      key={row.address}
                      className="border-t border-border/40 last:border-b-0"
                    >
                      <td className="px-3 py-2 align-middle">
                        <div className="flex items-center gap-2">
                          <EnsAvatar
                            address={row.address}
                            className="w-4 h-4 rounded-sm ring-1 ring-border/50"
                            width={16}
                            height={16}
                          />
                          <AddressDisplay address={row.address} compact />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right align-middle">
                        <ReferralVolumeCell address={row.address} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReferralsDialog;
