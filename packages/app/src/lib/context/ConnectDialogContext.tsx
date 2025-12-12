'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import ConnectDialog from '~/components/layout/ConnectDialog';

interface ConnectDialogContextValue {
  isOpen: boolean;
  openConnectDialog: () => void;
  closeConnectDialog: () => void;
}

const ConnectDialogContext = createContext<ConnectDialogContextValue | null>(
  null
);

export function ConnectDialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openConnectDialog = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeConnectDialog = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  return (
    <ConnectDialogContext.Provider
      value={{ isOpen, openConnectDialog, closeConnectDialog }}
    >
      {children}
      <ConnectDialog open={isOpen} onOpenChange={handleOpenChange} />
    </ConnectDialogContext.Provider>
  );
}

export function useConnectDialog() {
  const context = useContext(ConnectDialogContext);
  if (!context) {
    throw new Error(
      'useConnectDialog must be used within a ConnectDialogProvider'
    );
  }
  return context;
}
