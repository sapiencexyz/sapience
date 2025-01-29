import Image from 'next/image';

import type { Resource } from '~/lib/hooks/useResources';

import EpochTiming from './EpochTiming';

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
          width={20}
          height={20}
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
