'use client';

import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useEffect, useState } from 'react';

interface ConnectWalletModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ConnectWalletModal({
  open,
  onOpenChange,
}: ConnectWalletModalProps) {
  const { openConnectModal } = useConnectModal();

  useEffect(() => {
    if (open) {
      openConnectModal?.();
      onOpenChange(false);
    }
  }, [open, openConnectModal, onOpenChange]);

  return null;
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
