'use client';

import { useAccount } from 'wagmi';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/ui/components/ui/dialog';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import BungeeBridgePanel from '~/components/layout/BungeeBridgePanel';
import { useCollateralBalance } from '~/hooks/blockchain/useCollateralBalance';
import { useSession } from '~/lib/context/SessionContext';

interface FundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function FundDialog({ open, onOpenChange }: FundDialogProps) {
  const { address: eoaAddress } = useAccount();
  const { smartAccountAddress, isCalculatingAddress } = useSession();

  const { symbol, refetch: refetchSmartAccountBalance } = useCollateralBalance({
    address: smartAccountAddress as `0x${string}` | undefined,
    chainId: DEFAULT_CHAIN_ID,
    enabled: Boolean(smartAccountAddress),
  });

  const { refetch: refetchEoaBalance } = useCollateralBalance({
    address: eoaAddress,
    chainId: DEFAULT_CHAIN_ID,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] sm:p-8 overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Deposit</DialogTitle>
        </DialogHeader>
        <BungeeBridgePanel
          eoaAddress={eoaAddress}
          smartAccountAddress={smartAccountAddress as `0x${string}` | undefined}
          collateralSymbol={symbol}
          isCalculatingAddress={isCalculatingAddress}
          onDelivered={() => {
            refetchEoaBalance();
            refetchSmartAccountBalance();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
