import { HelpCircle } from 'lucide-react';
import { formatUnits } from 'viem';
import { TOKEN_DECIMALS } from '~/lib/constants/constants';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import NumberDisplay from '../../numberDisplay';
import PositionSelector from '../../positionSelector';
import type { FoilPosition } from '~/lib/interfaces/interfaces';

interface PositionInfoProps {
  isEdit: boolean;
  positionData?: FoilPosition;
  isConnected: boolean;
  isLoadingCollateralChange: boolean;
  sizeChange: bigint;
  quoteError: string | null;
  originalPositionSizeInContractUnit: bigint;
  desiredSizeInContractUnit: bigint;
  walletBalance: string;
  quotedResultingWalletBalance: string;
  walletBalanceLimit: bigint;
  positionCollateralLimit: bigint;
  resultingPositionCollateral: bigint;
  collateralAssetTicker: string;
  collateralAssetDecimals: number;
  quotedFillPrice?: bigint;
}

export function PositionInfo({
  isEdit,
  positionData,
  isConnected,
  isLoadingCollateralChange,
  sizeChange,
  quoteError,
  originalPositionSizeInContractUnit,
  desiredSizeInContractUnit,
  walletBalance,
  quotedResultingWalletBalance,
  walletBalanceLimit,
  positionCollateralLimit,
  resultingPositionCollateral,
  collateralAssetTicker,
  collateralAssetDecimals,
  quotedFillPrice,
}: PositionInfoProps) {
  // Render wallet balance information
  const renderWalletBalance = () => {
    if (!isLoadingCollateralChange && isConnected) {
      return (
        <div>
          <p className="text-sm font-semibold mb-0.5 flex items-center">
            Wallet Balance
            {sizeChange !== BigInt(0) && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="w-4 h-4 ml-1" />
                  </TooltipTrigger>
                  <TooltipContent>
                    Your slippage tolerance sets a maximum limit on how much
                    additional collateral Foil can use or the minimum amount of
                    collateral you will receive back, protecting you from
                    unexpected market changes between submitting and processing
                    your transaction.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </p>
          <p className="text-sm">
            <NumberDisplay value={walletBalance} /> {collateralAssetTicker}
            {sizeChange !== BigInt(0) && !quoteError && (
              <>
                {' '}
                → <NumberDisplay value={quotedResultingWalletBalance} />{' '}
                {collateralAssetTicker} (Min.{' '}
                <NumberDisplay
                  value={formatUnits(walletBalanceLimit, collateralAssetDecimals)}
                />{' '}
                {collateralAssetTicker})
              </>
            )}
          </p>
        </div>
      );
    }
    return null;
  };

  // Render position collateral information
  const renderPositionCollateral = () => {
    if (!isLoadingCollateralChange) {
      return (
        <div>
          <p className="text-sm font-semibold mb-0.5">Position Collateral</p>
          <p className="text-sm mb-0.5">
            <NumberDisplay
              value={formatUnits(
                positionData?.depositedCollateralAmount || BigInt(0),
                collateralAssetDecimals
              )}
            />{' '}
            {collateralAssetTicker}
            {sizeChange !== BigInt(0) && !quoteError && (
              <>
                {' '}
                →{' '}
                <NumberDisplay
                  value={formatUnits(
                    resultingPositionCollateral,
                    collateralAssetDecimals
                  )}
                />{' '}
                {collateralAssetTicker} (Max.{' '}
                <NumberDisplay
                  value={formatUnits(
                    positionCollateralLimit,
                    collateralAssetDecimals
                  )}
                />{' '}
                {collateralAssetTicker})
              </>
            )}
          </p>
        </div>
      );
    }
    return null;
  };

  // Render fill price information
  const renderFillPrice = () => {
    if (quotedFillPrice) {
      return (
        <div>
          <p className="text-sm font-semibold mb-0.5">Estimated Fill Price</p>
          <p className="text-sm mb-0.5">
            <NumberDisplay value={quotedFillPrice} /> Ggas/{collateralAssetTicker}
          </p>
        </div>
      );
    }
    return null;
  };

  // Render position size information
  const renderPositionSize = () => {
    if (isEdit) {
      return (
        <div>
          <p className="text-sm font-semibold mb-0.5">Position Size</p>
          <p className="text-sm mb-0.5">
            <NumberDisplay
              value={formatUnits(
                originalPositionSizeInContractUnit,
                TOKEN_DECIMALS
              )}
            />{' '}
            Ggas
            {sizeChange !== BigInt(0) && (
              <>
                {' '}
                →{' '}
                <NumberDisplay
                  value={formatUnits(desiredSizeInContractUnit, TOKEN_DECIMALS)}
                />{' '}
                Ggas
              </>
            )}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-2">
      <PositionSelector />
      {renderPositionSize()}
      {renderWalletBalance()}
      {renderPositionCollateral()}
      {renderFillPrice()}
    </div>
  );
}