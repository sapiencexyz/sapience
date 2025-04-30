'use client';

import { Button, Input, Label } from '@foil/ui';
import { useMutation } from '@tanstack/react-query';
import type React from 'react';
import { useState } from 'react';

// Use environment variable for API base URL, fallback to /api
const API_BASE_URL = process.env.NEXT_PUBLIC_FOIL_API_URL || '/api';

interface CreateMarketDialogProps {
  marketGroupAddress: string;
}

// --- Define Payload Type ---
interface CreateMarketPayload {
  marketQuestion: string;
  optionName: string;
  startTime: string;
  endTime: string;
  startingSqrtPriceX96: string;
  baseAssetMinPriceTick: string;
  baseAssetMaxPriceTick: string;
  salt: string;
  claimStatement: string;
}

const CreateMarketDialog: React.FC<CreateMarketDialogProps> = ({
  marketGroupAddress,
}) => {
  // Form State
  const [marketQuestion, setMarketQuestion] = useState<string>(''); // New state for market question
  const [optionName, setOptionName] = useState<string>(''); // Added Option Name state
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [startingSqrtPriceX96, setStartingSqrtPriceX96] = useState<string>('');
  const [baseAssetMinPriceTick, setBaseAssetMinPriceTick] =
    useState<string>('');
  const [baseAssetMaxPriceTick, setBaseAssetMaxPriceTick] =
    useState<string>('');
  const [salt, setSalt] = useState<string>(() =>
    Math.floor(Math.random() * 1e18).toString()
  ); // Default random salt
  const [claimStatement, setClaimStatement] = useState<string>('');

  // --- Tanstack Query Mutation Setup ---
  const createMarketMutation = useMutation({
    mutationFn: async (payload: CreateMarketPayload) => {
      // The marketGroupAddress comes from props, not payload
      const response = await fetch(
        `${API_BASE_URL}/create-market/${marketGroupAddress}`,
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
      return result; // Return data on success
    },
    onSuccess: (data: unknown) => {
      console.log('API Submission Success:', data);
      // TODO: Add success feedback, maybe clear form
    },
    onError: (error: Error) => {
      console.error('API Submission Error:', error);
      // Error state is handled by mutation.error below
    },
  });
  // --- End Tanstack Query Mutation Setup ---

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Basic validation (can be enhanced) - Use mutation.reset() to clear errors if needed before validate
    createMarketMutation.reset(); // Clear previous mutation error before new submission
    let validationError = null;
    if (!marketQuestion.trim()) validationError = 'Market Question is required';
    else if (!optionName.trim()) validationError = 'Option Name is required';
    else if (!claimStatement.trim())
      validationError = 'Claim Statement is required';
    else if (!startTime || isNaN(Number(startTime)))
      validationError = 'Valid Start Time is required';
    else if (!endTime || isNaN(Number(endTime)))
      validationError = 'Valid End Time is required';
    else if (!startingSqrtPriceX96.trim())
      validationError = 'Starting Sqrt Price X96 is required';
    else if (!baseAssetMinPriceTick || isNaN(Number(baseAssetMinPriceTick)))
      validationError = 'Valid Min Price Tick is required';
    else if (!baseAssetMaxPriceTick || isNaN(Number(baseAssetMaxPriceTick)))
      validationError = 'Valid Max Price Tick is required';
    else if (!salt || isNaN(Number(salt)))
      validationError = 'Valid Salt (Nonce) is required';

    if (validationError) {
      // Optionally set a state for validation errors if you want to display them differently from submission errors
      // setValidationError(validationError);
      console.error('Validation Error:', validationError);
      // We don't trigger the mutation if validation fails.
      // The user sees the error via the standard react-query error handling if needed,
      // or you can add a dedicated validation error display.
      return; // Stop submission if validation fails
    }

    const payload: CreateMarketPayload = {
      marketQuestion,
      optionName,
      startTime,
      endTime,
      startingSqrtPriceX96,
      baseAssetMinPriceTick,
      baseAssetMaxPriceTick,
      salt,
      claimStatement,
    };

    // Trigger the mutation
    createMarketMutation.mutate(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Creating market for group: {marketGroupAddress}
      </p>

      {/* Market Question */}
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

      {/* Option Name */}
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

      {/* Claim Statement */}
      <div>
        <Label htmlFor="claimStatement">Claim Statement (Bytes)</Label>
        <Input
          id="claimStatement"
          type="text"
          value={claimStatement}
          onChange={(e) => setClaimStatement(e.target.value)}
          required
        />
      </div>

      {/* startTime */}
      <div>
        <Label htmlFor="startTime">Start Time (Unix Timestamp)</Label>
        <Input
          id="startTime"
          type="number"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          required
          inputMode="numeric"
        />
      </div>

      {/* endTime */}
      <div>
        <Label htmlFor="endTime">End Time (Unix Timestamp)</Label>
        <Input
          id="endTime"
          type="number"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          required
          inputMode="numeric"
        />
      </div>

      {/* startingSqrtPriceX96 */}
      <div>
        <Label htmlFor="startingSqrtPriceX96">Starting Sqrt Price X96</Label>
        <Input
          id="startingSqrtPriceX96"
          type="text"
          value={startingSqrtPriceX96}
          onChange={(e) => setStartingSqrtPriceX96(e.target.value)}
          required
          inputMode="numeric"
        />
      </div>

      {/* baseAssetMinPriceTick */}
      <div>
        <Label htmlFor="baseAssetMinPriceTick">Base Asset Min Price Tick</Label>
        <Input
          id="baseAssetMinPriceTick"
          type="number"
          value={baseAssetMinPriceTick}
          onChange={(e) => setBaseAssetMinPriceTick(e.target.value)}
          required
          inputMode="numeric"
        />
      </div>

      {/* baseAssetMaxPriceTick */}
      <div>
        <Label htmlFor="baseAssetMaxPriceTick">Base Asset Max Price Tick</Label>
        <Input
          id="baseAssetMaxPriceTick"
          type="number"
          value={baseAssetMaxPriceTick}
          onChange={(e) => setBaseAssetMaxPriceTick(e.target.value)}
          required
          inputMode="numeric"
        />
      </div>

      {/* salt */}
      <div>
        <Label htmlFor="salt">Salt (Nonce)</Label>
        <Input
          id="salt"
          type="text"
          value={salt} // Display generated salt
          onChange={(e) => setSalt(e.target.value)} // Allow modification
          required
          inputMode="numeric"
        />
      </div>

      {/* Display Mutation Error */}
      {createMarketMutation.isError && (
        <p className="text-sm text-red-600">
          Error:{' '}
          {(createMarketMutation.error as Error)?.message ||
            'An unknown error occurred'}
        </p>
      )}

      <Button type="submit" disabled={createMarketMutation.isPending}>
        {createMarketMutation.isPending ? 'Creating...' : 'Create Market'}
      </Button>
    </form>
  );
};

export default CreateMarketDialog;
