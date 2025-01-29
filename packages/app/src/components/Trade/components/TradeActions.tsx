import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from '~/components/ui/tooltip';
import { HIGH_PRICE_IMPACT } from '~/lib/constants/constants';

interface TradeActionsProps {
  isConnected: boolean;
  currentChainId: number;
  targetChainId: number;
  isEdit: boolean;
  pendingTxn: boolean;
  formError?: string;
  priceImpact: number;
  closePositionPriceImpact: number;
  sizeChangeInContractUnit: bigint;
  desiredSizeInContractUnit: bigint;
  fetchingSizeFromCollateralInput: boolean;
  isLoadingCollateralChange: boolean;
  isNonZeroSizeChange: boolean;
  requireApproval: boolean;
  collateralAssetTicker: string;
  isGeneratingQuote: boolean;
  onConnectWallet: () => void;
  onSwitchNetwork: () => void;
  setValue: (key: string, value: any) => void;
}

export function TradeActions({
  isConnected,
  currentChainId,
  targetChainId,
  isEdit,
  pendingTxn,
  formError,
  priceImpact,
  closePositionPriceImpact,
  sizeChangeInContractUnit,
  desiredSizeInContractUnit,
  fetchingSizeFromCollateralInput,
  isLoadingCollateralChange,
  isNonZeroSizeChange,
  requireApproval,
  collateralAssetTicker,
  isGeneratingQuote,
  onConnectWallet,
  onSwitchNetwork,
  setValue,
}: TradeActionsProps) {

  // Helper function to render price impact warning for trades
  const renderPriceImpactWarningForTrade = () => {
    if (priceImpact === 0) return null;
    
    return (
      <div className="flex justify-center mt-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <div className={`flex items-center ${priceImpact > HIGH_PRICE_IMPACT ? 'text-red-500' : 'text-yellow-500'}`}>
                <AlertTriangle className="w-5 h-5 mr-1" />
                <span className="text-sm font-medium">
                  {Number(priceImpact.toFixed(2))}% Price Impact
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-sm font-medium">
                This trade will have a {Number(priceImpact.toFixed(2))}% price impact
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  };

  // Helper function to render price impact warning for closing positions
  const renderPriceImpactWarningForClose = () => {
    if (closePositionPriceImpact === 0) return null;
    
    return (
      <div className="flex justify-center mt-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <div className={`flex items-center ${closePositionPriceImpact > HIGH_PRICE_IMPACT ? 'text-red-500' : 'text-yellow-500'}`}>
                <AlertTriangle className="w-5 h-5 mr-1" />
                <span className="text-sm font-medium">
                  {Number(closePositionPriceImpact.toFixed(2))}% Price Impact
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-sm font-medium">
                Closing this position will have a {Number(closePositionPriceImpact.toFixed(2))}% price impact
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  };

  // Helper function to determine button text
  const getButtonText = () => {
    if (isGeneratingQuote && !formError) return 'Generating Quote...';
    if (fetchingSizeFromCollateralInput) return 'Generating Quote....';
    if (requireApproval) return `Approve ${collateralAssetTicker} Transfer`;
    if (desiredSizeInContractUnit === BigInt(0) && isNonZeroSizeChange) return 'Close Position';
    return isEdit ? 'Update Position' : 'Create Position';
  };

  // Render the main action button
  const renderActionButton = () => {
    if (!isConnected) {
      return (
        <Button
          className="w-full mb-4"
          size="lg"
          onClick={onConnectWallet}
        >
          Connect Wallet
        </Button>
      );
    }

    if (currentChainId !== targetChainId) {
      return (
        <Button
          className="w-full mb-4"
          variant="default"
          size="lg"
          onClick={onSwitchNetwork}
        >
          Switch Network
        </Button>
      );
    }

    const isLoading =
      pendingTxn ||
      fetchingSizeFromCollateralInput ||
      isLoadingCollateralChange ||
      (isNonZeroSizeChange && isGeneratingQuote);

    return (
      <div className="mb-4">
        <Button
          className="w-full"
          variant="default"
          type="submit"
          disabled={!!formError || isLoading || sizeChangeInContractUnit === BigInt(0)}
          size="lg"
        >
          {isLoading && !formError ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : null}
          {getButtonText()}
        </Button>
        {renderPriceImpactWarningForTrade()}
      </div>
    );
  };

  // Render the close position button
  const renderCloseButton = () => {
    if (!isEdit || !isConnected || currentChainId !== targetChainId) return null;

    const isLoading =
      pendingTxn ||
      fetchingSizeFromCollateralInput ||
      isLoadingCollateralChange ||
      (isNonZeroSizeChange && isGeneratingQuote);

    let buttonText = 'Close Position';
    if (requireApproval) {
      buttonText = `Approve ${collateralAssetTicker} Transfer To Close Position`;
    }

    if (isGeneratingQuote && !formError) return null;
    if (fetchingSizeFromCollateralInput) return null;

    return (
      <div className="mb-4 text-center -mt-2">
        <button
          onClick={() => setValue('isClosePosition', true)}
          className="text-sm underline hover:opacity-80 disabled:opacity-50"
          type="submit"
          disabled={!!formError || isLoading}
        >
          {buttonText}
        </button>
        {renderPriceImpactWarningForClose()}
      </div>
    );
  };

  return (
    <>
      {renderActionButton()}
      {renderCloseButton()}
    </>
  );
}