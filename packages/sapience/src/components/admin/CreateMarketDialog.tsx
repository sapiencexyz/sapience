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
import { useState } from 'react';
import { isAddress } from 'viem';
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
  claimStatement: string;
}

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
  const [startTime, setStartTime] = useState<string>(() =>
    Math.floor(Date.now() / 1000).toString()
  );
  const [endTime, setEndTime] = useState<string>(() =>
    Math.floor(Date.now() / 1000 + 28 * 24 * 60 * 60).toString()
  );
  const [startingSqrtPriceX96, setStartingSqrtPriceX96] = useState<string>(
    '56022770974786143748341366784'
  );
  const [baseAssetMinPriceTick, setBaseAssetMinPriceTick] =
    useState<string>('-92200');
  const [baseAssetMaxPriceTick, setBaseAssetMaxPriceTick] =
    useState<string>('0');
  const [claimStatement, setClaimStatement] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // --- Zod Validation Schemas ---
  const baseSchema = z
    .object({
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
      marketGroupAddress: z
        .string()
        .refine(isAddress, 'Invalid Market Group Address'),
    })
    .refine((data) => data.endTime > data.startTime, {
      message: 'End Time must be after Start Time',
      path: ['endTime'],
    })
    .refine((data) => data.baseAssetMaxPriceTick > data.baseAssetMinPriceTick, {
      message: 'Max Price Tick must be greater than Min Price Tick',
      path: ['baseAssetMaxPriceTick'],
    });

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

  // --- Validation Logic ---
  const validateFormData = (): string | null => {
    const formData = {
      marketQuestion,
      optionName,
      startTime,
      endTime,
      startingSqrtPriceX96,
      baseAssetMinPriceTick,
      baseAssetMaxPriceTick,
      claimStatement,
      marketGroupAddress,
    };

    try {
      baseSchema.parse(formData);
      return null;
    } catch (error) {
      if (error instanceof z.ZodError) {
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

    const validationError = validateFormData();
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
      claimStatement,
    };

    createMarketMutation.mutate(payload);
  };
  // --- End API Submit ---

  return (
    <form onSubmit={handleApiSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Creating market draft for group: {marketGroupAddress}
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
      </div>

      <div className="w-full mt-6">
        <Button
          type="submit"
          disabled={createMarketMutation.isPending}
          className="w-full"
        >
          {createMarketMutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Save Market Draft
        </Button>
      </div>

      <div className="space-y-4 mt-4">
        {createMarketMutation.isSuccess && (
          <Alert variant="default">
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>API Submission Successful</AlertTitle>
            <AlertDescription>
              Market draft data saved to the database.
            </AlertDescription>
          </Alert>
        )}

        {(formError || (createMarketMutation.isError && !formError)) && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {formError ||
                (createMarketMutation.error as Error)?.message ||
                'An unknown API error occurred'}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </form>
  );
};

export default CreateMarketDialog;
