import { CandlestickChart, Circle, CircleDashed } from 'lucide-react';

import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';

import { GREEN_PRIMARY, BLUE, NEUTRAL } from './Chart';

interface PriceTogglesProps {
  seriesVisibility: {
    candles: boolean;
    index: boolean;
    resource: boolean;
    trailing: boolean;
  };
  toggleSeries: (series: 'candles' | 'index' | 'resource' | 'trailing') => void;
  seriesDisabled: {
    candles: boolean;
    index: boolean;
    resource: boolean;
    trailing: boolean;
  };
}

const PriceToggles = ({
  seriesVisibility,
  toggleSeries,
  seriesDisabled,
}: PriceTogglesProps) => {
  return (
    <ToggleGroup
      type="multiple"
      className="flex gap-3 items-start md:items-center self-start md:self-auto"
      variant="outline"
      value={Object.entries(seriesVisibility)
        .filter(([, isVisible]) => isVisible)
        .map(([key]) => key)}
    >
      <ToggleGroupItem
        value="candles"
        variant={seriesVisibility.candles ? 'default' : 'outline'}
        onClick={() => toggleSeries('candles')}
        disabled={seriesDisabled.candles}
      >
        <CandlestickChart className="w-3 h-3" color={NEUTRAL} />
        Market Price
      </ToggleGroupItem>
      <ToggleGroupItem
        value="index"
        variant={seriesVisibility.index ? 'default' : 'outline'}
        onClick={() => toggleSeries('index')}
        disabled={seriesDisabled.index}
      >
        <CircleDashed className="w-3 h-3" color={BLUE} strokeWidth={3} />
        Index Price
      </ToggleGroupItem>
      <ToggleGroupItem
        value="resource"
        variant={seriesVisibility.resource ? 'default' : 'outline'}
        onClick={() => toggleSeries('resource')}
        disabled={seriesDisabled.resource}
      >
        <Circle className="w-3 h-3" color={GREEN_PRIMARY} strokeWidth={3} />
        Resource Price
      </ToggleGroupItem>

      <ToggleGroupItem
        value="trailing"
        variant={seriesVisibility.trailing ? 'default' : 'outline'}
        onClick={() => toggleSeries('trailing')}
        disabled={seriesDisabled.trailing}
      >
        <Circle className="w-3 h-3" color={BLUE} strokeWidth={3} />
        Trailing Avg. Price
      </ToggleGroupItem>
    </ToggleGroup>
  );
};

export default PriceToggles;
