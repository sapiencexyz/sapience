'use client';

import { Badge } from '@foil/ui/components/ui/badge';
import { Button } from '@foil/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@foil/ui/components/ui/dropdown-menu';
import { Label } from '@foil/ui/components/ui/label';
import { ChevronDown } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type React from 'react';

import { useForecast } from '~/lib/context/ForecastProvider';

interface PositionSelectorProps {}

const PositionSelector: React.FC<PositionSelectorProps> = () => {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { lpPositionsArray, traderPositionsArray, getPositionById } =
    useForecast();

  const currentPositionId = searchParams.get('positionId');
  const selectedPosition = currentPositionId
    ? getPositionById(currentPositionId)
    : null;

  const hasPositions =
    lpPositionsArray.length > 0 || traderPositionsArray.length > 0;

  // If no positions, render nothing
  if (!hasPositions && !selectedPosition) {
    return null;
  }

  const handleSelectPosition = (positionId: string | null) => {
    const currentPath = `/forecasting/${params.chainShortName}/${params.marketId}`;
    const newSearchParams = new URLSearchParams(searchParams.toString());

    if (positionId) {
      newSearchParams.set('positionId', positionId);
    } else {
      newSearchParams.delete('positionId');
    }

    router.push(`${currentPath}?${newSearchParams.toString()}`);
  };

  // Determine trigger button text
  let triggerText = 'New Position';
  if (selectedPosition) {
    triggerText = `${selectedPosition.kind === 1 ? 'LP' : 'Trade'} #${
      selectedPosition.id
    }`;
  } else if (hasPositions) {
    // If positions exist but none selected (likely meaning "New Position" was chosen or default state)
    triggerText = 'New Position';
  }

  return (
    <div className="mb-6 space-y-1.5">
      <Label>Position</Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full flex items-center">
            <div className="flex items-center gap-2">
              {selectedPosition ? (
                <>
                  <span>#{selectedPosition.id.toString()}</span>
                  <Badge variant="outline">
                    {selectedPosition.kind === 1 ? 'Liquidity' : 'Trader'}
                  </Badge>
                </>
              ) : (
                <span>{triggerText}</span>
              )}
            </div>
            <ChevronDown className="ml-auto h-4 w-4 opacity-50 flex-shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
          <DropdownMenuItem onSelect={() => handleSelectPosition(null)}>
            New Position
          </DropdownMenuItem>

          {(traderPositionsArray.length > 0 || lpPositionsArray.length > 0) && (
            <DropdownMenuSeparator />
          )}

          {traderPositionsArray.map((pos) => (
            <DropdownMenuItem
              key={`trade-${pos.id}`}
              onSelect={() => handleSelectPosition(pos.id.toString())}
            >
              #{pos.id.toString()} <Badge variant="outline">Trader</Badge>
            </DropdownMenuItem>
          ))}

          {lpPositionsArray.map((pos) => (
            <DropdownMenuItem
              key={`lp-${pos.id}`}
              onSelect={() => handleSelectPosition(pos.id.toString())}
            >
              #{pos.id.toString()} <Badge variant="outline">Liquidity</Badge>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default PositionSelector;
