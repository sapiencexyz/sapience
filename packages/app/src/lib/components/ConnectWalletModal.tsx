import { useConnectModal } from '@rainbow-me/rainbowkit';
import { Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { API_BASE_URL } from '~/lib/constants/constants';
import { cn } from '~/lib/utils';

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
  const [permitted, setPermitted] = useState<boolean | null>(null);
  const { signMessage } = useSignMessage({
    mutation: {
      onSuccess: () => {
        document.cookie = 'permitted=true; path=/; max-age=31536000'; // 1 year expiry
        onOpenChange(false);
      },
    },
  });

  const hasPermittedCookie = document.cookie
    .split(';')
    .some((item) => item.trim().startsWith('permitted=true'));

  useEffect(() => {
    if (open) {
      if (hasPermittedCookie) {
        onOpenChange(false);
        openConnectModal?.();
        return;
      }

      fetch(`${API_BASE_URL}/permit`)
        .then((res) => res.json())
        .then((data) => setPermitted(data.permitted))
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
      signMessage({ message: "I agree to Foil's Terms of Service" });
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    // Only allow closing if not in the signing state (connected but no cookie)
    if (!(isConnected && permitted && !hasPermittedCookie)) {
      onOpenChange(newOpen);
    }
  };

  const shouldHideCloseButton = isConnected && permitted && !hasPermittedCookie;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          'sm:max-w-[420px]',
          shouldHideCloseButton && '[&>button]:hidden'
        )}
      >
        {permitted === null && (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin" />
            <DialogDescription className="text-center max-w-[220px]">
              Checking whether you’re permitted to connect to the app...
            </DialogDescription>
          </div>
        )}

        {permitted === true && (
          <div className="space-y-6">
            <DialogHeader>
              <DialogTitle>Review the Terms of Service</DialogTitle>
            </DialogHeader>
            <ScrollArea className="h-[300px] rounded-md border">
              <div className="space-y-4 p-4">
                <p className="text-sm text-muted-foreground">
                  By connecting your wallet, you agree to our Terms of Service
                  and Privacy Policy. You acknowledge that you have read and
                  understood these terms, and that you accept all risks
                  associated with using the Foil protocol.
                </p>
                <p className="text-sm text-muted-foreground">
                  1. You understand that using the Foil protocol involves risks,
                  including but not limited to: - Smart contract risks - Market
                  volatility risks - Technical risks - Regulatory risks
                </p>
                <p className="text-sm text-muted-foreground">
                  2. You confirm that you are not a resident of or located in
                  any restricted jurisdiction.
                </p>
                <p className="text-sm text-muted-foreground">
                  3. You acknowledge that you are solely responsible for your
                  trading decisions and the security of your wallet.
                </p>
              </div>
            </ScrollArea>
            <Button onClick={handleConnectAndSign} className="w-full">
              {isConnected ? 'Sign Terms of Service' : 'Connect to Sign'}
            </Button>
          </div>
        )}

        {permitted === false && (
          <div className="py-4 space-y-6">
            <DialogDescription className="text-center text-lg max-w-[260px] mx-auto">
              Using the Foil app is prohibited in your region and via VPN.
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
