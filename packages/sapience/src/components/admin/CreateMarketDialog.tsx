'use client';

import { DialogHeader, DialogTitle } from '@foil/ui/components/ui/dialog'; // Assuming Dialog parts are available
import type React from 'react';

interface CreateMarketDialogProps {
  // Define any props needed, e.g., chainId, etc.
}

const CreateMarketDialog: React.FC<CreateMarketDialogProps> = ({}) => {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Create New Market</DialogTitle>
      </DialogHeader>
      <div className="py-4">
        <p className="text-sm text-muted-foreground">Coming soon</p>
      </div>
    </>
  );
};

export default CreateMarketDialog;
