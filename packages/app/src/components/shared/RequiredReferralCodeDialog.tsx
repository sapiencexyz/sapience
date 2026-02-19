'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/ui/components/ui/dialog';
import { Button } from '@sapience/ui/components/ui/button';
import { Input } from '@sapience/ui/components/ui/input';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { useSignMessage } from 'wagmi';
import GetAccessDialog from '~/components/shared/GetAccessDialog';
import { keccak256, stringToHex } from 'viem';

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
  const [loggingOut, setLoggingOut] = useState(false);
  const [isGetAccessOpen, setIsGetAccessOpen] = useState(false);
  const { toast } = useToast();
  const { signMessageAsync } = useSignMessage();

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      // Call the provided logout handler (Privy logout)
      // Even if Privy's session close request fails, the logout() call
      // will still disconnect the browser wallet successfully since
      // wallet disconnection happens client-side before the session API call
      await Promise.resolve(onLogout());
    } catch {
      // Privy may throw on session close API errors, but the wallet
      // should already be disconnected at this point. Swallow the error.
    }
    // Always reload after logout attempt to ensure clean state across browsers
    // This handles edge cases where Privy errors but wallet is disconnected
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

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

    setSubmitting(true);

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

    // Step 1: Sign the message with the connected wallet
    let signature: `0x${string}`;
    try {
      signature = await signMessageAsync({ message });
    } catch (signErr) {
      console.error('Wallet signing failed:', signErr);
      toast({
        title: 'Wallet signature failed',
        description:
          'Your wallet could not sign the verification message. Please try again.',
        variant: 'destructive',
      });
      setSubmitting(false);
      return;
    }

    // Step 2: Submit claim to the server
    try {
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
        const serverMessage = data?.message || 'Unknown error';
        console.error('Referral claim failed:', {
          status: resp.status,
          serverMessage,
        });

        // Use a specific toast title based on the failure type
        const title =
          resp.status === 404
            ? 'Invite code not found'
            : resp.status === 401 ||
                serverMessage.toLowerCase().includes('signature')
              ? 'Signature verification failed'
              : resp.status === 409
                ? 'Already claimed'
                : resp.status === 403
                  ? 'Code unavailable'
                  : 'Claim failed';

        toast({
          title,
          description: serverMessage,
          variant: 'destructive',
        });
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
    } catch (err) {
      console.error('Referral claim network error:', err);
      toast({
        title: 'Network error',
        description:
          'Could not reach the server. Please check your connection and try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="sm:max-w-[520px]"
        hideCloseButton
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Enter an Invite Code</DialogTitle>
        </DialogHeader>

        <p className="text-base text-foreground -mb-2">
          <button
            type="button"
            onClick={() => setIsGetAccessOpen(true)}
            className="gold-link"
          >
            Get an invite code
          </button>{' '}
          for early access.
        </p>
        <GetAccessDialog
          open={isGetAccessOpen}
          onOpenChange={setIsGetAccessOpen}
        />

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
          </div>
        </form>

        <hr className="gold-hr mt-3 mb-1" />

        <div>
          <p className="text-base text-foreground mb-2">
            You can log out until you receive one.
          </p>
          <Button
            type="button"
            className="w-full font-semibold"
            disabled={submitting || loggingOut}
            onClick={handleLogout}
          >
            {loggingOut ? 'Logging out...' : 'Log out'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RequiredReferralCodeDialog;
