'use client';

import { ArrowUpDownIcon } from '@chakra-ui/icons';
import {
  Box,
  FormControl,
  FormLabel,
  Input,
  InputGroup,
  InputRightAddon,
  Button,
  FormErrorMessage,
} from '@chakra-ui/react';
import Quoter from '@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json';
import type { Dispatch, SetStateAction } from 'react';
import { useContext, useEffect, useMemo, useState } from 'react';
import type { ReadContractErrorType } from 'viem';
import { formatUnits, parseUnits } from 'viem';
import { useReadContract } from 'wagmi';

import { MarketContext } from '../../context/MarketProvider';
import { DECIMAL_PRECISION_DISPLAY } from '~/lib/constants/constants';
import type { FoilPosition } from '~/lib/interfaces/interfaces';

interface Props {
  nftId: number;
  setSize: Dispatch<SetStateAction<number>>;
  positionData: FoilPosition;
  originalPositionSize: number;
  isLong: boolean;
  error?: string;
}

const SizeInput: React.FC<Props> = ({
  nftId,
  setSize,
  positionData,
  originalPositionSize,
  isLong,
  error,
}) => {
  const {
    collateralAssetTicker,
    pool,
    epochParams,
    collateralAssetDecimals,
    chainId,
  } = useContext(MarketContext);
  const [collateralChange, setCollateralChange] = useState<number>(0);
  const [sizeChange, setSizeChange] = useState<number>(0);
  const [collateralInput, setCollateralInput] = useState<string>('0');
  const [sizeInput, setSizeInput] = useState<string>('');
  const [isGgasInput, setIsGgasInput] = useState(true);

  const refPrice = pool?.token0Price.toSignificant(3);
  const isEdit = nftId > 0;

  useEffect(() => {
    handleSizeChange('0');
  }, [nftId, positionData]);

  useEffect(() => {
    handleSizeChange(sizeInput);
  }, [isLong]);

  const handleUpdateInputType = () => setIsGgasInput(!isGgasInput);

  const longQuoteArgs = [
    pool?.token1.address, // tokenIn -> GWeiToken/QuoteToken
    pool?.token0.address, // tokenOut -> GasToken/BaseToken
    pool?.fee,
    parseUnits(`${sizeChange}`, collateralAssetDecimals),
    0,
  ];
  const shortQuoteArgs = [
    pool?.token0.address, // tokenIn -> GasToken/BaseToken
    pool?.token1.address, // tokenOut -> GWeiToken/QuoteToken
    pool?.fee,
    parseUnits(`${sizeChange}`, collateralAssetDecimals),
    0,
  ];
  const quoteArgs = isLong ? longQuoteArgs : shortQuoteArgs;

  const { data: quotePriceData } = useReadContract({
    abi: Quoter.abi,
    address: epochParams.uniswapQuoter,
    functionName: isLong ? 'quoteExactOutputSingle' : 'quoteExactInputSingle',
    args: quoteArgs,
    chainId,
    // Enable the query when sizeChange is a number (including 0) and pool is available
    query: {
      enabled: sizeChange !== null && sizeChange >= 0 && !!pool,
    },
  }) as { data: bigint | undefined; error: ReadContractErrorType | null };

  const formattedQuotePrice = useMemo(() => {
    if (!quotePriceData) return '';
    const rawNumber = formatUnits(quotePriceData, collateralAssetDecimals);
    return Number(rawNumber).toFixed(DECIMAL_PRECISION_DISPLAY);
  }, [quotePriceData, collateralAssetDecimals]);

  /**
   * Update size and collateralChange based on the new size input
   * @param newVal - new value of the size input
   */
  const handleSizeChange = (newVal: string) => {
    if (!refPrice) return;
    const numberPattern = /^(0|[1-9][0-9]*)(\.[0-9]*)?$|^$/;

    if (newVal === '') {
      // Allow empty input
      setSizeInput('');
      setSizeChange(0);
      setSize(originalPositionSize);
      setCollateralChange(0);
      setCollateralInput('');
      return;
    }

    if (!numberPattern.test(newVal)) {
      // Invalid input, do not update state
      return;
    }

    setSizeInput(newVal);
    const newSizeChange = parseFloat(newVal);
    setSizeChange(newSizeChange);
    const sign = isLong ? 1 : -1;
    setSize(originalPositionSize + sign * newSizeChange);
    const newCollateral = newSizeChange / Number(refPrice);
    setCollateralChange(newCollateral);
    setCollateralInput(newCollateral.toString());
  };

  /**
   * Update size and collateralChange based on the new collateralChange input
   * @param newVal - new value of the collateralChange input
   */
  const handleCollateralChange = (newVal: string) => {
    if (!refPrice) return;
    const numberPattern = /^(0|[1-9][0-9]*)(\.[0-9]*)?$/;

    if (newVal === '') {
      // Allow empty input
      setCollateralInput('');
      setCollateralChange(0);
      setSize(originalPositionSize);
      setSizeChange(0);
      setSizeInput('');
      return;
    }

    if (!numberPattern.test(newVal)) {
      // Invalid input, do not update state
      return;
    }

    setCollateralInput(newVal);
    const newCollateral = parseFloat(newVal);
    setCollateralChange(newCollateral);
    const newSizeChange = newCollateral * Number(refPrice);
    setSizeChange(newSizeChange);
    const sign = isLong ? 1 : -1;
    setSize(originalPositionSize + sign * newSizeChange);
    setSizeInput(newSizeChange.toString());
  };

  return (
    <Box mb={4}>
      <FormControl mb={4} isInvalid={!!error}>
        <FormLabel>Size {isEdit ? 'Change' : ''}</FormLabel>
        <InputGroup>
          <Input
            borderRight="none"
            value={isGgasInput ? sizeInput : collateralInput}
            type="text"
            min={0}
            step="any"
            onWheel={(e) => e.currentTarget.blur()}
            onChange={(e) =>
              isGgasInput
                ? handleSizeChange(e.target.value)
                : handleCollateralChange(e.target.value)
            }
          />
          <InputRightAddon bg="none">
            <Button
              px={3}
              h="1.75rem"
              size="sm"
              onClick={handleUpdateInputType}
              rightIcon={<ArrowUpDownIcon h={2.5} />}
            >
              {isGgasInput ? 'Ggas' : collateralAssetTicker}
            </Button>
          </InputRightAddon>
        </InputGroup>
        {error && <FormErrorMessage>{error}</FormErrorMessage>}
      </FormControl>
      <FormControl>
        <InputGroup>
          <Input
            readOnly
            value={isGgasInput ? collateralChange : sizeChange}
            bg="blackAlpha.50"
            type="number"
          />
          <InputRightAddon>
            {isGgasInput ? collateralAssetTicker : 'Ggas'}
          </InputRightAddon>
        </InputGroup>
      </FormControl>
    </Box>
  );
};

export default SizeInput;
