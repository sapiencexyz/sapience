import { useState, useContext, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { decodeEventLog, formatUnits, zeroAddress } from 'viem';
import {
    useWaitForTransactionReceipt,
    useWriteContract,
    useAccount,
    useReadContract,
    useSimulateContract,
    useChainId,
    useSwitchChain,
    usePublicClient,
  } from 'wagmi';

import { Button } from '~/components/ui/button';
import { Form } from '~/components/ui/form';
import { useToast } from '~/hooks/use-toast';
import { HIGH_PRICE_IMPACT, TOKEN_DECIMALS } from '~/lib/constants/constants';
import { useAddEditPosition } from '~/lib/context/AddEditPositionContext';
import { MarketContext } from '~/lib/context/MarketProvider';
import type { FoilPosition } from '~/lib/interfaces/interfaces';

import SlippageTolerance from './slippageTolerance';
const account = useAccount();
const { isConnected, address } = account;

interface CloseTradeProps {
  nftId: number;
  positionData: FoilPosition;
  marketAddress: `0x${string}`;
  foilData: any;
  onSuccess?: () => void;
}

export default function CloseTrade({ 
  nftId, 
  positionData,
  marketAddress,
  foilData,
  onSuccess
}: CloseTradeProps) {
  const [pendingTxn, setPendingTxn] = useState(false);
  const [txnStep, setTxnStep] = useState(0);
  const { toast } = useToast();
  const { refreshPositions } = useAddEditPosition();
  const { pool, chainId } = useContext(MarketContext);

  const form = useForm({
    defaultValues: {
      slippage: '0.5',
    },
  });

  const { handleSubmit } = form;

  
  const quoteClosePositionResult = useSimulateContract({
    abi: foilData.abi,
    address: marketAddress as `0x${string}`,
    functionName: 'quoteModifyTraderPosition',
    args: [nftId, BigInt(0)], 
    chainId,
    account: address || zeroAddress,
    query: { 
      enabled: !!positionData,
      refetchOnMount: true, 
    },
  });

 
  const closePositionPriceImpact = useMemo(() => {
    if (!pool?.token0Price || !positionData) return 0;
    
    if(positionData.vGasAmount == BigInt(0) && positionData.borrowedVGas == BigInt(0)) {
      return 0;
    }
    const closeQuote = quoteClosePositionResult.data?.result;
    if (!closeQuote) return 0;
    
    const [, , fillPrice] = closeQuote;
    const referencePrice = parseFloat(pool.token0Price.toSignificant(18));
    return Math.abs((Number(fillPrice) / 1e18 / referencePrice - 1) * 100);
  }, [pool, positionData, quoteClosePositionResult.data]);

  const { data: hash, writeContract } = useWriteContract({
    mutation: {
      onError: (error) => {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: `There was an issue closing your position: ${(error as Error).message}`,
        });
        setPendingTxn(false);
      },
      onSuccess: () => {
        toast({
          title: 'Transaction Submitted',
          description: 'Waiting for confirmation...',
        });
      },
    },
  });

  const { isSuccess: isConfirmed, data: transactionReceipt } =
    useWaitForTransactionReceipt({ hash });

  const onSubmit = async () => {
    setPendingTxn(true);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
    
    writeContract({
      abi: foilData.abi,
      address: marketAddress,
      functionName: 'modifyTraderPosition',
      args: [nftId, BigInt(0), BigInt(0), deadline],
    });
    setTxnStep(2);
  };

  
  if (isConfirmed && txnStep === 2) {
    toast({
      title: 'Position Closed',
      description: 'Your position has been closed successfully.',
    });
    setPendingTxn(false);
    setTxnStep(0);
    refreshPositions();
    onSuccess?.();
  }

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <SlippageTolerance />
        <Button
          className="w-full"
          variant="default"
          type="submit"
          disabled={pendingTxn}
          size="lg"
        >
          {pendingTxn ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            'Close Position'
          )}
        </Button>
        {closePositionPriceImpact > HIGH_PRICE_IMPACT && (
          <p className="text-red-500 text-sm text-center mt-1 font-medium">
            <AlertTriangle className="inline-block w-4 h-4 mr-1" />
            Closing this position will have a {Number(closePositionPriceImpact.toFixed(2))}% price impact
          </p>
        )}
      </form>
    </Form>
  );
} 