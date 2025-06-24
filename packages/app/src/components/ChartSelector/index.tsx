import { Button } from '@sapience/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@sapience/ui/components/ui/dropdown-menu';
import { ChevronUp, ChevronDown, Check } from 'lucide-react';
import { useContext, useState } from 'react';
import type React from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { PeriodContext } from '~/lib/context/PeriodProvider';
import { ChartType } from '~/lib/interfaces/interfaces';

interface CustomDropdownProps {
  chartType: ChartType;
  setChartType: Dispatch<SetStateAction<ChartType>>;
  isTrade?: boolean;
}

const ChartSelector: React.FC<CustomDropdownProps> = ({
  chartType,
  setChartType,
  isTrade = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { marketSettled } = useContext(PeriodContext);

  const handleSelect = (option: ChartType) => {
    setChartType(option);
    setIsOpen(false);
  };

  const getChartOptions = () => {
    if (isTrade) {
      return [ChartType.PRICE, ChartType.LIQUIDITY, ChartType.VOLUME];
    }
    return [ChartType.LIQUIDITY, ChartType.PRICE, ChartType.VOLUME];
  };

  const renderChartType = (option: ChartType) => {
    if (marketSettled && option === ChartType.LIQUIDITY) return null;

    // For trade pages, show "Depth Chart" instead of "Liquidity"
    const displayText =
      isTrade && option === ChartType.LIQUIDITY ? 'Depth Chart' : option;

    return (
      <DropdownMenuItem key={option} onClick={() => handleSelect(option)}>
        <div
          className={`flex items-center justify-between w-full font-${
            option === chartType ? 'bold' : 'normal'
          }`}
        >
          {displayText}
          {option === chartType && <Check className="h-4 w-4" />}
        </div>
      </DropdownMenuItem>
    );
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="rounded-sm">
          {isTrade && chartType === ChartType.LIQUIDITY
            ? 'Depth Chart'
            : chartType}
          {isOpen ? (
            <ChevronUp className="ml-1 h-4 w-4" />
          ) : (
            <ChevronDown className="ml-1 h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top">
        {getChartOptions().map((option) => renderChartType(option))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ChartSelector;
