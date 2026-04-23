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
import { keccak256, stringToHex } from 'viem';
import GetAccessDialog from '~/components/shared/GetAccessDialog';
import {
  ReferralApiError,
  useClaimReferralCode,
} from '~/hooks/referrals/useReferrals';

interface RequiredReferralCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletAddress: string | null;
  onCodeSet?: (code: string) => void;
  onLogout: () => void;
}

function persistReferralCodeLocally(walletAddress: string, code: string) {
  try {
    if (typeof window !== 'undefined') {
      const key = `sapience:referralCode:${walletAddress.toLowerCase()}`;
      window.localStorage.setItem(key, code);
    }
  } catch {
    // If this fails (e.g. privacy mode), the dialog may reappear on next connect.
  }
}

function titleForClaimError(status: number, serverMessage: string): string {
  if (status === 404) return 'Invite code not found';
  if (status === 401 || serverMessage.toLowerCase().includes('signature')) {
    return 'Signature verification failed';
  }
  if (status === 409) return 'Already claimed';
  if (status === 403) return 'Code unavailable';
  return 'Claim failed';
}

const RequiredReferralCodeDialog = ({
  open,
  onOpenChange,
  walletAddress,
  onCodeSet,
  onLogout,
}: RequiredReferralCodeDialogProps) => {
  const [code, setCode] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [isGetAccessOpen, setIsGetAccessOpen] = useState(false);
  const { toast } = useToast();
  const { signMessageAsync } = useSignMessage();
  const claimReferralCode = useClaimReferralCode();
  const submitting = claimReferralCode.isPending;

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
      return;
    }

    // Step 2: Submit claim to the server
    try {
      const data = await claimReferralCode.mutateAsync({
        walletAddress: normalizedAddress,
        codePlaintext: code.trim(),
        signature,
      });

      // Capacity enforcement: if this wallet does not yet have a referral
      // relationship and the code is full, keep the dialog open and surface
      // a clear error instead of silently accepting the code.
      if (data.allowed === false && (data.index ?? null) === null) {
        toast({
          title: 'Referral code full',
          description:
            'This referral code has reached its capacity. Please request a new code or try a different one.',
          variant: 'destructive',
        });
        return;
      }

      persistReferralCodeLocally(walletAddress, code.trim());
      onCodeSet?.(code.trim());
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ReferralApiError) {
        console.error('Referral claim failed:', {
          status: err.status,
          serverMessage: err.message,
        });
        toast({
          title: titleForClaimError(err.status, err.message),
          description: err.message,
          variant: 'destructive',
        });
        return;
      }
      console.error('Referral claim network error:', err);
      toast({
        title: 'Network error',
        description:
          'Could not reach the server. Please check your connection and try again.',
        variant: 'destructive',
      });
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
