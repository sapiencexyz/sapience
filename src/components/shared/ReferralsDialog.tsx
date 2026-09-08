'use client';

import { useMemo, useState } from 'react';
import { useSignMessage } from 'wagmi';
import { keccak256, stringToHex } from 'viem';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { useToast } from '~/hooks/use-toast';
import { DEFAULT_CHAIN_ID, COLLATERAL_SYMBOLS } from '~/lib/sdk/constants';
import { useProfileVolume } from '~/hooks/useProfileVolume';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import {
  ReferralApiError,
  persistReferralCodeLocally,
  useSetReferralCode,
  useUserReferrals,
} from '~/hooks/referrals/useReferrals';

const VOLUME_THRESHOLD = 5000;

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

const ReferralsDialog = ({
  open,
  onOpenChange,
  walletAddress,
  onCodeSet,
}: ReferralsDialogProps) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { signMessageAsync } = useSignMessage();

  const userVolume = useProfileVolume(walletAddress ?? undefined);
  const hasEnoughVolume = userVolume.value >= VOLUME_THRESHOLD;
  const inviteCodeDisabled = userVolume.isLoading || !hasEnoughVolume;

  const userReferralsQuery = useUserReferrals(walletAddress, open);
  const setReferralCode = useSetReferralCode();
  const submitting = setReferralCode.isPending;

  const { referrals, maxReferrals } = useMemo<{
    referrals: ReferralRow[];
    maxReferrals: number | null;
  }>(() => {
    const user = userReferralsQuery.data?.user;
    if (!user) {
      return { referrals: [], maxReferrals: null };
    }
    const sorted = [...user.referrals].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const rows: ReferralRow[] = sorted.map((r, idx) => {
      const position = idx + 1;
      return {
        address: r.address,
        index: position,
        withinCapacity: position <= (user.maxReferrals ?? 0),
      };
    });
    return { referrals: rows, maxReferrals: user.maxReferrals ?? null };
  }, [userReferralsQuery.data]);

  const invitesRemaining =
    maxReferrals !== null
      ? Math.max(
          0,
          maxReferrals - referrals.filter((row) => row.withinCapacity).length
        )
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || submitting) return;
    if (!walletAddress) return;

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

    try {
      const signature = await signMessageAsync({
        message: JSON.stringify(payload),
      });

      await setReferralCode.mutateAsync({
        walletAddress: normalizedAddress,
        codePlaintext: code.trim(),
        signature,
      });

      persistReferralCodeLocally(walletAddress, code.trim());

      onCodeSet?.(code.trim());
      // Immediately refresh referrals so the dashboard reflects the new code
      // and any updated maxReferrals before closing.
      await userReferralsQuery.refetch();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ReferralApiError) {
        if (
          err.message ===
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
          setError(
            err.message || 'Unable to set referral code. Please try again.'
          );
        }
        return;
      }
      console.error('Failed to set referral code', err);
      toast({
        title: 'Unable to set referral code',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
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
            <h3 className="text-sm font-medium text-foreground">
              Create an Invite Code
            </h3>
            <div className="flex gap-3">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={inviteCodeDisabled || submitting}
                className="flex-1"
              />
              <Button
                type="submit"
                className="shrink-0"
                disabled={inviteCodeDisabled || submitting || !code.trim()}
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {inviteCodeDisabled
                ? `You can create an invite code once you've done $${VOLUME_THRESHOLD.toLocaleString()} in trading volume. Current: $${userVolume.display}`
                : "Only an encrypted version of your code is stored, so you'll need to reset it if you forget it."}
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
