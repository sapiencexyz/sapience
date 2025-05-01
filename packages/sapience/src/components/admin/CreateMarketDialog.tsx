'use client';

import { Button, Input, Label } from '@foil/ui';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@foil/ui/components/ui/alert';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import type React from 'react';
import { useState, useEffect } from 'react';
import {
  toBytes,
  bytesToHex,
  parseAbiItem,
  decodeEventLog,
  isAddress,
  type AbiEvent,
  type Address,
} from 'viem';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { z } from 'zod';

// Use environment variable for API base URL, fallback to /api
const API_BASE_URL = process.env.NEXT_PUBLIC_FOIL_API_URL || '/api';

// --- Define Payload Type for API ---
interface CreateMarketPayload {
  marketQuestion: string;
  optionName: string;
  startTime: string;
  endTime: string;
  startingSqrtPriceX96: string;
  baseAssetMinPriceTick: string;
  baseAssetMaxPriceTick: string;
}

// --- Define Contract ABI and Event ---
// ABI for the createEpoch function (adjust types/inputs as needed)
const createEpochAbiFragment = [
  {
    type: 'function',
    name: 'createEpoch',
    inputs: [
      { name: 'startTime', type: 'uint64', internalType: 'uint64' },
      { name: 'endTime', type: 'uint64', internalType: 'uint64' },
      {
        name: 'startingSqrtPriceX96',
        type: 'uint160',
        internalType: 'uint160',
      },
      { name: 'baseAssetMinPriceTick', type: 'int24', internalType: 'int24' },
      { name: 'baseAssetMaxPriceTick', type: 'int24', internalType: 'int24' },
      { name: 'salt', type: 'uint256', internalType: 'uint256' },
      { name: 'claimStatement', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [{ name: 'marketId', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'nonpayable',
  },
] as const;

// Event ABI item for parsing logs (assuming this event exists on MarketGroup contract)
const epochCreatedEvent = parseAbiItem(
  'event EpochCreated(uint256 indexed marketId)'
) as AbiEvent;

interface CreateMarketDialogProps {
  chainId: number;
  marketGroupAddress: string;
}

const CreateMarketDialog: React.FC<CreateMarketDialogProps> = ({
  chainId,
  marketGroupAddress,
}) => {
  // Form State
  const [marketQuestion, setMarketQuestion] = useState<string>('');
  const [optionName, setOptionName] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [startingSqrtPriceX96, setStartingSqrtPriceX96] = useState<string>('');
  const [baseAssetMinPriceTick, setBaseAssetMinPriceTick] =
    useState<string>('');
  const [baseAssetMaxPriceTick, setBaseAssetMaxPriceTick] =
    useState<string>('');
  const [salt, setSalt] = useState<string>(() =>
    Math.floor(Math.random() * 1e18).toString()
  );
  const [claimStatement, setClaimStatement] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [createdMarketId, setCreatedMarketId] = useState<string | null>(null);

  // --- Zod Validation Schemas ---
  const baseObjectSchema = z.object({
    marketQuestion: z.string().trim().min(1, 'Market Question is required'),
    optionName: z.string().trim().min(1, 'Option Name is required'),
    claimStatement: z.string().trim().min(1, 'Claim Statement is required'),
    startTime: z.coerce
      .number()
      .int()
      .nonnegative('Valid Start Time (>= 0) is required'),
    endTime: z.coerce
      .number()
      .int()
      .nonnegative('Valid End Time (>= 0) is required'),
    startingSqrtPriceX96: z
      .string()
      .trim()
      .min(1, 'Starting Sqrt Price X96 is required')
      .refine((val) => {
        try {
          BigInt(val);
          return true;
        } catch {
          return false;
        }
      }, 'Starting Sqrt Price must be a valid large integer'),
    baseAssetMinPriceTick: z.coerce
      .number()
      .int('Valid Min Price Tick is required'),
    baseAssetMaxPriceTick: z.coerce
      .number()
      .int('Valid Max Price Tick is required'),
    salt: z
      .string()
      .trim()
      .min(1, 'Valid Salt (Nonce) is required')
      .refine((val) => {
        try {
          BigInt(val);
          return true;
        } catch {
          return false;
        }
      }, 'Salt must be a valid large integer'),
  });

  const baseSchema = baseObjectSchema
    .refine((data) => data.endTime > data.startTime, {
      message: 'End Time must be after Start Time',
      path: ['endTime'], // Attach error to endTime field
    })
    .refine((data) => data.baseAssetMaxPriceTick > data.baseAssetMinPriceTick, {
      message: 'Max Price Tick must be greater than Min Price Tick',
      path: ['baseAssetMaxPriceTick'], // Attach error to max price tick field
    });

  const deploymentObjectSchema = baseObjectSchema.extend({
    marketGroupAddress: z
      .string()
      .refine(isAddress, 'Invalid Market Group Address for deployment'),
    claimStatement: z
      .string()
      .trim()
      .min(1, 'Claim Statement is required')
      .refine((val) => {
        try {
          toBytes(val);
          return true;
        } catch {
          return false;
        }
      }, 'Claim Statement cannot be converted to bytes'),
  });

  const deploymentSchema = deploymentObjectSchema
    .refine((data) => data.endTime > data.startTime, {
      message: 'End Time must be after Start Time',
      path: ['endTime'],
    })
    .refine((data) => data.baseAssetMaxPriceTick > data.baseAssetMinPriceTick, {
      message: 'Max Price Tick must be greater than Min Price Tick',
      path: ['baseAssetMaxPriceTick'],
    });
  // --- End Zod Schemas ---

  // --- Wagmi Hooks ---
  const {
    data: hash,
    error: writeError,
    isPending: isWritePending,
    writeContract,
  } = useWriteContract();

  // Transaction Receipt Hook
  const {
    data: receipt,
    isLoading: isConfirming,
    isSuccess: isTxSuccess,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });
  // --- End Wagmi Hooks ---

  // --- Tanstack Query Mutation Setup for API ---
  const createMarketMutation = useMutation({
    mutationFn: async (payload: CreateMarketPayload) => {
      const response = await fetch(
        `${API_BASE_URL}/create-market/${chainId}/${marketGroupAddress}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.message || `HTTP error! status: ${response.status}`
        );
      }
      return result;
    },
    onSuccess: (data: unknown) => {
      console.log('API Submission Success:', data);
      setFormError(null);
    },
    onError: (error: Error) => {
      console.error('API Submission Error:', error);
    },
  });
  // --- End Tanstack Query Mutation Setup ---

  // --- Parse Event Log on Successful Transaction ---
  useEffect(() => {
    if (isTxSuccess && receipt) {
      setCreatedMarketId(null);
      console.log(
        'Transaction successful, attempting to parse logs:',
        receipt.logs
      );
      try {
        const logs = receipt.logs
          .map((log) => {
            try {
              const topics = Array.isArray(log.topics) ? log.topics : [];
              const typedTopics: [`0x${string}`, ...`0x${string}`[]] | [] =
                topics as any;
              return decodeEventLog({
                abi: [epochCreatedEvent],
                data: log.data,
                topics: typedTopics,
                strict: false,
              });
            } catch (e) {
              return null;
            }
          })
          .filter(
            (
              decodedLog
            ): decodedLog is {
              eventName: 'EpochCreated';
              args: { marketId: bigint };
            } =>
              decodedLog !== null &&
              decodedLog.eventName === 'EpochCreated' &&
              decodedLog.args !== undefined &&
              typeof (decodedLog.args as any).marketId === 'bigint'
          );

        if (logs.length > 0 && logs[0]?.args) {
          console.log(
            'Found EpochCreated event, marketId:',
            logs[0].args.marketId.toString()
          );
          setCreatedMarketId(logs[0].args.marketId.toString());
          setFormError(null);
        } else {
          console.warn(
            'EpochCreated event not found or marketId missing in transaction logs.'
          );
        }
      } catch (e) {
        console.error('Error processing logs:', e);
        setFormError('Error processing transaction logs.');
      }
    }
  }, [isTxSuccess, receipt, epochCreatedEvent]);
  // --- End Event Parsing ---

  // --- Validation Logic ---
  const validateFormData = (isDeploy = false): string | null => {
    const schema = isDeploy ? deploymentSchema : baseSchema;
    const formData = {
      marketQuestion,
      optionName,
      startTime,
      endTime,
      startingSqrtPriceX96,
      baseAssetMinPriceTick,
      baseAssetMaxPriceTick,
      salt,
      claimStatement,
      ...(isDeploy ? { marketGroupAddress } : {}),
    };

    try {
      schema.parse(formData);
      return null; // Validation successful
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Return the first validation error message
        return error.errors[0]?.message || 'Validation failed';
      }
      console.error('Unexpected validation error:', error);
      return 'An unexpected validation error occurred.';
    }
  };
  // --- End Validation ---

  // --- API Submit Handler ---
  const handleApiSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    createMarketMutation.reset();
    setFormError(null);
    setCreatedMarketId(null);

    const validationError = validateFormData(false);
    if (validationError) {
      setFormError(validationError);
      console.error('Validation Error (API):', validationError);
      return;
    }

    const payload: CreateMarketPayload = {
      marketQuestion,
      optionName,
      startTime,
      endTime,
      startingSqrtPriceX96,
      baseAssetMinPriceTick,
      baseAssetMaxPriceTick,
    };

    createMarketMutation.mutate(payload);
  };
  // --- End API Submit ---

  // --- Contract Deploy Handler ---
  const handleDeploy = () => {
    setFormError(null);
    setCreatedMarketId(null);

    const validationError = validateFormData(true);
    if (validationError) {
      setFormError(validationError);
      console.error('Validation Error (Deploy):', validationError);
      return;
    }

    try {
      const claimStatementBytes = toBytes(claimStatement);
      const claimStatementHex = bytesToHex(claimStatementBytes);

      const args = [
        BigInt(startTime),
        BigInt(endTime),
        BigInt(startingSqrtPriceX96),
        Number(baseAssetMinPriceTick),
        Number(baseAssetMaxPriceTick),
        BigInt(salt),
        claimStatementHex,
      ] as const;

      console.log('Calling writeContract (createEpoch) with args:', args);

      writeContract({
        address: marketGroupAddress as Address,
        abi: createEpochAbiFragment,
        functionName: 'createEpoch',
        args,
      });
    } catch (err) {
      console.error(
        'Error preparing contract arguments or calling writeContract:',
        err
      );
      let message = 'Failed to prepare or send transaction.';
      if (err instanceof Error) message = err.message;
      setFormError(`Deployment Preparation Error: ${message}`);
    }
  };
  // --- End Deploy Handler ---

  return (
    <form onSubmit={handleApiSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Creating market for group: {marketGroupAddress}
      </p>

      {/* Market Question & Option Name */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="marketQuestion">Market Question</Label>
          <Input
            id="marketQuestion"
            type="text"
            value={marketQuestion}
            onChange={(e) => setMarketQuestion(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="optionName">Option Name</Label>
          <Input
            id="optionName"
            type="text"
            value={optionName}
            onChange={(e) => setOptionName(e.target.value)}
            required
          />
        </div>
      </div>

      {/* Claim Statement (Full Width) */}
      <div>
        <Label htmlFor="claimStatement">Claim Statement (String)</Label>
        <Input
          id="claimStatement"
          type="text"
          value={claimStatement}
          onChange={(e) => setClaimStatement(e.target.value)}
          placeholder="Enter the claim statement text"
          required
        />
      </div>

      {/* Start Time & End Time */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="startTime">Start Time (Unix Timestamp)</Label>
          <Input
            id="startTime"
            type="number"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
            min="0"
            inputMode="numeric"
          />
        </div>
        <div>
          <Label htmlFor="endTime">End Time (Unix Timestamp)</Label>
          <Input
            id="endTime"
            type="number"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
            min="0"
            inputMode="numeric"
          />
        </div>
      </div>

      {/* Starting Sqrt Price X96 & Base Asset Min Price Tick */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="startingSqrtPriceX96">Starting Sqrt Price X96</Label>
          <Input
            id="startingSqrtPriceX96"
            type="text"
            value={startingSqrtPriceX96}
            onChange={(e) => setStartingSqrtPriceX96(e.target.value)}
            placeholder="e.g., 79228162514..."
            required
            inputMode="numeric"
          />
        </div>
        <div>
          <Label htmlFor="baseAssetMinPriceTick">
            Base Asset Min Price Tick
          </Label>
          <Input
            id="baseAssetMinPriceTick"
            type="number"
            value={baseAssetMinPriceTick}
            onChange={(e) => setBaseAssetMinPriceTick(e.target.value)}
            placeholder="e.g., -887220"
            required
            inputMode="numeric"
          />
        </div>
      </div>

      {/* Base Asset Max Price Tick & Salt */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="baseAssetMaxPriceTick">
            Base Asset Max Price Tick
          </Label>
          <Input
            id="baseAssetMaxPriceTick"
            type="number"
            value={baseAssetMaxPriceTick}
            onChange={(e) => setBaseAssetMaxPriceTick(e.target.value)}
            placeholder="e.g., 887220"
            required
            inputMode="numeric"
          />
        </div>
        <div>
          <Label htmlFor="salt">Salt (Nonce)</Label>
          <Input
            id="salt"
            type="text"
            value={salt}
            onChange={(e) => setSalt(e.target.value)}
            required
            inputMode="numeric"
          />
        </div>
      </div>

      <div className="flex gap-4 w-full mt-6">
        <Button
          type="submit"
          disabled={
            createMarketMutation.isPending || isWritePending || isConfirming
          }
          className="flex-1"
        >
          {createMarketMutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Save Market
        </Button>

        <Button
          type="button"
          onClick={handleDeploy}
          disabled={
            isWritePending || isConfirming || createMarketMutation.isPending
          }
          className="flex-1"
        >
          {(isWritePending || isConfirming) && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Deploy Market
        </Button>
      </div>

      <div className="space-y-4 mt-4">
        {createMarketMutation.isSuccess && (
          <Alert variant="default">
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>API Submission Successful</AlertTitle>
            <AlertDescription>
              Market data saved to the database.
            </AlertDescription>
          </Alert>
        )}

        {formError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Validation Error</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        {createMarketMutation.isError && !formError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>API Error</AlertTitle>
            <AlertDescription>
              {(createMarketMutation.error as Error)?.message ||
                'An unknown API error occurred'}
            </AlertDescription>
          </Alert>
        )}

        {writeError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Contract Write Error</AlertTitle>
            <AlertDescription className="text-xs break-all">
              {writeError.message}
            </AlertDescription>
          </Alert>
        )}

        {hash && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Transaction Sent</AlertTitle>
            <AlertDescription>
              Tx Hash: <code className="text-xs break-all">{hash}</code>
              {isConfirming && (
                <span className="ml-2 inline-flex items-center text-xs">
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Waiting for
                  confirmation...
                </span>
              )}
              {!isConfirming && isTxSuccess && (
                <span className="ml-2 text-xs text-green-600">Confirmed!</span>
              )}
              {!isConfirming && !isTxSuccess && receiptError && (
                <span className="ml-2 text-xs text-red-600">
                  Confirmation Failed
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}

        {receiptError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Transaction Confirmation Error</AlertTitle>
            <AlertDescription className="text-xs break-all">
              {receiptError.message}
            </AlertDescription>
          </Alert>
        )}

        {isTxSuccess && createdMarketId && (
          <Alert variant="default">
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Deployment Successful!</AlertTitle>
            <AlertDescription>
              Epoch Created with Market ID:{' '}
              <code className="text-xs break-all">{createdMarketId}</code>
            </AlertDescription>
          </Alert>
        )}

        {isTxSuccess && !createdMarketId && !receiptError && (
          <Alert variant="default">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Deployment Confirmed (Warning)</AlertTitle>
            <AlertDescription>
              Transaction confirmed, but EpochCreated event (or marketId within
              it) was not detected in the logs. The market might still be usable
              via contract interaction but may not appear correctly in the UI
              list until indexed.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </form>
  );
};

export default CreateMarketDialog;
