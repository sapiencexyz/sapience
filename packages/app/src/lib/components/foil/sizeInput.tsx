'use client';

import { ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';

import { Button } from '~/components/ui/button';
import { FormItem, FormLabel } from '~/components/ui/form';
import { Input } from '~/components/ui/input';
import type { FoilPosition } from '~/lib/interfaces/interfaces';

interface Props {
  nftId?: number;
  setSize: Dispatch<SetStateAction<bigint>>;
  size?: bigint;
  positionData?: FoilPosition;
  isLong?: boolean;
  error?: string;
  label?: string;
  defaultToGas?: boolean;
  allowCollateralInput?: boolean;
  collateralAssetTicker?: string;
  onCollateralAmountChange?: (amount: bigint) => void;
}

const SizeInput: React.FC<Props> = ({
  nftId,
  setSize,
  size = BigInt(0),
  positionData,
  isLong = true,
  error,
  label = 'Size',
  defaultToGas = true,
  allowCollateralInput = false,
  collateralAssetTicker = '',
  onCollateralAmountChange,
}) => {
  const [sizeInput, setSizeInput] = useState<string>('0');
  const [isGasInput, setIsGasInput] = useState(defaultToGas);
  const [inputType, setInputType] = useState<'gas' | 'Ggas' | 'collateral'>(
    defaultToGas ? 'gas' : 'Ggas'
  );

  useEffect(() => {
    handleSizeChange('0');
  }, [nftId, positionData]);

  useEffect(() => {
    handleSizeChange(sizeInput);
  }, [isLong]);

  useEffect(() => {
    if (size === BigInt(0)) {
      setSizeInput('0');
      return;
    }

    const absoluteSize = size < 0 ? -size : size;
    const numberValue = isGasInput
      ? absoluteSize.toString()
      : (Number(absoluteSize) / 1e9).toString();

    setSizeInput(numberValue);
  }, [size, isGasInput]);

  const getNextInputType = (
    currentType: 'gas' | 'Ggas' | 'collateral'
  ): 'gas' | 'Ggas' | 'collateral' => {
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
    value: number,
    fromType: string,
    toType: string
  ): number => {
    if (fromType === 'gas' && toType === 'Ggas') return value / 1e9;
    if (fromType === 'Ggas' && toType === 'gas') return value * 1e9;
    return 0; // Reset value when switching to/from collateral
  };

  const handleUpdateInputType = () => {
    const newType = getNextInputType(inputType);
    setInputType(newType);

    if (sizeInput === '') return;

    const currentValue = parseFloat(sizeInput);
    const newValue = convertValue(currentValue, inputType, newType);
    const formattedValue = newValue.toLocaleString('fullwide', {
      useGrouping: false,
      maximumFractionDigits: 20,
    });
    if (newValue === 0) {
      handleSizeChange('0');
    }
    setSizeInput(formattedValue);
  };

  const processCollateralInput = (value: string) => {
    const collateralAmount = value === '' ? 0 : parseFloat(value);
    onCollateralAmountChange?.(BigInt(Math.floor(collateralAmount * 1e18)));
  };

  const processSizeInput = (value: string) => {
    const newSize = value === '' ? 0 : parseFloat(value);
    const sizeInGas =
      inputType === 'gas'
        ? BigInt(Math.floor(newSize))
        : BigInt(Math.floor(newSize * 1e9));
    const sign = isLong ? BigInt(1) : BigInt(-1);
    setSize(sign * sizeInGas);
  };

  const handleSizeChange = (newVal: string) => {
    const numberPattern = /^(0|[1-9]\d*)((\.|,)\d*)?$/;

    let processedVal = newVal;
    if (
      sizeInput === '0' &&
      newVal !== '0' &&
      newVal !== '0.' &&
      newVal !== '0,'
    ) {
      processedVal = newVal.replace(/^0+/, '');
    }

    if (processedVal === '' || numberPattern.test(processedVal)) {
      processedVal = processedVal.replace(/,/, '.');
      setSizeInput(processedVal);

      if (inputType === 'collateral') {
        processCollateralInput(processedVal);
      } else {
        processSizeInput(processedVal);
      }
    }
  };

  return (
    <div className="w-full">
      <FormItem>
        <FormLabel>
          {label} {nftId && nftId > 0 ? 'Change' : ''}
        </FormLabel>
        <div className="flex">
          <Input
            value={sizeInput}
            type="text"
            inputMode="decimal"
            min={0}
            step="any"
            onWheel={(e) => e.currentTarget.blur()}
            onChange={(e) => handleSizeChange(e.target.value)}
            className="rounded-r-none border-r-0"
          />
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
        </div>
        {error && (
          <p className="text-sm font-medium text-destructive mt-2">{error}</p>
        )}
      </FormItem>
    </div>
  );
};

export default SizeInput;
