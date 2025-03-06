import Image from 'next/image';
import { useContext } from 'react';

import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import { PeriodContext } from '~/lib/context/PeriodProvider';

interface PriceTogglesProps {
  seriesDisabled: {
    candles: boolean;
    index: boolean;
    resource: boolean;
    trailing: boolean;
  };
}

const PriceToggles = ({
  seriesDisabled,
}: PriceTogglesProps) => {
  const { seriesVisibility, setSeriesVisibility } = useContext(PeriodContext);
  console.log("seriesVisibility", seriesVisibility);
  const toggleSeries = (series: keyof typeof seriesVisibility) => {
    setSeriesVisibility({
      ...seriesVisibility,
      [series]: !seriesVisibility[series],
    });
  };

  return (
    <ToggleGroup
      type="multiple"
      className="flex gap-3 items-start md:items-center self-start md:self-auto"
      variant="outline"
      value={Object.entries(seriesVisibility ?? {})
        .filter(([, isVisible]) => isVisible)
        .map(([key]) => key)}
    >
      <ToggleGroupItem
        value="candles"
        variant={seriesVisibility?.candles ? 'default' : 'outline'}
        onClick={() => toggleSeries('candles')}
        disabled={seriesDisabled.candles}
      >
        <Image
          src="/priceicons/market.svg"
          alt="Market Price"
          width={16}
          height={16}
        />
        Market Price
      </ToggleGroupItem>
      <ToggleGroupItem
        value="index"
        variant={seriesVisibility?.index ? 'default' : 'outline'}
        onClick={() => toggleSeries('index')}
        disabled={seriesDisabled.index}
      >
        <Image
          src="/priceicons/index.svg"
          alt="Index Price"
          width={16}
          height={16}
        />
        Index Price
      </ToggleGroupItem>
      <ToggleGroupItem
        value="resource"
        variant={seriesVisibility?.resource ? 'default' : 'outline'}
        onClick={() => toggleSeries('resource')}
        disabled={seriesDisabled.resource}
      >
        <Image
          src="/priceicons/resource.svg"
          alt="Resource Price"
          width={16}
          height={16}
        />
        Resource Price
      </ToggleGroupItem>

      <ToggleGroupItem
        value="trailing"
        variant={seriesVisibility?.trailing ? 'default' : 'outline'}
        onClick={() => toggleSeries('trailing')}
        disabled={seriesDisabled.trailing}
      >
        <Image
          src="/priceicons/average.svg"
          alt="Trailing Average Price"
          width={16}
          height={16}
        />
        Trailing Avg. Price
      </ToggleGroupItem>
    </ToggleGroup>
  );
};

export default PriceToggles;
