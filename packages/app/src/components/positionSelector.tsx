import { Button } from '@sapience/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/ui/components/ui/dialog';
import { Edit } from 'lucide-react';
import Link from 'next/link';
import type React from 'react';
import { useState, useContext } from 'react';

import { useAddEditPosition } from '~/lib/context/AddEditPositionContext';
import { PeriodContext } from '~/lib/context/PeriodProvider';
import { positionHasBalance } from '~/lib/utils/util';

import PositionDisplay from './PositionDisplay';

const PositionSelector: React.FC = () => {
  const { nftId, processedPositions, setNftId } = useAddEditPosition();
  const [isOpen, setIsOpen] = useState(false);
  const { chainId, address: marketAddress } = useContext(PeriodContext);

  const handlePositionSelect = (selectedNftId: number) => {
    setNftId(selectedNftId);
    setIsOpen(false);
  };

  const getPositionUrl = (position: {
    type: 'lp' | 'trade';
    id: bigint;
    marketID: string;
  }) => {
    const positionType = position.type === 'lp' ? 'pool' : 'trade';
    return `/markets/${chainId}:${marketAddress}/periods/${position.marketID}/${positionType}?positionId=${position.id.toString()}`;
  };

  return (
    <div>
      <p className="text-sm font-semibold mb-0.5">Position</p>
      <p className="text-sm items-center flex">
        {nftId ? <PositionDisplay positionId={nftId} /> : 'New Position'}{' '}
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
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Select Position</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col space-y-2">
            {[...processedPositions]
              .sort((a, b) => {
                const aHasBalance = positionHasBalance(a);
                const bHasBalance = positionHasBalance(b);

                if (aHasBalance && !bHasBalance) return -1;
                if (!aHasBalance && bHasBalance) return 1;

                // If both have balance or both don't have balance, sort by ID (descending)
                return Number(b.id) - Number(a.id);
              })
              .map((position) => (
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
                      <PositionDisplay positionId={position.id.toString()} />
                      <span className="text-sm text-muted-foreground">
                        {position.type === 'lp'
                          ? 'Liquidity Position'
                          : 'Trader Position'}
                      </span>
                      <span className="text-sm ml-auto">
                        {position.type === 'lp'
                          ? `Balance: ${(Number(position.depositedCollateralAmount) / 1e18).toFixed(4)} wstETH`
                          : `Balance: ${
                              Number(position.vEthAmount) > 0
                                ? (Number(position.vEthAmount) / 1e18).toFixed(
                                    4
                                  )
                                : '0'
                            } wstETH`}
                      </span>
                    </div>
                  </Button>
                </Link>
              ))}
            <Button className="mt-3" onClick={() => handlePositionSelect(0)}>
              <p>Create New Position</p>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PositionSelector;
