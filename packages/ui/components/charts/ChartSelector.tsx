import { ChartType } from '../../types/charts';
import { Button } from '../ui/button';

interface ChartSelectorProps {
  chartType: ChartType;
  setChartType: (type: ChartType) => void;
  isTrade?: boolean;
}

export const ChartSelector = ({
  chartType,
  setChartType,
  isTrade = false,
}: ChartSelectorProps) => {
  return (
    <div className="flex gap-2">
      {isTrade && (
        <Button
          variant={chartType === ChartType.PRICE ? 'default' : 'outline'}
          size="sm"
          onClick={() => setChartType(ChartType.PRICE)}
        >
          Price
        </Button>
      )}
      <Button
        variant={chartType === ChartType.VOLUME ? 'default' : 'outline'}
        size="sm"
        onClick={() => setChartType(ChartType.VOLUME)}
      >
        Volume
      </Button>
      <Button
        variant={chartType === ChartType.LIQUIDITY ? 'default' : 'outline'}
        size="sm"
        onClick={() => setChartType(ChartType.LIQUIDITY)}
      >
        Liquidity
      </Button>
    </div>
  );
};
