import type React from 'react';
import { createContext, useContext, useState } from 'react';

import ConnectWalletModal from '../components/ConnectWalletModal';

interface ConnectWalletContextType {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const ConnectWalletContext = createContext<
  ConnectWalletContextType | undefined
>(undefined);

export function useConnectWallet() {
  const context = useContext(ConnectWalletContext);
  if (context === undefined) {
    throw new Error(
      'useConnectWallet must be used within a ConnectWalletProvider'
    );
  }
  return context;
}

export function ConnectWalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <ConnectWalletContext.Provider value={{ isOpen, setIsOpen }}>
      {children}
      <ConnectWalletModal open={isOpen} onOpenChange={setIsOpen} />
    </ConnectWalletContext.Provider>
  );
}
