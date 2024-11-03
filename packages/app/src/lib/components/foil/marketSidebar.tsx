import { useSearchParams } from 'next/navigation';
import { useContext, useEffect } from 'react';

import { useAddEditPosition } from '~/lib/context/AddEditPositionContext';
import { MarketContext } from '~/lib/context/MarketProvider';

import AddEditLiquidity from './Liquidity/AddEditLiquidity';
import Settle from './settle';
import TraderPosition from './traderPosition';

export default function MarketSidebar({ isTrade }: { isTrade: boolean }) {
  const { endTime } = useContext(MarketContext);
  const expired = endTime < Math.floor(Date.now() / 1000);
  const { setNftId } = useAddEditPosition();
  const searchParams = useSearchParams();

  useEffect(() => {
    const positionId = searchParams.get('positionId');
    if (positionId) {
      setNftId(Number(positionId));
    }
  }, [searchParams, setNftId]);

  if (endTime === 0) {
    return (
      <div className="h-full border border-gray-300 rounded-md w-full flex-1 flex flex-col">
        <div className="h-full flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-400 opacity-50" />
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (expired) {
      return <Settle />;
    }
    if (isTrade) {
      return <TraderPosition />;
    }
    return <AddEditLiquidity />;
  };

  return (
    <div className="h-full border border-border rounded-md w-full flex-1 flex flex-col p-6 overflow-y-auto shadow-sm">
      {renderContent()}
    </div>
  );
}
