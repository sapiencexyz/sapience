import { useState, useEffect, useMemo } from 'react';
import { useForm, UseFormReturn } from 'react-hook-form';
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { decodeEventLog, formatUnits } from 'viem';
import type { FoilPosition } from '~/lib/interfaces/interfaces';
import { useToast } from '~/hooks/use-toast';
import { TOKEN_DECIMALS } from '~/lib/constants/constants';

interface UseTradeStateProps {
  nftId?: number;
  isEdit: boolean;
  marketAddress: string;
  collateralAsset: string;
  collateralAssetTicker: string;
  foilData: any;
  positionData?: FoilPosition;
  refreshPositions: () => Promise<void>;
  refetchPositionData: () => void | Promise<void>;
  refetchAllowance: () => void | Promise<void>;
  refetchUniswapData: () => void | Promise<void>;
  setNftId: (id: number) => void;
  liquidity?: number;
  isLong: boolean;
  quotedResultingWalletBalance: string;
  walletBalance: string;
  sizeChangeInContractUnit: bigint;
  quoteError: string | null;
}

export type TradeFormValues = {
  size: string;
  option: string;
  slippage: string;
  fetchingSizeFromCollateralInput: boolean;
  isClosePosition: boolean;
  desiredSizeInContractUnit: bigint;
  collateralDeltaLimit: bigint;
  epoch: number;
};

interface TradeState {
  form: UseFormReturn<TradeFormValues>;
  sizeChange: bigint;
  option: 'Long' | 'Short';
  
  // Component states
  pendingTxn: boolean;
  txnStep: number;
  collateralInput: bigint;
  
  // Actions
  setSizeChange: (size: bigint) => void;
  setOption: (option: 'Long' | 'Short') => void;
  handleCollateralAmountChange: (amount: bigint) => void;
  handleSubmit: (values: any) => Promise<void>;
  resetForm: () => Promise<void>;
  formError: string;
  positionData?: FoilPosition;
  refetchPositionData: () => void | Promise<void>;
  refetchAllowance: () => void | Promise<void>;
  refetchUniswapData: () => void | Promise<void>;
}

export function useTradeState({
  nftId,
  isEdit,
  marketAddress,
  collateralAsset,
  collateralAssetTicker,
  foilData,
  positionData,
  refreshPositions,
  refetchPositionData,
  refetchAllowance,
  refetchUniswapData,
  setNftId,
  liquidity,
  isLong,
  quotedResultingWalletBalance,
  walletBalance,
  sizeChangeInContractUnit,
  quoteError,
}: UseTradeStateProps): TradeState {
  // Form states
  const [sizeChange, setSizeChange] = useState<bigint>(BigInt(0));
  const [option, setOption] = useState<'Long' | 'Short'>('Long');

  // Component states
  const [pendingTxn, setPendingTxn] = useState(false);
  const [txnStep, setTxnStep] = useState(0);
  const [collateralInput, setCollateralInput] = useState<bigint>(BigInt(0));

  const { toast } = useToast();

  // Initialize form
  const form = useForm<TradeFormValues>({
    defaultValues: {
      size: '0',
      option: 'Long',
      slippage: '0.5',
      fetchingSizeFromCollateralInput: false,
      isClosePosition: false,
      desiredSizeInContractUnit: BigInt(0),
      collateralDeltaLimit: BigInt(0),
      epoch: 0,
    },
    mode: 'onChange',
    reValidateMode: 'onChange',
  });

  // Contract write hooks
  const { data: hash, writeContract } = useWriteContract({
    mutation: {
      onError: (error) => {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: `There was an issue creating/updating your position: ${(error as Error).message}`,
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

  const { data: approveHash, writeContract: approveWrite } = useWriteContract({
    mutation: {
      onError: (error) => {
        toast({
          variant: 'destructive',
          title: 'Approval Failed',
          description: `Failed to approve: ${(error as Error).message}`,
        });
        setPendingTxn(false);
      },
      onSuccess: () => {
        toast({
          title: 'Approval Submitted',
          description: 'Waiting for confirmation...',
        });
      },
    },
  });

  // Transaction receipt hooks
  const { isSuccess: isConfirmed, data: transactionReceipt } = useWaitForTransactionReceipt({ hash });
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });

  // Handle position data initialization
  useEffect(() => {
    if (positionData && isEdit) {
      setOption(positionData.vGasAmount > BigInt(0) ? 'Long' : 'Short');
      setSizeChange(BigInt(0));
    }
  }, [positionData, isEdit]);

  // Handle transaction confirmation
  useEffect(() => {
    if (isConfirmed && txnStep === 2) {
      if (isEdit) {
        toast({
          title: 'Success',
          description: "We've updated your position for you. Your transaction will be displayed in the app as soon as possible.",
        });
        resetForm();
      } else {
        for (const log of transactionReceipt.logs) {
          try {
            const event = decodeEventLog({
              abi: foilData.abi,
              data: log.data,
              topics: log.topics,
            });

            if ((event as any).eventName === 'TraderPositionCreated') {
              const nftId = (event as any).args.positionId.toString();
              toast({
                title: 'Position Created',
                description: `Your position has been created as position ${nftId}`,
              });
              setNftId(nftId);
              resetForm();
              return;
            }
          } catch (error) {
            // This log was not for the TraderPositionCreated event, continue to next log
          }
        }
        toast({
          title: 'Success',
          description: "We've created your position for you. Your transaction will be displayed in the app as soon as possible.",
        });
        resetForm();
      }
    }
  }, [isConfirmed, transactionReceipt, txnStep]);

  // Handle approval success
  useEffect(() => {
    if (approveSuccess && txnStep === 1) {
      refetchAllowance();
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

      if (isEdit) {
        writeContract({
          abi: foilData.abi,
          address: marketAddress as `0x${string}`,
          functionName: 'modifyTraderPosition',
          args: [nftId ?? 0, form.getValues('desiredSizeInContractUnit'), form.getValues('collateralDeltaLimit'), deadline],
        });
      } else {
        writeContract({
          abi: foilData.abi,
          address: marketAddress as `0x${string}`,
          functionName: 'createTraderPosition',
          args: [form.getValues('epoch'), form.getValues('desiredSizeInContractUnit'), form.getValues('collateralDeltaLimit'), deadline],
        });
      }
      setTxnStep(2);
    }
  }, [approveSuccess, txnStep]);

  // Form submission handler
  const handleSubmit = async (values: any) => {
    setPendingTxn(true);

    if (values.requireApproval) {
      approveWrite({
        abi: foilData.abi,
        address: collateralAsset as `0x${string}`,
        functionName: 'approve',
        args: [marketAddress, values.collateralDeltaLimit],
      });
      setTxnStep(1);
    } else {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
      
      if (isEdit) {
        const callSizeInContractUnit = values.isClosePosition ? BigInt(0) : values.desiredSizeInContractUnit;
        const callCollateralDeltaLimit = values.isClosePosition ? BigInt(0) : values.collateralDeltaLimit;
        
        writeContract({
          abi: foilData.abi,
          address: marketAddress as `0x${string}`,
          functionName: 'modifyTraderPosition',
          args: [nftId ?? 0, callSizeInContractUnit, callCollateralDeltaLimit, deadline],
        });
      } else {
        writeContract({
          abi: foilData.abi,
          address: marketAddress as `0x${string}`,
          functionName: 'createTraderPosition',
          args: [values.epoch, values.desiredSizeInContractUnit, values.collateralDeltaLimit, deadline],
        });
      }
      setTxnStep(2);
    }
  };

  // Reset form state
  const resetForm = async () => {
    form.reset();
    setSizeChange(BigInt(0));
    setPendingTxn(false);
    setTxnStep(0);
    await Promise.all([
      refreshPositions(),
      refetchAllowance(),
      refetchPositionData(),
      refetchUniswapData(),
    ]);
  };

  const formError = useMemo(() => {
    if (
      (Number(quotedResultingWalletBalance) < 0 ||
        Number(walletBalance) <= 0) &&
      sizeChangeInContractUnit > BigInt(0)
    ) {
      return 'Insufficient wallet balance to perform this trade.';
    }
    if (
      sizeChangeInContractUnit > BigInt(0) &&
      (!liquidity ||
        (isLong &&
          parseFloat(formatUnits(sizeChangeInContractUnit, TOKEN_DECIMALS)) >
            Number(liquidity)))
    ) {
      return 'Not enough liquidity to perform this trade.';
    }
    if (quoteError) {
      console.error('quoteError', quoteError);
      return 'The protocol cannot generate a quote for this order.';
    }
    return '';
  }, [
    quoteError,
    liquidity,
    sizeChangeInContractUnit,
    isLong,
    quotedResultingWalletBalance,
    walletBalance,
  ]);

  return {
    // Form states
    form,
    sizeChange,
    option,
    positionData,
    
    // Component states
    pendingTxn,
    txnStep,
    collateralInput,
    
    // Actions
    setSizeChange,
    setOption,
    handleCollateralAmountChange: setCollateralInput,
    handleSubmit,
    resetForm,
    formError,
    refetchPositionData,
    refetchAllowance,
    refetchUniswapData,
  };
}