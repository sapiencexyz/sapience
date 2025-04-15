import React, { useState, useEffect } from 'react';
import { LiquidityFormValues, useLiquidityForm } from '../hooks/useLiquidityForm';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { SlippageTolerance } from './SlippageTolerance';
import { NumberDisplay } from './NumberDisplay';
// import { useReadContract } from 'wagmi';
// import { parseUnits } from 'viem';
// import { TickMath } from '@uniswap/v3-sdk';
// import { useUniswapPool } from '../hooks/useUniswapPool';
import { useCollateralInfo } from '../hooks/useCollateralInfo';
import { useFoilAbi } from '../hooks/useFoilAbi';
import { useMarketInfo } from '../hooks/useMarketInfo';

export interface MarketProps {
  epochId: number;
  chainId: number;
  address: `0x${string}`  ;
}

export interface TokensProps {
  virtualBaseTokensName: string;
  virtualQuoteTokensName: string;
}

export interface LiquidityFormProps {
  onLiquiditySubmit?: (data: LiquidityFormValues) => void;
  onConnectWallet?: () => void;
  market: MarketProps;
  tokens: TokensProps;
  isConnected?: boolean;
}

export function LiquidityForm({ 
  onLiquiditySubmit,
  onConnectWallet,
  market,
  tokens,
  isConnected = false,
}: LiquidityFormProps) {
  const form = useLiquidityForm();
  const { handleSubmit, control, watch, setValue } = form;
  
  // Mock state values
  const [walletBalance, setWalletBalance] = useState("100.0");
  const [virtualBaseTokens, setVirtualBaseTokens] = useState("0");
  const [virtualQuoteTokens, setVirtualQuoteTokens] = useState("0");
  const [estimatedResultingBalance, setEstimatedResultingBalance] = useState(walletBalance);
  
  const depositAmount = watch('depositAmount');
  const lowPrice = watch('lowPrice');
  const highPrice = watch('highPrice');


  const { abi } = useFoilAbi(market.chainId);

  const { data: marketInfo } = useMarketInfo(market.chainId, market.address as `0x${string}`, market.epochId, abi);

  console.log('LLL marketInfo', marketInfo)

  const { ticker: collateralTicker, decimals: collateralDecimals } = useCollateralInfo(market.chainId, market.address as `0x${string}`);

  // const { data: marketInfo } = useMarketInfo(market.chainId, market.address as `0x${string}`, market.epochId);
  // console.log('LLL marketInfo', marketInfo)
  // const { pool, liquidity, refetchUniswapData } = useUniswapPool(
  //   market.chainId,
  //   market.address as `0x${string}` // TODO: not market.address, but pool address
  // );


  // const { data: tokenAmounts, error: tokenAmountsError, isFetching } = useReadContract({
  //   chainId: market.chainId,
  //   address: market.address as `0x${string}`,
  //   abi: abi,
  //   functionName: 'quoteLiquidityPositionTokens',
  //   args: [
  //     market.epochId.toString(),
  //     parseUnits(depositAmount.toString(), collateralDecimals),
  //     pool.sqrtRatioX96.toString(),
  //     TickMath.getSqrtRatioAtTick(tickLower).toString(),
  //     TickMath.getSqrtRatioAtTick(tickUpper).toString(),
  //   ],
  //   query: {
  //     enabled: Boolean(pool && isValid),
  //   },
  // });



  // Calculate estimated preview values based on inputs
  useEffect(() => {
    const depositNum = parseFloat(depositAmount || '0');
    
    if (depositNum === 0) {
      setVirtualBaseTokens("0");
      setVirtualQuoteTokens("0");
      setEstimatedResultingBalance(walletBalance);
      return;
    }
    
    // In a real implementation, this would call an API or contract to get quotes
    // For this example, we'll just use a simple calculation
    setVirtualBaseTokens((depositNum * 0.8).toFixed(4));
    setVirtualQuoteTokens((depositNum * 0.2).toFixed(4));
    
    const newBalance = (parseFloat(walletBalance) - depositNum).toFixed(4);
    setEstimatedResultingBalance(newBalance);
  }, [depositAmount, lowPrice, highPrice, walletBalance]);

  const handleFormSubmit = (data: LiquidityFormValues) => {
    if (onLiquiditySubmit) {
      onLiquiditySubmit(data);
    } else {
      form.onSubmit(data);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <div className="mb-6">
          <FormLabel className="block mb-2">Collateral</FormLabel>
          <FormField
            control={control}
            name="depositAmount"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <div className="flex">
                    <Input 
                      placeholder="0" 
                      type="text"
                      className="rounded-r-none"
                      {...field} 
                    />
                    <div className="px-4 flex items-center border border-input bg-muted rounded-r-md ml-[-1px]">
                      {/* {collateralTicker} */}
                    </div>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="mb-6">
          <FormLabel className="block mb-2">Low Price</FormLabel>
          <FormField
            control={control}
            name="lowPrice"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <div className="flex">
                    <Input 
                      placeholder="0" 
                      type="text"
                      className="rounded-r-none"
                      {...field} 
                    />
                    <div className="px-4 flex items-center border border-input bg-muted rounded-r-md ml-[-1px]">
                      odds
                    </div>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="mb-6">
          <FormLabel className="block mb-2">High Price</FormLabel>
          <FormField
            control={control}
            name="highPrice"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <div className="flex">
                    <Input 
                      placeholder="0" 
                      type="text"
                      className="rounded-r-none"
                      {...field} 
                    />
                    <div className="px-4 flex items-center border border-input bg-muted rounded-r-md ml-[-1px]">
                      odds
                    </div>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <SlippageTolerance />

        <div className="mt-6">
          {isConnected ? (
            <Button 
              type="submit" 
              className="w-full"
            >
              Add Liquidity
            </Button>
          ) : (
            <Button 
              type="button" 
              className="w-full"
              onClick={onConnectWallet}
            >
              Connect Wallet
            </Button>
          )}
        </div>
        
        {/* Preview Section */}
        <div className="pt-4 mt-4">
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Position</p>
              <p className="text-sm">New Position</p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">{tokens.virtualBaseTokensName} Tokens</p>
              <p className="text-sm">
                <NumberDisplay value={virtualBaseTokens} /> v{tokens.virtualBaseTokensName} (Min. <NumberDisplay value={virtualBaseTokens} />)
              </p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">{tokens.virtualQuoteTokensName} Tokens</p>
              <p className="text-sm">
                <NumberDisplay value={virtualQuoteTokens} /> v{tokens.virtualQuoteTokensName} (Min. <NumberDisplay value={virtualQuoteTokens} />)
              </p>
            </div>
          </div>
        </div>
      </form>
    </Form>
  );
} 