'use client';

import { Button } from '@foil/ui/components/ui/button';
import { Checkbox } from '@foil/ui/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@foil/ui/components/ui/dialog';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAccount, useSignMessage, useDisconnect } from 'wagmi';

import { cn } from '~/lib/utils';
import { foilApi } from '~/lib/utils/util';

interface ConnectWalletModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ConnectWalletModal({
  open,
  onOpenChange,
}: ConnectWalletModalProps) {
  const { openConnectModal } = useConnectModal();
  const { isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const [permittedByApi, setPermittedByApi] = useState<boolean | null>(null);
  const [hasPermittedCookie, setHasPermittedCookie] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const { signMessage } = useSignMessage({
    mutation: {
      onSuccess: () => {
        if (typeof document !== 'undefined') {
          document.cookie = 'permitted=true; path=/; max-age=31536000'; // 1 year expiry
        }
        onOpenChange(false);
      },
    },
  });

  useEffect(() => {
    // Check for cookie only on client side
    const cookieCheck = document.cookie
      .split(';')
      .some((item) => item.trim().startsWith('permitted=true'));
    setHasPermittedCookie(cookieCheck);
  }, []);

  useEffect(() => {
    if (open) {
      if (hasPermittedCookie) {
        onOpenChange(false);
        openConnectModal?.();
        return;
      }

      foilApi
        .get('/permit')
        .then((data) => setPermittedByApi(data.permitted))
        .catch((err) => console.error('Error fetching permit status:', err));
    }
  }, [open, openConnectModal, onOpenChange, hasPermittedCookie]);

  useEffect(() => {
    if (isConnected) {
      onOpenChange(true);
    }
  }, [isConnected, onOpenChange]);

  const handleConnectAndSign = async () => {
    if (!isConnected && openConnectModal) {
      openConnectModal();
    } else {
      signMessage({
        message:
          "I acknowledge that I have received and read Oxide Services Corp's Terms of Service and Privacy Policy.",
      });
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    // Only allow closing if not in the signing state (connected but no cookie)
    if (!(isConnected && permittedByApi && !hasPermittedCookie)) {
      onOpenChange(newOpen);
    }
  };

  const shouldHideCloseButton =
    isConnected && permittedByApi && !hasPermittedCookie;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          'sm:max-w-[420px]',
          shouldHideCloseButton && '[&>button]:hidden'
        )}
      >
        {permittedByApi === null && (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin" />
            <DialogDescription className="text-center max-w-[220px]">
              Checking whether you&apos;re permitted to connect to the app...
            </DialogDescription>
          </div>
        )}

        {permittedByApi === true && (
          <div>
            <DialogHeader>
              <DialogTitle>Connect Your Wallet</DialogTitle>
            </DialogHeader>

            <div className="flex flex-col gap-4 my-6">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="tos"
                  checked={tosAccepted}
                  onCheckedChange={(checked) =>
                    setTosAccepted(checked as boolean)
                  }
                />
                <label
                  htmlFor="tos"
                  className="text-sm font-medium leading-wide peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  By clicking this checkbox, I hereby agree to Oxide Services
                  Corp&apos;s{' '}
                  <Link
                    href="https://docs.foil.xyz/terms-of-service"
                    target="_blank"
                    className="font-bold underline"
                  >
                    TERMS OF SERVICE
                  </Link>{' '}
                  and agree to be bound by them.
                </label>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="privacy"
                  checked={privacyAccepted}
                  onCheckedChange={(checked) =>
                    setPrivacyAccepted(checked as boolean)
                  }
                />
                <label
                  htmlFor="privacy"
                  className="text-sm font-medium leading-wide peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  By clicking this checkbox, I acknowledge that I have received
                  and read Oxide Services Corp&apos;s{' '}
                  <Link
                    href="https://docs.foil.xyz/privacy-policy"
                    target="_blank"
                    className="font-bold underline"
                  >
                    PRIVACY POLICY
                  </Link>
                  .
                </label>
              </div>
            </div>

            <Button
              onClick={handleConnectAndSign}
              className="w-full"
              disabled={!tosAccepted || !privacyAccepted}
            >
              {isConnected ? 'Sign' : 'Connect to Sign'}
            </Button>
            {isConnected && (
              <button
                type="button"
                onClick={() => {
                  disconnect();
                  onOpenChange(false);
                }}
                className="w-full text-sm text-gray-500 hover:text-gray-700 text-center mt-2"
              >
                Disconnect wallet
              </button>
            )}
          </div>
        )}

        {permittedByApi === false && (
          <div className="py-4 space-y-6">
            <DialogDescription className="text-center text-lg max-w-[260px] mx-auto">
              Using the Foil app is prohibited in your region.
            </DialogDescription>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function useConnectWalletModal() {
  const [isOpen, setIsOpen] = useState(false);
  return {
    isOpen,
    setIsOpen,
    ConnectWalletModal: () => (
      <ConnectWalletModal open={isOpen} onOpenChange={setIsOpen} />
    ),
  };
}
