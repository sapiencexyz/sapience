'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/ui/components/ui/dialog';
import { Button } from '@sapience/ui/components/ui/button';
import { Input } from '@sapience/ui/components/ui/input';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { useSignMessage } from 'wagmi';
import { keccak256, stringToHex } from 'viem';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { useProfileVolume } from '~/hooks/useProfileVolume';
import { useReferralEligibility } from '~/hooks/useReferralEligibility';
import { DEFAULT_CHAIN_ID, COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import { Copy, Check, Lock } from 'lucide-react';

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
  const chainId = DEFAULT_CHAIN_ID;
  const collateralSymbol = COLLATERAL_SYMBOLS[chainId] || 'USDe';
  const { display, isLoading } = useProfileVolume(address);
  return (
    <span className="tabular-nums">
      {isLoading ? '—' : `${display} ${collateralSymbol}`}
    </span>
  );
};

const USER_REFERRALS_QUERY = `
  query UserReferrals($wallet: String!) {
    user(where: { address: $wallet }) {
      address
      refCodeHash
      maxReferrals
      referredByCode {
        id
      }
      referrals {
        address
        createdAt
      }
    }
  }
`;

const ReferralsDialog = ({
  open,
  onOpenChange,
  walletAddress,
  onCodeSet,
}: ReferralsDialogProps) => {
  // --- Create invite code state ---
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // --- Enter invite code state ---
  const [claimCode, setClaimCode] = useState('');
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // --- Data state ---
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [maxReferrals, setMaxReferrals] = useState<number | null>(null);
  const [hasClaimedCode, setHasClaimedCode] = useState<boolean | null>(null);
  const [hasExistingCode, setHasExistingCode] = useState(false);

  const { toast } = useToast();
  const { signMessageAsync } = useSignMessage();
  const eligibility = useReferralEligibility(walletAddress ?? undefined);

  const invitesRemaining =
    maxReferrals !== null
      ? Math.max(
          0,
          maxReferrals - referrals.filter((row) => row.withinCapacity).length
        )
      : null;

  const fetchReferrals = async (address?: string | null) => {
    const targetAddress = address ?? walletAddress;
    if (!targetAddress) return;
    try {
      const data = await graphqlRequest<{
        user: {
          maxReferrals: number;
          refCodeHash?: string | null;
          referredByCode?: { id: number } | null;
          referrals: { address: string; createdAt: string }[];
        } | null;
      }>(USER_REFERRALS_QUERY, { wallet: targetAddress.toLowerCase() });

      if (!data?.user) {
        setReferrals([]);
        setMaxReferrals(null);
        setHasClaimedCode(false);
        setHasExistingCode(false);
        return;
      }

      setHasClaimedCode(!!data.user.referredByCode);
      setHasExistingCode(!!data.user.refCodeHash);

      const sorted = [...data.user.referrals].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      const rows: ReferralRow[] = sorted.map((r, idx) => {
        const position = idx + 1;
        const withinCapacity = position <= (data.user?.maxReferrals ?? 0);
        return { address: r.address, index: position, withinCapacity };
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
      setCreatedCode(null);
      setCopied(false);
    }
  }, [open, walletAddress]);

  // --- Create invite code handler ---
  const handleCreateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || submitting || !walletAddress) return;

    try {
      setSubmitting(true);
      setError(null);

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
      const signature = await signMessageAsync({ message });

      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_FOIL_API_URL || 'https://api.sapience.xyz'}/referrals/code`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
        if (
          data?.message ===
          'Unable to set referral code. Please choose a different code.'
        ) {
          toast({
            title: 'Unable to set referral code',
            description: 'Please choose a different code.',
            variant: 'destructive',
          });
        } else {
          setError(
            data?.message || 'Unable to set referral code. Please try again.'
          );
        }
        return;
      }

      try {
        if (walletAddress && typeof window !== 'undefined') {
          const key = `sapience:referralCode:${walletAddress.toLowerCase()}`;
          window.localStorage.setItem(key, code.trim());
        }
      } catch {}

      setCreatedCode(code.trim());
      setHasExistingCode(true);
      onCodeSet?.(code.trim());
      await fetchReferrals(walletAddress);
    } catch (err) {
      console.error('Failed to set referral code', err);
      toast({
        title: 'Unable to set referral code',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // --- Claim invite code handler ---
  const handleClaimCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimCode.trim() || claimSubmitting || !walletAddress) return;

    setClaimSubmitting(true);
    setClaimError(null);

    const normalizedAddress = walletAddress.toLowerCase();
    const normalizedCode = claimCode.trim().toLowerCase();
    const codeHash = keccak256(stringToHex(normalizedCode));

    const payload = {
      prefix: 'Sapience Referral',
      walletAddress: normalizedAddress,
      codeHash,
      chainId: null,
      nonce: null,
    };

    const message = JSON.stringify(payload);

    let signature: `0x${string}`;
    try {
      signature = await signMessageAsync({ message });
    } catch {
      toast({
        title: 'Wallet signature failed',
        description: 'Please try again.',
        variant: 'destructive',
      });
      setClaimSubmitting(false);
      return;
    }

    try {
      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_FOIL_API_URL || 'https://api.sapience.xyz'}/referrals/claim`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: normalizedAddress,
            codePlaintext: claimCode.trim(),
            signature,
          }),
        }
      );

      const data = (await resp.json().catch(() => null)) as {
        allowed?: boolean;
        index?: number | null;
        message?: string;
      } | null;

      if (!resp.ok) {
        toast({
          title: 'Claim failed',
          description: data?.message || 'Unknown error',
          variant: 'destructive',
        });
        return;
      }

      if (data && data.allowed === false && (data.index ?? null) === null) {
        toast({
          title: 'Referral code full',
          description:
            'This referral code has reached its capacity. Please try a different one.',
          variant: 'destructive',
        });
        return;
      }

      try {
        if (walletAddress && typeof window !== 'undefined') {
          const key = `sapience:referralCode:${walletAddress.toLowerCase()}`;
          window.localStorage.setItem(key, claimCode.trim());
        }
      } catch {}

      setHasClaimedCode(true);
      toast({ title: 'Invite code claimed!' });
      await fetchReferrals(walletAddress);
    } catch {
      toast({
        title: 'Network error',
        description: 'Could not reach the server. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setClaimSubmitting(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareLink = createdCode
    ? `https://sapience.xyz?ref=${encodeURIComponent(createdCode)}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Referrals</DialogTitle>
        </DialogHeader>

        {/* Section A: Enter an Invite Code (only if not yet claimed) */}
        {hasClaimedCode === false && (
          <>
            <div className="space-y-1.5">
              <h3 className="text-sm font-medium text-foreground">
                Enter an Invite Code
              </h3>
              <form onSubmit={handleClaimCode} className="flex gap-3">
                <Input
                  value={claimCode}
                  onChange={(e) => setClaimCode(e.target.value)}
                  disabled={claimSubmitting}
                  placeholder="Enter code..."
                  className="flex-1"
                />
                <Button
                  type="submit"
                  className="shrink-0"
                  disabled={claimSubmitting || !claimCode.trim()}
                >
                  {claimSubmitting ? 'Submitting...' : 'Submit'}
                </Button>
              </form>
              {claimError && (
                <p className="text-xs text-destructive mt-1">{claimError}</p>
              )}
            </div>
            <hr className="gold-hr" />
          </>
        )}

        {/* Section B: Create an Invite Code */}
        <div className="space-y-1.5">
          <h3 className="text-sm font-medium text-foreground">
            Create an Invite Code
          </h3>

          {!eligibility.eligible && !hasExistingCode ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {eligibility.volume < 10
                    ? 'Trade 10 USDe to earn your first invite code'
                    : `${eligibility.volume.toFixed(2)} / ${eligibility.nextInviteAt} toward your next invite`}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent-gold transition-all duration-300"
                  style={{
                    width: `${Math.min(100, (eligibility.volume % 10) / 10 * 100)}%`,
                  }}
                />
              </div>
              {eligibility.usedInvites > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {eligibility.usedInvites} invite{eligibility.usedInvites !== 1 ? 's' : ''} used
                </p>
              )}
            </div>
          ) : !createdCode && eligibility.eligible && !hasExistingCode ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                You have {eligibility.remainingInvites} invite code{eligibility.remainingInvites !== 1 ? 's' : ''} available ({eligibility.usedInvites} used)
              </p>
              <p className="text-[11px] text-muted-foreground">
                Each invite gives your friend 1 USDe for their first prediction
              </p>
              <form onSubmit={handleCreateCode} className="space-y-1.5">
                <div className="flex gap-3">
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    disabled={submitting}
                    placeholder="Choose a code..."
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
                  Only an encrypted version of your code is stored, so
                  you&apos;ll need to reset it if you forget it.
                </p>
                {error && (
                  <p className="text-xs text-destructive mt-1">{error}</p>
                )}
              </form>
            </div>
          ) : createdCode ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                <span className="flex-1 font-mono text-sm">{createdCode}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => handleCopy(createdCode)}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              {shareLink && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Share link:</span>
                  <button
                    type="button"
                    className="gold-link truncate text-left"
                    onClick={() => handleCopy(shareLink)}
                  >
                    {shareLink}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleCreateCode} className="space-y-1.5">
              <div className="flex gap-3">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={submitting}
                  placeholder="Choose a code..."
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
                Only an encrypted version of your code is stored, so
                you&apos;ll need to reset it if you forget it.
              </p>
              {error && (
                <p className="text-xs text-destructive mt-1">{error}</p>
              )}
            </form>
          )}
        </div>

        <hr className="gold-hr" />

        {/* Section C: Your Referrals */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">
              Your Referrals
            </h3>
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
