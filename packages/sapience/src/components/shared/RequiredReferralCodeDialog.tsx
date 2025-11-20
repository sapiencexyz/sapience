'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/sdk/ui/components/ui/dialog';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import { Input } from '@sapience/sdk/ui/components/ui/input';
import { useToast } from '@sapience/sdk/ui/hooks/use-toast';
import { createWalletClient, custom, http, keccak256, stringToHex } from 'viem';
import { mainnet } from 'viem/chains';

interface RequiredReferralCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletAddress: string | null;
  onCodeSet?: (code: string) => void;
  onLogout: () => void;
}

const RequiredReferralCodeDialog = ({
  open,
  onOpenChange,
  walletAddress,
  onCodeSet,
  onLogout,
}: RequiredReferralCodeDialogProps) => {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleDialogOpenChange = (nextOpen: boolean) => {
    // When a referral code is required, the dialog should not be dismissible
    // by the user; they must either submit a code or log out.
    if (!nextOpen) return;
    onOpenChange(nextOpen);
  };

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

      // Canonical message: includes walletAddress and codeHash (plus optional chainId/nonce)
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
        `${process.env.NEXT_PUBLIC_FOIL_API_URL || 'https://api.sapience.xyz'}/referrals/claim`,
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

      const data = (await resp.json().catch(() => null)) as {
        allowed?: boolean;
        index?: number | null;
        maxReferrals?: number;
        message?: string;
      } | null;

      if (!resp.ok) {
        const message = data?.message || 'Failed to claim referral code';
        toast({
          title: 'Unable to claim referral code',
          description: message,
          variant: 'destructive',
        });
        // Avoid rendering this error inline in the dialog.
        setError(null);
        return;
      }

      // Capacity enforcement: if this wallet does not yet have a referral
      // relationship and the code is full, keep the dialog open and surface
      // a clear error instead of silently accepting the code.
      if (data && data.allowed === false && (data.index ?? null) === null) {
        const capacityMessage =
          'This referral code has reached its capacity. Please request a new code or try a different one.';
        toast({
          title: 'Referral code full',
          description: capacityMessage,
          variant: 'destructive',
        });
        // Keep the dialog open but avoid rendering this message inline.
        setError(null);
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
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="sm:max-w-[520px]"
        hideCloseButton
        // Trap focus and prevent outside dismiss while a code is required.
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Enter an Invite Code</DialogTitle>
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
            {error && (
              <p className="text-xs text-destructive mt-1.5">{error}</p>
            )}
          </div>
        </form>

        <div>
          <p className="text-base text-foreground">
            If you don&apos;t have an invite code, you can request one in{' '}
            <a
              href="https://discord.gg/sapience"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              Discord
            </a>
            . You can{` `}
            <button
              type="button"
              className="underline underline-offset-2"
              disabled={submitting}
              onClick={onLogout}
            >
              log out
            </button>{' '}
            until you receive one.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RequiredReferralCodeDialog;
