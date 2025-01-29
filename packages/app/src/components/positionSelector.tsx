import { Edit } from 'lucide-react';
import Link from 'next/link';
import type React from 'react';
import { useState, useContext } from 'react';

import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { useAddEditPosition } from '~/lib/context/AddEditPositionContext';
import { PeriodContext } from '~/lib/context/PeriodProvider';

const PositionSelector: React.FC = () => {
  const { nftId, positions, setNftId } = useAddEditPosition();
  const [isOpen, setIsOpen] = useState(false);
  const { chainId, address: marketAddress, epoch } = useContext(PeriodContext);

  const allPositions = [
    ...(positions?.liquidityPositions?.map((pos) => ({
      ...pos,
      type: 'lp' as const,
    })) || []),
    ...(positions?.tradePositions?.map((pos) => ({
      ...pos,
      type: 'trade' as const,
    })) || []),
  ];

  const handlePositionSelect = (selectedNftId: number) => {
    setNftId(selectedNftId);
    setIsOpen(false);
  };

  const getPositionUrl = (position: { type: 'lp' | 'trade'; id: bigint }) => {
    const baseUrl = position.type === 'lp' ? 'pool' : 'trade';
    return `/${baseUrl}/${chainId}:${marketAddress}/periods/${epoch}?positionId=${position.id.toString()}`;
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
          className="text-blue-500 hover:text-blue-600 ml-1 p-0 h-auto"
          onClick={() => setIsOpen(true)}
        >
          <Edit className="h-4 w-4" />
        </Button>
      </p>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-[300px]">
          <DialogHeader>
            <DialogTitle>Select Position</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col space-y-2">
            {allPositions.map((position) => (
              <Link
                key={position.id.toString()}
                href={getPositionUrl(position)}
                className="w-full"
              >
                <Button
                  variant="ghost"
                  className={`flex justify-between items-center py-2 px-4 rounded-md w-full h-auto
                    ${Number(position.id) === nftId ? 'bg-muted' : 'bg-transparent'}
                    hover:bg-muted/50`}
                  onClick={() => handlePositionSelect(Number(position.id))}
                >
                  <div className="flex items-center gap-2 w-full">
                    <p className="font-bold">#{position.id.toString()}</p>
                    <span className="text-sm text-muted-foreground ml-auto">
                      {position.type === 'lp'
                        ? 'Liquidity Position'
                        : 'Trader Position'}
                    </span>
                  </div>
                </Button>
              </Link>
            ))}
            <Button className="mt-6" onClick={() => handlePositionSelect(0)}>
              <p>Create New Position</p>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PositionSelector;
