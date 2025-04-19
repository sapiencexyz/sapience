import type { TradeFormValues } from '@foil/ui';
import { TradeForm } from '@foil/ui';
import { useToast } from '@foil/ui/hooks/use-toast';
import type React from 'react';

const SimpleTradeWrapper: React.FC = () => {
  const { toast } = useToast();

  const handleTradeSubmit = (data: TradeFormValues) => {
    // In a real implementation, you would handle the trade logic here
    // For example, call your contract functions

    toast({
      title: 'Trade submitted',
      description: `Size: ${data.size}, Direction: ${data.direction}, Slippage: ${data.slippage}%`,
    });
  };

  return (
    <div className="h-full">
      <TradeForm
        onTradeSubmit={handleTradeSubmit}
        collateralAssetTicker="sUSDS"
      />
    </div>
  );
};

export default SimpleTradeWrapper;
