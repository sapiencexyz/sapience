import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@foil/ui/components/ui/tooltip';
import type React from 'react';

interface PositionDisplayProps {
  positionId: string | number;
  marketType?: 'yin' | 'yang';
}

const PositionDisplay: React.FC<PositionDisplayProps> = ({
  positionId,
  marketType,
}) => {
  return (
    <div className="flex items-center gap-1">
      <span>#{positionId}</span>
      {marketType && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`w-1 h-1 rounded-full ${
                  marketType === 'yin' ? 'bg-gray-300' : 'bg-gray-600'
                }`}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {marketType.charAt(0).toUpperCase() + marketType.slice(1)}{' '}
                Market Position
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
};

export default PositionDisplay;
