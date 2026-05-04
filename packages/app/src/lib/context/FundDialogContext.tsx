'use client';

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import FundDialog from '~/components/layout/FundDialog';
import BridgeReconciler from '~/components/layout/BridgeReconciler';

interface FundDialogContextValue {
  isOpen: boolean;
  openFundDialog: () => void;
  closeFundDialog: () => void;
}

const FundDialogContext = createContext<FundDialogContextValue | null>(null);

export function FundDialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openFundDialog = useCallback(() => setIsOpen(true), []);
  const closeFundDialog = useCallback(() => setIsOpen(false), []);

  return (
    <FundDialogContext.Provider
      value={{ isOpen, openFundDialog, closeFundDialog }}
    >
      {children}
      <FundDialog open={isOpen} onOpenChange={setIsOpen} />
      <BridgeReconciler />
    </FundDialogContext.Provider>
  );
}

export function useFundDialog() {
  const context = useContext(FundDialogContext);
  if (!context) {
    throw new Error('useFundDialog must be used within a FundDialogProvider');
  }
  return context;
}
