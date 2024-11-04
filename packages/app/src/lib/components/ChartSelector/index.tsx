import { ChevronUp, ChevronDown, Check } from 'lucide-react';
import { useContext, useState } from 'react';
import type React from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { MarketContext } from '~/lib/context/MarketProvider';
import { ChartType } from '~/lib/interfaces/interfaces';

interface CustomDropdownProps {
  chartType: ChartType;
  setChartType: Dispatch<SetStateAction<ChartType>>;
}

const ChartSelector: React.FC<CustomDropdownProps> = ({
  chartType,
  setChartType,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { epochSettled } = useContext(MarketContext);

  const handleSelect = (option: ChartType) => {
    setChartType(option);
    setIsOpen(false);
  };

  const renderChartType = (option: ChartType) => {
    if (epochSettled && option === ChartType.LIQUIDITY) return null;
    return (
      <DropdownMenuItem
        key={option}
        onClick={() => handleSelect(option as ChartType)}
      >
        <div
          className={`flex items-center justify-between w-full font-${
            option === chartType ? 'bold' : 'normal'
          }`}
        >
          {option}
          {option === chartType && <Check className="h-4 w-4" />}
        </div>
      </DropdownMenuItem>
    );
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="rounded-full" size="sm">
          {chartType}
          {isOpen ? (
            <ChevronUp className="ml-2 h-4 w-4" />
          ) : (
            <ChevronDown className="ml-2 h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {Object.values(ChartType).map((option) => renderChartType(option))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ChartSelector;
