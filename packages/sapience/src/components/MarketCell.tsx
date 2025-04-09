import Image from 'next/image';

import EpochTiming from './EpochTiming';

import type { Resource } from '@foil/ui/hooks/useResources';

interface MarketCellProps {
  marketName: string;
  resourceSlug?: string;
  startTimestamp?: number;
  endTimestamp?: number;
  resources?: Resource[];
}

const MarketCell = ({
  marketName,
  resourceSlug,
  startTimestamp,
  endTimestamp,
  resources,
}: MarketCellProps) => {
  const resource = resources?.find((r) => r.slug === resourceSlug);

  return (
    <div className="flex gap-4">
      {resource?.iconPath && (
        <Image
          src={resource.iconPath}
          alt={marketName}
          width={32}
          height={32}
          className=" "
        />
      )}
      <div className="flex flex-col gap-0.5">
        <div className="font-medium whitespace-nowrap">{marketName}</div>
        {startTimestamp && endTimestamp && (
          <EpochTiming
            startTimestamp={startTimestamp}
            endTimestamp={endTimestamp}
          />
        )}
      </div>
    </div>
  );
};

export default MarketCell;
