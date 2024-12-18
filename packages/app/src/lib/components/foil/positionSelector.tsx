import { Edit } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { useAddEditPosition } from '~/lib/context/AddEditPositionContext';

const PositionSelector: React.FC<{ isLP?: boolean | null }> = ({ isLP }) => {
  const { nftId, positions, setNftId } = useAddEditPosition();
  const [isOpen, setIsOpen] = useState(false);

  let filteredPositions;
  if (isLP === true) {
    filteredPositions = positions?.liquidityPositions;
  } else if (isLP === false) {
    filteredPositions = positions?.tradePositions;
  } else {
    filteredPositions = [
      ...(positions?.liquidityPositions || []),
      ...(positions?.tradePositions || []),
    ];
  }

  const handlePositionSelect = (selectedNftId: number) => {
    setNftId(selectedNftId);
    setIsOpen(false);
  };

  // Helper function to get position type text
  const getPositionTypeText = () => {
    if (isLP === true) return 'Liquidity Position';
    if (isLP === false) return 'Trader Position';
    return 'Position';
  };

  return (
    <div>
      <p className="text-sm font-semibold mb-0.5">Position</p>
      <p className="text-sm items-center flex">
        {nftId ? `#${nftId}` : 'New Position'}{' '}
        <Button
          type="button"
          variant="link"
          size="sm"
          className="text-blue-500 ml-1 p-0 h-auto"
          onClick={() => setIsOpen(true)}
        >
          <Edit className="h-4 w-4" />
        </Button>
      </p>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select {getPositionTypeText()}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col space-y-2">
            {filteredPositions?.map((position) => (
              <Button
                key={Number(position.id)}
                variant="ghost"
                className={`flex justify-between items-center py-2 px-4 rounded-md w-full h-auto
                  ${Number(position.id) === nftId ? 'bg-muted' : 'bg-transparent'}
                  hover:bg-muted/50`}
                onClick={() => handlePositionSelect(Number(position.id))}
              >
                <p className="font-bold">#{Number(position.id)}</p>
              </Button>
            ))}
            <Button
              variant="ghost"
              className={`flex justify-between items-center py-2 px-4 rounded-md w-full h-auto
                ${nftId === 0 ? 'bg-muted' : 'bg-transparent'}
                hover:bg-muted/50`}
              onClick={() => handlePositionSelect(0)}
            >
              <p className="font-bold">New Position</p>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PositionSelector;
