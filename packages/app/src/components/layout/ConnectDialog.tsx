'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount, useConnect, useConnectors } from 'wagmi';
import type { Connector } from 'wagmi';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/sdk/ui/components/ui/dialog';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import { Mail, Wallet } from 'lucide-react';

import { useAuth } from '~/lib/context/AuthContext';

interface ConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ConnectDialog({
  open,
  onOpenChange,
}: ConnectDialogProps) {
  const { login } = usePrivy();
  const { isConnected } = useAccount();
  const [isClient, setIsClient] = useState(false);
  const { clearLoggedOut } = useAuth();

  // Wagmi's built-in connector discovery (includes EIP-6963 wallets)
  const connectors = useConnectors();
  const { connect, isPending } = useConnect();

  const [connectingId, setConnectingId] = useState<string | null>(null);

  // Track client-side hydration
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Close dialog when connected and clear logged out state
  useEffect(() => {
    if (isConnected && open) {
      clearLoggedOut();
      onOpenChange(false);
    }
  }, [isConnected, open, onOpenChange, clearLoggedOut]);

  const handleEmailLogin = useCallback(() => {
    clearLoggedOut();
    onOpenChange(false);
    login();
  }, [login, onOpenChange, clearLoggedOut]);

  const handleConnectorClick = useCallback(
    (connector: Connector) => {
      clearLoggedOut();
      setConnectingId(connector.id);
      connect(
        { connector },
        {
          onSettled: () => setConnectingId(null),
        }
      );
    },
    [connect, clearLoggedOut]
  );

  // Filter connectors to show useful options
  // - Show injected/EIP-6963 discovered wallets
  // - Filter out duplicates and internal connectors
  const filteredConnectors = connectors.filter((connector) => {
    const id = connector.id.toLowerCase();
    const name = connector.name.toLowerCase();

    // Skip WalletConnect (removed from UI per user request)
    if (id.includes('walletconnect') || name.includes('walletconnect')) {
      return false;
    }

    // Include injected wallets (EIP-6963 discovered)
    if (connector.type === 'injected') {
      return true;
    }

    // Include Coinbase Wallet
    if (id.includes('coinbase') || name.includes('coinbase')) {
      return true;
    }

    return false;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-6 gap-0 border-border/50 bg-[hsl(var(--background))]">
        <DialogHeader className="pb-6">
          <DialogTitle className="text-center text-xl font-normal">
            Log in
          </DialogTitle>
        </DialogHeader>

        {/* Email/SMS Login Button */}
        <Button
          variant="outline"
          className="w-full h-14 justify-start gap-3 px-4 text-base font-medium bg-[hsl(var(--muted)/0.3)] border-border/50 hover:bg-[hsl(var(--muted)/0.5)]"
          onClick={handleEmailLogin}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded bg-muted/50">
            <Mail className="h-5 w-5 text-muted-foreground" />
          </div>
          <span>Log in with Email or SMS</span>
        </Button>

        {/* Divider */}
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border/50" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-3 text-muted-foreground uppercase tracking-wide">
              or
            </span>
          </div>
        </div>

        {/* Wallet Options */}
        <div className="flex flex-col gap-3">
          {/* Loading state */}
          {!isClient && (
            <p className="text-sm text-muted-foreground text-center py-2">
              Loading wallets...
            </p>
          )}

          {/* Connectors from wagmi (includes EIP-6963 discovered wallets) */}
          {isClient &&
            filteredConnectors.map((connector) => {
              const isThisConnecting = connectingId === connector.id;

              return (
                <Button
                  key={connector.id}
                  variant="outline"
                  className="w-full h-14 justify-start gap-3 px-4 text-base font-medium bg-[hsl(var(--muted)/0.3)] border-border/50 hover:bg-[hsl(var(--muted)/0.5)] disabled:opacity-50"
                  onClick={() => handleConnectorClick(connector)}
                  disabled={isPending}
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded overflow-hidden shrink-0">
                    {connector.icon ? (
                      <img
                        src={connector.icon}
                        alt={connector.name}
                        width={28}
                        height={28}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Wallet className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <span>
                    {isThisConnecting ? 'Connecting...' : connector.name}
                  </span>
                </Button>
              );
            })}

          {/* No wallets found */}
          {isClient && filteredConnectors.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              No wallets detected. Install a wallet extension to connect.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
