'use client';

import { Button } from '@sapience/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sapience/ui/components/ui/dialog';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import type { Address } from 'viem';
import { useSignMessage } from 'wagmi';
import { z } from 'zod';

import { ADMIN_AUTHENTICATE_MSG } from '~/lib/constants';

import MarketFormFields, { type MarketInput } from './MarketFormFields';

const DEFAULT_SQRT_PRICE = '56022770974786143748341366784';
const DEFAULT_MIN_PRICE_TICK = '-92200';
const DEFAULT_MAX_PRICE_TICK = '0';

interface AddMarketDialogProps {
  marketGroupAddress: Address; // This is the factoryAddress
  chainId: number;
}

// Zod schema for data sent to API (excludes client-side id)
const marketApiSchema = z
  .object({
    marketQuestion: z.string().trim().min(1, 'Market Question is required'),
    optionName: z.string().trim().optional(),
    claimStatement: z.string().trim().min(1, 'Claim Statement is required'),
    startTime: z.coerce
      .number()
      .int()
      .nonnegative('Start Time must be a non-negative integer'),
    endTime: z.coerce
      .number()
      .int()
      .nonnegative('End Time must be a non-negative integer'),
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
      .int('Min Price Tick must be an integer'),
    baseAssetMaxPriceTick: z.coerce
      .number()
      .int('Max Price Tick must be an integer'),
    rules: z.string().trim().optional(),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: 'End Time must be after Start Time',
    path: ['endTime'],
  })
  .refine((data) => data.baseAssetMaxPriceTick > data.baseAssetMinPriceTick, {
    message: 'Max Price Tick must be greater than Min Price Tick',
    path: ['baseAssetMaxPriceTick'],
  });

type MarketApiInput = z.infer<typeof marketApiSchema>;

// Payload for the new endpoint
interface AddMarketApiPayload {
  marketData: MarketApiInput;
  signature: `0x${string}`;
  signatureTimestamp: number;
  chainId: number;
  // marketGroupAddress is part of the URL now, not the payload body
}

const createEmptyMarket = (id: number): MarketInput => {
  const now = Math.floor(Date.now() / 1000);
  return {
    id,
    marketQuestion: '',
    optionName: '',
    startTime: now.toString(),
    endTime: (now + 28 * 24 * 60 * 60).toString(), // Default to 28 days from now
    startingSqrtPriceX96: DEFAULT_SQRT_PRICE,
    baseAssetMinPriceTick: DEFAULT_MIN_PRICE_TICK,
    baseAssetMaxPriceTick: DEFAULT_MAX_PRICE_TICK,
    startingPrice: '0.5',
    lowTickPrice: '0.00009908435194807992',
    highTickPrice: '1',
    claimStatement: '',
    rules: '',
  };
};

const AddMarketDialog: React.FC<AddMarketDialogProps> = ({
  marketGroupAddress, // This is the factoryAddress for the URL param
  chainId,
}) => {
  const [open, setOpen] = useState(false);
  const [market, setMarket] = useState<MarketInput>(
    createEmptyMarket(Date.now())
  );
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { signMessageAsync } = useSignMessage();

  const handleMarketChange = (field: keyof MarketInput, value: string) => {
    setMarket((prevMarket) => ({ ...prevMarket, [field]: value }));
  };

  const addMarketApiCall = async (payload: AddMarketApiPayload) => {
    // marketGroupAddress is now part of the URL
    const apiUrl = `${process.env.NEXT_PUBLIC_FOIL_API_URL || ''}/create-market-group/${marketGroupAddress}/markets`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), // Send the payload directly
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to add market');
    }
    return response.json();
  };

  const { mutate: addMarket, isPending: isAddingMarket } = useMutation<
    unknown, // Expected success response type
    Error, // Error type
    AddMarketApiPayload // Variables type for the mutation
  >({
    mutationFn: addMarketApiCall,
    onSuccess: () => {
      toast({
        title: 'Market Added',
        description: 'The new market has been successfully added.',
      });
      // Invalidate queries related to markets for this specific market group
      queryClient.invalidateQueries({
        queryKey: ['markets', marketGroupAddress, chainId],
      });
      // Potentially invalidate the specific market group to update its market list
      queryClient.invalidateQueries({
        queryKey: ['marketGroup', marketGroupAddress, chainId],
      });
      // Also, general market groups list might be affected if it shows counts or similar
      queryClient.invalidateQueries({ queryKey: ['marketGroups'] });
      setOpen(false);
      setMarket(createEmptyMarket(Date.now())); // Reset form
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error Adding Market',
        description: error.message,
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prepare data for validation (excluding client-side 'id')
    const { id, ...marketDataToValidate } = market;
    const validationResult = marketApiSchema.safeParse(marketDataToValidate);

    if (!validationResult.success) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description:
          validationResult.error.errors[0]?.message || 'Invalid market data',
      });
      return;
    }

    const timestamp = Date.now();
    let signature: `0x${string}` | undefined;
    try {
      signature = await signMessageAsync({ message: ADMIN_AUTHENTICATE_MSG });
    } catch (signError) {
      console.error('Signature failed:', signError);
      toast({
        title: 'Signature Required',
        description: 'Failed to get user signature.',
        variant: 'destructive',
      });
      return;
    }

    if (!signature) return; // Should not happen if signMessageAsync throws on failure

    // Construct the payload for the new API structure
    const apiPayload: AddMarketApiPayload = {
      marketData: validationResult.data, // Use Zod validated data
      signature,
      signatureTimestamp: timestamp,
      chainId,
      // marketGroupAddress is sent via URL, no longer in payload body
    };

    addMarket(apiPayload);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Add Market
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            Add New Market to Group {marketGroupAddress}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 p-4">
          <MarketFormFields
            market={market}
            onMarketChange={handleMarketChange}
            isCompact
          />
          <Button type="submit" disabled={isAddingMarket} className="w-full">
            {isAddingMarket ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding...
              </>
            ) : (
              'Submit New Market'
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddMarketDialog;
