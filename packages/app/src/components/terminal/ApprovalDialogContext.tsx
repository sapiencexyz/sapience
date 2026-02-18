'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

type ApprovalDialogContextValue = {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  requiredAmount: string | null;
  openApproval: (amount?: string) => void;
};

const ApprovalDialogContext = createContext<
  ApprovalDialogContextValue | undefined
>(undefined);

export function ApprovalDialogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [requiredAmount, setRequiredAmount] = useState<string | null>(null);

  const openApproval = useCallback((amount?: string) => {
    setRequiredAmount(
      typeof amount === 'string' && amount.length > 0 ? amount : null
    );
    setIsOpen(true);
  }, []);

  const value = useMemo<ApprovalDialogContextValue>(
    () => ({
      isOpen,
      setOpen: setIsOpen,
      requiredAmount,
      openApproval,
    }),
    [isOpen, requiredAmount, openApproval]
  );

  return (
    <ApprovalDialogContext.Provider value={value}>
      {children}
    </ApprovalDialogContext.Provider>
  );
}

export function useApprovalDialog(): ApprovalDialogContextValue {
  const ctx = useContext(ApprovalDialogContext);
  if (!ctx)
    throw new Error(
      'useApprovalDialog must be used within ApprovalDialogProvider'
    );
  return ctx;
}
