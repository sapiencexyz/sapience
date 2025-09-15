import dynamic from 'next/dynamic';

import columns from './columns';
import DataTable from './data-table';
import { useEnrichedMarketGroups } from '~/hooks/graphql/useMarketGroups';

const LottieLoader = dynamic(() => import('~/components/shared/LottieLoader'), {
  ssr: false,
  loading: () => <div className="w-8 h-8" />,
});

const LiquidTab = () => {
  const { data: marketGroups, isLoading, error } = useEnrichedMarketGroups();

  const sortedMarketGroups = marketGroups
    ? [...marketGroups].sort((a, b) => Number(b.id) - Number(a.id))
    : [];

  return (
    <div>
      {isLoading && (
        <div className="flex justify-center items-center py-8">
          <LottieLoader width={32} height={32} />
        </div>
      )}
      {error && (
        <p className="text-red-500">Error loading markets: {error.message}</p>
      )}
      {sortedMarketGroups && sortedMarketGroups.length > 0 ? (
        <>
          <DataTable columns={columns} data={sortedMarketGroups} />
        </>
      ) : (
        !isLoading && <p>No active market groups found.</p>
      )}
    </div>
  );
};

export default LiquidTab;
