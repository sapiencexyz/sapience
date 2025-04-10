'use client';

import { Button } from '@foil/ui/components/ui/button';
import { FormItem, FormLabel } from '@foil/ui/components/ui/form';
import { Input } from '@foil/ui/components/ui/input';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';

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
  fixedUnit?: boolean;
}

enum InputFormType {
  Gas = 'gas',
  Ggas = 'Ggas',
  Collateral = 'collateral',
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
  fixedUnit = false,
}) => {
  let defaultInputType;
  if (fixedUnit) {
    defaultInputType = InputFormType.Collateral;
  } else {
    defaultInputType = defaultToGas ? InputFormType.Gas : InputFormType.Ggas;
  }

  const [sizeInput, setSizeInput] = useState<string>('0');
  const [inputType, setInputType] = useState<InputFormType>(defaultInputType);

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
    const numberValue =
      inputType === InputFormType.Gas
        ? absoluteSize.toString()
        : convertGasToGgas(absoluteSize.toString());

    setSizeInput(numberValue);
  }, [size]);

  const convertGasToGgas = (value: string) => {
    const integerPart: string = (BigInt(value) / BigInt(1e9)).toString();
    // decimal part = prefix of zeros if gas is < 10^9, then the useful decimals
    if (BigInt(value) % BigInt(1e9) !== BigInt(0)) {
      const decimalPart: string =
        '0'.repeat(
          Math.max(9 - (BigInt(value) % BigInt(1e9)).toString().length, 0)
        ) + (BigInt(value) % BigInt(1e9)).toString().replace(/0+$/, '');
      return `${integerPart}.${decimalPart}`;
    }
    return integerPart;
  };

  const convertGgasToGas = (value: string) => {
    // case when we have decimals
    if (value.indexOf('.') > -1) {
      const [integerPart, decimalPart]: string[] = value.split('.');
      // console.log(`Integer part: ${integerPart}, decimal part: ${decimalPart}`);
      return (
        BigInt(integerPart) * BigInt(1e9) +
        BigInt(decimalPart) * BigInt(10 ** (9 - decimalPart.length))
      ).toString();
    } // else if the whole number is an integer
    return (BigInt(value) * BigInt(1e9)).toString();
  };

  const getNextInputType = (currentType: InputFormType): InputFormType => {
    if (allowCollateralInput) {
      const mapping: Record<InputFormType, InputFormType> = {
        gas: InputFormType.Ggas,
        Ggas: InputFormType.Collateral,
        collateral: InputFormType.Gas,
      } as const;
      return mapping[currentType];
    }
    return currentType === InputFormType.Gas
      ? InputFormType.Ggas
      : InputFormType.Gas;
  };

  const convertValue = (
    value: string,
    fromType: string,
    toType: string
  ): string => {
    if (fromType === InputFormType.Gas && toType === InputFormType.Ggas)
      return convertGasToGgas(value);
    if (fromType === InputFormType.Ggas && toType === InputFormType.Gas)
      return convertGgasToGas(value);
    return '0'; // Reset value when switching to/from collateral
  };

  const handleUpdateInputType = () => {
    const newType = getNextInputType(inputType);
    setInputType(newType);

    if (sizeInput === '') return;

    const newValue = convertValue(sizeInput, inputType, newType);
    // const formattedValue = newValue.toLocaleString('fullwide', {
    //   useGrouping: false,
    //   maximumFractionDigits: 20,
    // });
    if (newValue === '0') {
      handleSizeChange('0');
    }
    setSizeInput(newValue);
  };

  const processCollateralInput = (value: string) => {
    const collateralAmount = value === '' ? 0 : parseFloat(value);
    // TODO (Vlad): onCollateralAmountChange is undefined when passed in component; is something wrong here?
    onCollateralAmountChange?.(BigInt(Math.floor(collateralAmount * 1e18)));
  };

  const processSizeInput = (value: string) => {
    let sizeInGas: bigint;
    if (value === '') sizeInGas = BigInt(0);
    else if (inputType === InputFormType.Ggas)
      sizeInGas = BigInt(convertGgasToGas(value));
    else sizeInGas = BigInt(value); // if (inputType === InputFormType.Gas)

    setSize(sizeInGas);
  };

  const handleSizeChange = (newVal: string) => {
    const isUserInputValid: Record<InputFormType, (value: string) => boolean> =
      {
        gas: (value: string) => {
          const numberPatternGas = /^(0|[1-9]\d*)$/; // gas can never be a float
          return numberPatternGas.test(value);
        },
        Ggas: (value: string) => {
          const numberPatternGGas = /^(0|[1-9]\d*)?((\.|,)(\d{0,9}))?$/; // giga = 10^9
          return numberPatternGGas.test(value);
        },
        collateral: (value: string) => {
          const numberPatternCollateral = /^(0|[1-9]\d*)?((\.|,)(\d{0,18}))?$/; // assuming collateral has 18 decimals
          return numberPatternCollateral.test(value);
        },
      };

    let processedVal = newVal;
    if (processedVal[0] === '.') {
      processedVal = `0${processedVal}`;
    }
    if (
      sizeInput === '0' &&
      newVal !== '0' &&
      newVal !== '0.' &&
      newVal !== '0,'
    ) {
      processedVal = newVal.replace(/^0+/, '');
    }

    if (processedVal === '' || isUserInputValid[inputType](processedVal)) {
      // console.log(processedVal, inputType)
      // case when we switch gas <-> GGas and the input is 0. -> useEffect is NOT triggered, hence need this setState
      processedVal = processedVal.replace(/,/, '.');
      setSizeInput(processedVal);

      if (inputType === 'collateral') {
        processCollateralInput(processedVal);
      } else {
        processSizeInput(processedVal);
      }
    } else {
      // console.log("Bad input!", inputType, processedVal)
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
            onClick={() => !fixedUnit && handleUpdateInputType()}
          >
            {inputType === 'collateral' ? collateralAssetTicker : inputType}
            {!fixedUnit && (
              <span className="flex flex-col scale-75">
                <ChevronUp className="h-1 w-1 translate-y-1/4" />
                <ChevronDown className="h-1 w-1 -translate-y-1/4" />
              </span>
            )}
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
