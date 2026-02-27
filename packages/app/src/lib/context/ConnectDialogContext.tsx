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
  /** Open dialog and immediately start session creation (e.g. after refcode entry) */
  openAndStartSession: () => void;
}

const ConnectDialogContext = createContext<ConnectDialogContextValue | null>(
  null
);

export function ConnectDialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [shouldStartSession, setShouldStartSession] = useState(false);

  const openConnectDialog = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeConnectDialog = useCallback(() => {
    setIsOpen(false);
  }, []);

  const openAndStartSession = useCallback(() => {
    setShouldStartSession(true);
    setIsOpen(true);
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) setShouldStartSession(false);
  }, []);

  return (
    <ConnectDialogContext.Provider
      value={{
        isOpen,
        openConnectDialog,
        closeConnectDialog,
        openAndStartSession,
      }}
    >
      {children}
      <ConnectDialog
        open={isOpen}
        onOpenChange={handleOpenChange}
        startSessionOnOpen={shouldStartSession}
        onSessionStarted={() => setShouldStartSession(false)}
      />
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
