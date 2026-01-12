'use client';

import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { useAccount, useConnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/ui/components/ui/dialog';
import { Button } from '@sapience/ui/components/ui/button';
import { Input } from '@sapience/ui/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { Wallet } from 'lucide-react';
import { useAuth } from '~/lib/context/AuthContext';
import { useSession } from '~/lib/context/SessionContext';

// EIP-6963 types
interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: unknown;
}

interface EIP6963AnnounceProviderEvent extends Event {
  detail: EIP6963ProviderDetail;
}

interface ConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Featured wallets to always show (with download links if not installed)
const FEATURED_WALLETS = [
  {
    id: 'rabby',
    name: 'Rabby Wallet',
    matchIds: ['io.rabby', 'rabby'],
    icon: '/wallet-icons/rabby.svg',
  },
  {
    id: 'metamask',
    name: 'MetaMask',
    matchIds: ['io.metamask', 'metamask'],
    icon: '/wallet-icons/metamask.svg',
  },
  {
    id: 'coinbase',
    name: 'Coinbase Wallet',
    matchIds: ['com.coinbase', 'coinbase'],
    icon: '/wallet-icons/coinbase-wallet.png',
  },
  {
    id: 'walletconnect',
    name: 'WalletConnect',
    matchIds: [],
    icon: '/wallet-icons/walletconnect.svg',
  },
] as const;

export default function ConnectDialog({
  open,
  onOpenChange,
}: ConnectDialogProps) {
  const { isConnected } = useAccount();
  const [isClient, setIsClient] = useState(false);
  const { clearLoggedOut } = useAuth();
  const { startSession } = useSession();

  // Session duration state
  const [duration, setDuration] = useState('24');

  // Track if we just connected a wallet (to trigger auto-session)
  // Use a ref to track previous connection state to avoid race conditions
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const prevConnectedRef = useRef(isConnected);

  const { connect, isPending, connectors } = useConnect();
  const [connectingId, setConnectingId] = useState<string | null>(null);

  // EIP-6963 wallet discovery
  const [discoveredWallets, setDiscoveredWallets] = useState<
    EIP6963ProviderDetail[]
  >([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleAnnouncement = (event: Event) => {
      const { detail } = event as EIP6963AnnounceProviderEvent;
      if (!detail?.info?.uuid) return;

      setDiscoveredWallets((prev) => {
        if (prev.some((w) => w.info.uuid === detail.info.uuid)) {
          return prev;
        }
        return [...prev, detail];
      });
    };

    window.addEventListener('eip6963:announceProvider', handleAnnouncement);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    return () => {
      window.removeEventListener(
        'eip6963:announceProvider',
        handleAnnouncement
      );
    };
  }, []);

  // Track client-side hydration
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Auto-create session when wallet connects, then close dialog
  useEffect(() => {
    const wasConnected = prevConnectedRef.current;
    prevConnectedRef.current = isConnected;

    // Detect fresh wallet connection (went from disconnected to connected while dialog is open)
    if (isConnected && !wasConnected && open) {
      console.debug('[ConnectDialog] Fresh wallet connection detected, creating session...');
      setIsCreatingSession(true);
      clearLoggedOut();

      const createSessionAsync = async () => {
        try {
          const durationHours = parseInt(duration || '24', 10);

          console.debug('[ConnectDialog] Starting session with:', { durationHours });
          await startSession({ durationHours });
          console.debug('[ConnectDialog] Session created successfully');
        } catch (error) {
          console.error('[ConnectDialog] Failed to auto-create session:', error);
          // Still close the dialog even if session creation fails
        } finally {
          setIsCreatingSession(false);
          onOpenChange(false);
        }
      };

      void createSessionAsync();
    }
  }, [isConnected, open, onOpenChange, clearLoggedOut, startSession, duration]);

  const handleEIP6963Connect = useCallback(
    (wallet: EIP6963ProviderDetail) => {
      clearLoggedOut();
      setConnectingId(wallet.info.rdns);

      const connector = injected({
        target: () => ({
          id: wallet.info.rdns,
          name: wallet.info.name,
          provider: wallet.provider as never,
        }),
      });

      connect(
        { connector },
        {
          onSettled: () => setConnectingId(null),
        }
      );
    },
    [connect, clearLoggedOut]
  );

  const handleWalletConnectClick = useCallback(() => {
    clearLoggedOut();
    setConnectingId('walletconnect');

    const walletConnectConnector = connectors.find(
      (connector) => connector.id === 'walletConnect'
    );

    if (walletConnectConnector) {
      connect(
        { connector: walletConnectConnector },
        {
          onSettled: () => setConnectingId(null),
        }
      );
    }
  }, [connect, connectors, clearLoggedOut]);

  const handleWalletClick = useCallback(
    (wallet: { eip6963Provider?: EIP6963ProviderDetail; id: string }) => {
      if (wallet.id === 'walletconnect') {
        handleWalletConnectClick();
      } else if (wallet.eip6963Provider) {
        handleEIP6963Connect(wallet.eip6963Provider);
      }
    },
    [handleEIP6963Connect, handleWalletConnectClick]
  );

  // Build wallet list: featured wallets first, then other detected wallets
  const walletOptions = useMemo(() => {
    const options: Array<{
      id: string;
      name: string;
      icon?: string;
      eip6963Provider?: EIP6963ProviderDetail;
    }> = [];

    // Add featured wallets (always shown)
    for (const featured of FEATURED_WALLETS) {
      // Check if this wallet is detected via EIP-6963
      const detectedWallet = discoveredWallets.find((w) => {
        const rdns = w.info.rdns.toLowerCase();
        const name = w.info.name.toLowerCase();
        return featured.matchIds.some(
          (matchId) => rdns.includes(matchId) || name.includes(matchId)
        );
      });

      options.push({
        id: featured.id,
        name: featured.name,
        icon: featured.icon || detectedWallet?.info.icon, // always use featured icon first
        eip6963Provider: detectedWallet,
      });
    }

    // Add other detected wallets (not already in featured)
    for (const wallet of discoveredWallets) {
      const rdns = wallet.info.rdns.toLowerCase();
      const name = wallet.info.name.toLowerCase();

      // Skip Phantom
      if (name.includes('phantom')) {
        continue;
      }

      // Skip if already added as featured
      const isFeatured = FEATURED_WALLETS.some((f) =>
        f.matchIds.some(
          (matchId) => rdns.includes(matchId) || name.includes(matchId)
        )
      );
      if (isFeatured) {
        continue;
      }

      options.push({
        id: wallet.info.rdns,
        name: wallet.info.name,
        icon: wallet.info.icon,
        eip6963Provider: wallet,
      });
    }

    return options;
  }, [discoveredWallets]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-1/2 translate-y-[-50%] sm:max-w-[420px] p-6 gap-0 border-border/50 bg-[hsl(var(--background))]">
        <DialogHeader className="pb-6">
          <DialogTitle className="text-center text-xl font-normal">
            Log in
          </DialogTitle>
        </DialogHeader>

        {/* Wallet Options */}
        <div className="flex flex-col gap-3">
          {/* Loading state */}
          {!isClient && (
            <p className="text-sm text-muted-foreground text-center py-2">
              Loading wallets...
            </p>
          )}

          {/* Wallet options (featured + detected) */}
          {isClient &&
            walletOptions.map((wallet) => {
              const isThisConnecting = connectingId === wallet.id;
              const isWalletConnect = wallet.id === 'walletconnect';
              const isInstalled = isWalletConnect || Boolean(wallet.eip6963Provider);

              return (
                <Button
                  key={wallet.id}
                  variant="outline"
                  className="w-full h-14 justify-start gap-3 px-4 text-base font-medium bg-[hsl(var(--muted)/0.3)] border-border/50 hover:bg-[hsl(var(--muted)/0.5)] disabled:opacity-50"
                  onClick={() => handleWalletClick(wallet)}
                  disabled={!isInstalled || (isPending && isInstalled)}
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded overflow-hidden shrink-0">
                    {wallet.icon ? (
                      <img
                        src={wallet.icon}
                        alt={wallet.name}
                        width={28}
                        height={28}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Wallet className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <span className="flex-1 text-left">
                    {isThisConnecting ? 'Connecting...' : wallet.name}
                  </span>
                </Button>
              );
            })}
        </div>

        {/* Session creating overlay */}
        {isCreatingSession && (
          <div className="mt-4 text-center text-sm text-muted-foreground">
            Creating session...
          </div>
        )}

        {/* Session duration - at the bottom */}
        <p className="text-xs text-muted-foreground text-center mt-6">
          Session approved for{' '}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="underline decoration-dotted underline-offset-2 hover:opacity-80"
              >
                {duration} hours
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2">
              <div className="space-y-2">
                <label className="text-xs font-medium">Duration</label>
                <div className="relative">
                  <Input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-full pr-16"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    hours
                  </span>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </p>
      </DialogContent>
    </Dialog>
  );
}
