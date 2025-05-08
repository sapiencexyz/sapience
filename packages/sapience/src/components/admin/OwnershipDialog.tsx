import { Button } from '@foil/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@foil/ui/components/ui/dialog';
import { Input } from '@foil/ui/components/ui/input';
import type React from 'react';
import { useState } from 'react';
import type { Address } from 'viem';
import { useAccount } from 'wagmi';

import { useMarketGroupOwnership } from '~/hooks/contract/useMarketGroupOwnership';

interface OwnershipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marketGroupAddress: Address;
  currentOwner?: string;
}

const OwnershipDialog: React.FC<OwnershipDialogProps> = ({
  open,
  onOpenChange,
  marketGroupAddress,
  currentOwner,
}) => {
  const { address: connectedAddress } = useAccount();
  const [nomineeAddress, setNomineeAddress] = useState('');
  const [nomineeError, setNomineeError] = useState('');
  const {
    nominateNewOwner,
    nominateLoading,
    nominateError,
    acceptOwnership,
    acceptLoading,
    acceptError,
    pendingOwner,
    pendingOwnerLoading,
    pendingOwnerError,
  } = useMarketGroupOwnership(marketGroupAddress);

  const isOwner =
    connectedAddress &&
    currentOwner &&
    connectedAddress.toLowerCase() === currentOwner.toLowerCase();
  const isNominated =
    connectedAddress &&
    pendingOwner &&
    connectedAddress.toLowerCase() === pendingOwner.toLowerCase();

  const handleNominate = async () => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(nomineeAddress)) {
      setNomineeError('Invalid address');
      return;
    }
    setNomineeError('');
    try {
      await nominateNewOwner(nomineeAddress as Address);
      setNomineeAddress('');
      onOpenChange(false);
    } catch (err) {
      setNomineeError(nominateError?.message || 'Failed to nominate owner');
    }
  };

  const handleAccept = async () => {
    try {
      await acceptOwnership();
      onOpenChange(false);
    } catch (err) {
      // Optionally handle error
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Ownership
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Market Group Ownership</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <div>
              Current Owner:{' '}
              <span className="font-mono text-xs">{currentOwner || 'N/A'}</span>
            </div>
            <div>
              Nominated Owner:{' '}
              {pendingOwnerLoading && (
                <span className="text-xs">Loading...</span>
              )}
              {pendingOwnerError && (
                <span className="text-destructive text-xs">
                  Error loading nominated owner
                </span>
              )}
              {!pendingOwnerLoading && !pendingOwnerError && (
                <span className="font-mono text-xs">
                  {pendingOwner || 'N/A'}
                </span>
              )}
            </div>
          </div>
          {isOwner && (
            <div className="space-y-2">
              <Input
                placeholder="New owner address"
                value={nomineeAddress}
                onChange={(e) => setNomineeAddress(e.target.value)}
                disabled={nominateLoading}
              />
              {(nomineeError || nominateError) && (
                <div className="text-destructive text-xs">
                  {nomineeError || nominateError?.message}
                </div>
              )}
              <Button
                onClick={handleNominate}
                size="sm"
                disabled={nominateLoading}
              >
                {nominateLoading ? 'Nominating...' : 'Nominate New Owner'}
              </Button>
            </div>
          )}
          {isNominated && (
            <Button onClick={handleAccept} size="sm" disabled={acceptLoading}>
              {acceptLoading ? 'Accepting...' : 'Accept Ownership'}
            </Button>
          )}
          {!isOwner && !isNominated && (
            <div className="text-xs text-muted-foreground">
              Only the current owner can nominate a new owner. Only the
              nominated owner can accept ownership.
            </div>
          )}
          {acceptError && (
            <div className="text-destructive text-xs">
              {acceptError.message}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OwnershipDialog;
