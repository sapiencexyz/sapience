/* eslint-disable sonarjs/cognitive-complexity */

'use client';

import { debounce } from 'lodash';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useCallback, useContext, useEffect, useMemo } from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import { formatUnits, zeroAddress } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';

import { Button } from '~/components/ui/button';
import { FormItem, FormLabel } from '~/components/ui/form';
import { Input } from '~/components/ui/input';
import { MarketContext } from '~/lib/context/MarketProvider';
import type { FoilPosition } from '~/lib/interfaces/interfaces';
import { removeLeadingZeros } from '~/lib/util/util';
import { cn } from '~/lib/utils';

interface Props {
  minInputValue: number;
  nftId: number;
  positionData?: FoilPosition;
  isLong?: boolean;
  allowCollateralInput?: boolean;
  error?: string;
}

export type TradeUnits = 'gas' | 'Ggas' | 'collateral';

export const getMin = (inputType: string) => {
  if (inputType === 'collateral') return 0;
  if (inputType === 'Ggas') return 1e-9;
  return 1;
};

const TradeSizeInput: React.FC<Props> = ({
  minInputValue,
  nftId,
  isLong = true,
  allowCollateralInput = false,
  error,
}) => {
  const {
    foilData,
    address: marketAddress,
    epoch,
    collateralAssetTicker,
  } = useContext(MarketContext);
  const { setValue, control } = useFormContext();
  const {
    field: { onChange, value, onBlur },
  } = useController({
    name: 'sizeCollateralInput',
    control,
  });

  // form values
  const sizeCollateralInput: string = useWatch({
    control,
    name: 'sizeCollateralInput',
  });
  const size: bigint = useWatch({
    control,
    name: 'size',
  });
  const inputType: TradeUnits = useWatch({
    control,
    name: 'inputType',
  });

  const publicClient = usePublicClient();
  const account = useAccount();
  const { address } = account;
  const isEdit = Boolean(nftId && nftId > 0);

  useEffect(() => {
    setValue('size', BigInt(-1) * size);
  }, [isLong]);

  const getNextInputType = (currentType: TradeUnits): TradeUnits => {
    if (allowCollateralInput) {
      const mapping = {
        gas: 'Ggas',
        Ggas: 'collateral',
        collateral: 'gas',
      } as const;
      return mapping[currentType];
    }
    return currentType === 'gas' ? 'Ggas' : 'gas';
  };

  const convertValue = (
    currValue: number,
    fromType: string,
    toType: string
  ): number => {
    if (fromType === 'gas' && toType === 'Ggas') return currValue / 1e9;
    if (fromType === 'Ggas' && toType === 'gas') return currValue * 1e9;
    return 0; // Reset value when switching to/from collateral
  };

  const handleUpdateInputType = () => {
    const newType = getNextInputType(inputType);
    setValue('inputType', newType);

    if (sizeCollateralInput === '') return;

    const currentValue = parseFloat(sizeCollateralInput);
    const newValue: number = convertValue(currentValue, inputType, newType);
    if (newValue === 0) {
      setValue('size', BigInt(0));
      setValue('sizeCollateralInput', '');
    } else {
      onChange(newValue.toString());
      updateSize(newValue, newType);
    }
  };

  const processInput = (inputValue: string) => {
    const processed = removeLeadingZeros(inputValue);
    onChange(processed);
    const newInputValue: number = processed === '' ? 0 : parseFloat(processed);
    if (inputType === 'collateral') {
      const collateralInput = BigInt(Math.floor(newInputValue * 1e18));
      debouncedFindSize(collateralInput);
    } else {
      updateSize(newInputValue);
    }
  };

  const updateSize = (newInputValue: number, newType?: TradeUnits) => {
    const newInputType = newType || inputType;
    const sizeInGas =
      newInputType === 'gas'
        ? BigInt(Math.floor(newInputValue))
        : BigInt(Math.floor(newInputValue * 1e9));
    const sign = isLong ? BigInt(1) : BigInt(-1);
    setValue('size', sign * sizeInGas, { shouldValidate: true });
  };

  const findSizeForCollateral = async (collateralInput: bigint) => {
    if (!collateralInput || collateralInput === BigInt(0)) return;

    // Start with an initial guess based on current price
    const targetCollateral = collateralInput;
    let currentSize = BigInt(0);
    let bestSize = BigInt(0);
    let bestDiff = targetCollateral;
    let iterations = 0;
    const maxIterations = 10;

    // Binary search parameters
    let low = BigInt(0);
    let high = (targetCollateral * BigInt(2)) / BigInt(1e9);
    setValue('fetchingSizeFromCollateralInput', true);
    while (low <= high && iterations < maxIterations) {
      currentSize = (low + high) / BigInt(2);
      const sizeInContractUnits =
        currentSize * BigInt(1e9) * (isLong ? BigInt(1) : BigInt(-1));

      try {
        // eslint-disable-next-line no-await-in-loop
        const result = await publicClient?.simulateContract({
          abi: foilData.abi,
          address: marketAddress as `0x${string}`,
          functionName: isEdit
            ? 'quoteModifyTraderPosition'
            : 'quoteCreateTraderPosition',
          args: isEdit
            ? [nftId, sizeInContractUnits]
            : [epoch || 1, sizeInContractUnits],
          account: address || zeroAddress,
        });
        if (!result?.result) break;

        console.log('result', result);
        const [quotedCollateral] = result.result;
        const quotedCollateralBigInt = BigInt(quotedCollateral.toString());
        const diff =
          quotedCollateralBigInt > targetCollateral
            ? quotedCollateralBigInt - targetCollateral
            : targetCollateral - quotedCollateralBigInt;

        if (diff < bestDiff) {
          bestDiff = diff;
          bestSize = currentSize;
        }

        if (quotedCollateralBigInt > targetCollateral) {
          high = currentSize - BigInt(1);
        } else {
          low = currentSize + BigInt(1);
        }
      } catch (e) {
        console.error('Error finding size for collateral', e);
        high = currentSize - BigInt(1);
      }

      iterations++;
    }
    console.log('bestSize', bestSize * BigInt(1e9)); // In Ggas
    // update value, bestSize is in Ggas
    setValue('size', bestSize * BigInt(1e9), {
      shouldValidate: true,
    });
    setValue('fetchingSizeFromCollateralInput', false);
  };
  // Create a memoized version of findSizeForCollateral
  const memoizedFindSize = useCallback(findSizeForCollateral, [
    publicClient,
    foilData.abi,
    marketAddress,
    isEdit,
    nftId,
    epoch,
    address,
    isLong,
    setValue,
  ]);

  // Create a debounced version of the function
  const debouncedFindSize = useMemo(
    () => debounce(memoizedFindSize, 500),
    [memoizedFindSize]
  );

  // Cleanup debounced function on unmount
  useEffect(() => {
    return () => {
      debouncedFindSize.cancel();
    };
  }, [debouncedFindSize]);

  return (
    <div className="w-full">
      ************
      <FormItem>
        <FormLabel>Size {isEdit ? 'Change' : ''}</FormLabel>
        <div className="flex">
          <Input
            id="sizeCollateralInput"
            type="number"
            inputMode="decimal"
            min={minInputValue}
            step="any"
            className={cn(
              '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
              ' border-r-0'
            )}
            value={value} // Controlled input
            onChange={(e) => processInput(e.target.value)}
            onBlur={(e) => {
              onBlur();
              if (e.target.value === '') {
                setValue('size', BigInt(0), {
                  shouldValidate: true,
                });
                onChange('0');
              }
            }}
            onWheel={(e) => e.currentTarget.blur()}
            endAdornment={
              <Button
                type="button"
                variant="secondary"
                className="rounded-l-none px-3 h-10 border border-border"
                onClick={handleUpdateInputType}
              >
                {inputType === 'collateral' ? collateralAssetTicker : inputType}

                <span className="flex flex-col scale-75">
                  <ChevronUp className="h-1 w-1 translate-y-1/4" />
                  <ChevronDown className="h-1 w-1 -translate-y-1/4" />
                </span>
              </Button>
            }
          />
        </div>

        {error && (
          <p className="text-sm font-medium text-destructive mt-2">{error}</p>
        )}
        <div>Size: {size.toString()}</div>
        <div>
          Size Formmatted:{' '}
          {inputType === 'Ggas' ? formatUnits(size, 9) : size.toString()}
        </div>
        <div>min size: {minInputValue}</div>
      </FormItem>
      ************
    </div>
  );
};

export default TradeSizeInput;
