import type React from 'react';
import { useAccount } from 'wagmi';

import { useConnectWallet } from '~/lib/context/ConnectWalletProvider';
import { useForecast } from '~/lib/context/ForecastProvider';

import { TradeForm } from './forms';

const SimpleTradeWrapper: React.FC = () => {
  const { isConnected } = useAccount();
  const { setIsOpen } = useConnectWallet();

  // Get data from the forecast context
  const {
    collateralAssetTicker,
    marketAddress,
    numericMarketId,
    chainId,
    abi,
    collateralAssetAddress,
    // baseTokenName, // Example: Add if needed by TradeForm or handlers
    // quoteTokenName, // Example: Add if needed by TradeForm or handlers
    // marketContractData, // Example: Add if needed for contract calls
  } = useForecast();

  const handleConnectWallet = () => {
    setIsOpen(true);
  };

  // Handle successful transaction submission
  const handleSuccess = (txHash: `0x${string}`) => {
    console.log('Trade transaction submitted, txHash:', txHash);
    // Toast is likely handled within the form/hook now
    // toast({ title: 'Trade Submitted', description: `Transaction: ${txHash}` });
  };

  return (
    <div className="h-full">
      <TradeForm
        marketDetails={{
          marketAddress: marketAddress as `0x${string}`,
          numericMarketId: numericMarketId as number,
          chainId: chainId as number,
          marketAbi: abi,
          collateralAssetTicker,
          collateralAssetAddress: collateralAssetAddress as
            | `0x${string}`
            | undefined,
        }}
        isConnected={isConnected}
        onConnectWallet={handleConnectWallet}
        onSuccess={handleSuccess}
        // Remove props handled internally by the new form/hooks:
        // onTradeSubmit={...}
        // getEstimatedCost={...}
        // collateralAssetTicker={...} // Passed via marketDetails
        // isLoading={...} // Handled by useCreateTrade hook
        // isApproving={...} // Handled by useCreateTrade hook
        // needsApproval={...} // Handled by useCreateTrade hook
        // submitError={...} // Handled by useCreateTrade hook
      />
    </div>
  );
};

export default SimpleTradeWrapper;
