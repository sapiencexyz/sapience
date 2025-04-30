'use client';

import { Button, Input, Label } from '@foil/ui';
import type React from 'react';
import { useState } from 'react';

interface CreateMarketDialogProps {
  marketGroupAddress: string;
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

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // TODO: Implement form submission logic
    console.log({
      // Log values for now
      marketQuestion, // Log the new question
      optionName, // Log option name
      startTime,
      endTime,
      startingSqrtPriceX96,
      baseAssetMinPriceTick,
      baseAssetMaxPriceTick,
      salt,
      claimStatement,
    });
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

      {/* TODO: Add form validation and error handling */}
      <Button type="submit">
        {' '}
        {/* TODO: Add disable logic based on validation/pending state */}
        Create Market
      </Button>
    </form>
  );
};

export default CreateMarketDialog;
