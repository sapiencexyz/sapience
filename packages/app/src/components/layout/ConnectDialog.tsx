'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/sdk/ui/components/ui/dialog';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import { Mail, Wallet } from 'lucide-react';
import Image from 'next/image';

import {
  useWalletDiscovery,
  type EIP6963ProviderDetail,
} from '~/hooks/useWalletDiscovery';
import { useExternalWalletConnect } from '~/hooks/useExternalWalletConnect';
import { useAuth } from '~/lib/context/AuthContext';

interface ConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Wallet icons as data URLs (from @rainbow-me/rainbowkit)
const WALLET_ICONS = {
  coinbase:
    'data:image/svg+xml,<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">%0A<rect width="28" height="28" fill="%232C5FF6"/>%0A<path fill-rule="evenodd" clip-rule="evenodd" d="M14 23.8C19.4124 23.8 23.8 19.4124 23.8 14C23.8 8.58761 19.4124 4.2 14 4.2C8.58761 4.2 4.2 8.58761 4.2 14C4.2 19.4124 8.58761 23.8 14 23.8ZM11.55 10.8C11.1358 10.8 10.8 11.1358 10.8 11.55V16.45C10.8 16.8642 11.1358 17.2 11.55 17.2H16.45C16.8642 17.2 17.2 16.8642 17.2 16.45V11.55C17.2 11.1358 16.8642 10.8 16.45 10.8H11.55Z" fill="white"/>%0A</svg>%0A',
  okx: 'data:image/svg+xml,<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">%0A<rect width="28" height="28" fill="black"/>%0A<path d="M16.8 11.2H11.2V16.8H16.8V11.2Z" fill="white"/>%0A<path d="M11.2 5.6H5.6V11.2H11.2V5.6Z" fill="white"/>%0A<path d="M22.4 5.6H16.8V11.2H22.4V5.6Z" fill="white"/>%0A<path d="M11.2 16.8H5.6V22.4H11.2V16.8Z" fill="white"/>%0A<path d="M22.4 16.8H16.8V22.4H22.4V16.8Z" fill="white"/>%0A</svg>%0A',
};

export default function ConnectDialog({
  open,
  onOpenChange,
}: ConnectDialogProps) {
  const { login } = usePrivy();
  const { isConnected } = useAccount();
  const [isClient, setIsClient] = useState(false);
  const { clearLoggedOut } = useAuth();

  // EIP-6963 wallet discovery
  const { discoveredWallets, isDiscovering } = useWalletDiscovery();

  // External wallet connection handlers
  const {
    connectingWallet,
    isConnecting,
    connectEIP6963Wallet,
    connectCoinbaseWallet,
    connectOKXWallet,
  } = useExternalWalletConnect();

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

  const handleEIP6963Connect = useCallback(
    async (wallet: EIP6963ProviderDetail) => {
      clearLoggedOut();
      await connectEIP6963Wallet(wallet);
    },
    [connectEIP6963Wallet, clearLoggedOut]
  );

  const handleCoinbaseClick = useCallback(async () => {
    clearLoggedOut();
    await connectCoinbaseWallet();
  }, [connectCoinbaseWallet, clearLoggedOut]);

  const handleOKXClick = useCallback(async () => {
    clearLoggedOut();
    await connectOKXWallet();
  }, [connectOKXWallet, clearLoggedOut]);

  // Filter out WalletConnect, Coinbase, and OKX from discovered wallets
  // (they're shown separately as always-available options)
  const filteredDiscoveredWallets = discoveredWallets.filter((wallet) => {
    const rdns = wallet.info.rdns.toLowerCase();
    const name = wallet.info.name.toLowerCase();
    return (
      !rdns.includes('walletconnect') &&
      !name.includes('walletconnect') &&
      !rdns.includes('coinbase') &&
      !name.includes('coinbase') &&
      !rdns.includes('okx') &&
      !rdns.includes('okex') &&
      !name.includes('okx')
    );
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

          {/* Discovered wallets from EIP-6963 */}
          {isClient &&
            filteredDiscoveredWallets.map((wallet) => {
              const isThisWalletConnecting =
                connectingWallet === wallet.info.rdns;

              return (
                <Button
                  key={wallet.info.uuid}
                  variant="outline"
                  className="w-full h-14 justify-start gap-3 px-4 text-base font-medium bg-[hsl(var(--muted)/0.3)] border-border/50 hover:bg-[hsl(var(--muted)/0.5)] disabled:opacity-50"
                  onClick={() => handleEIP6963Connect(wallet)}
                  disabled={isConnecting}
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded overflow-hidden shrink-0">
                    {wallet.info.icon ? (
                      <img
                        src={wallet.info.icon}
                        alt={wallet.info.name}
                        width={28}
                        height={28}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Wallet className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <span>
                    {isThisWalletConnecting
                      ? 'Connecting...'
                      : wallet.info.name}
                  </span>
                </Button>
              );
            })}

          {/* Discovering indicator */}
          {isClient &&
            isDiscovering &&
            filteredDiscoveredWallets.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-1">
                Detecting wallets...
              </p>
            )}

          {/* Always-available options: OKX Wallet */}
          {isClient && (
            <Button
              variant="outline"
              className="w-full h-14 justify-start gap-3 px-4 text-base font-medium bg-[hsl(var(--muted)/0.3)] border-border/50 hover:bg-[hsl(var(--muted)/0.5)] disabled:opacity-50"
              onClick={handleOKXClick}
              disabled={isConnecting}
            >
              <div className="flex items-center justify-center w-7 h-7 rounded overflow-hidden shrink-0">
                <Image
                  src={WALLET_ICONS.okx}
                  alt="OKX Wallet"
                  width={28}
                  height={28}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              </div>
              <span>
                {connectingWallet === 'okx' ? 'Connecting...' : 'OKX Wallet'}
              </span>
            </Button>
          )}

          {/* Always-available options: Coinbase Wallet */}
          {isClient && (
            <Button
              variant="outline"
              className="w-full h-14 justify-start gap-3 px-4 text-base font-medium bg-[hsl(var(--muted)/0.3)] border-border/50 hover:bg-[hsl(var(--muted)/0.5)] disabled:opacity-50"
              onClick={handleCoinbaseClick}
              disabled={isConnecting}
            >
              <div className="flex items-center justify-center w-7 h-7 rounded overflow-hidden shrink-0">
                <Image
                  src={WALLET_ICONS.coinbase}
                  alt="Coinbase Wallet"
                  width={28}
                  height={28}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              </div>
              <span>
                {connectingWallet === 'coinbase'
                  ? 'Connecting...'
                  : 'Coinbase Wallet'}
              </span>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
