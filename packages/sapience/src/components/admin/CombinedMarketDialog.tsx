'use client';

import { Button, Input, Label, useResources } from '@foil/ui';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@foil/ui/components/ui/accordion';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@foil/ui/components/ui/alert';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@foil/ui/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@foil/ui/components/ui/select';
import { Switch } from '@foil/ui/components/ui/switch';
import { useToast } from '@foil/ui/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, Plus, Trash } from 'lucide-react';
import { useState, useEffect } from 'react';
import { isAddress } from 'viem';
import { useAccount, useChainId, useSignMessage } from 'wagmi';
import { z } from 'zod';

import {
  FOCUS_AREAS,
  DEFAULT_FOCUS_AREA,
} from '../../lib/constants/focusAreas';
import { ADMIN_AUTHENTICATE_MSG } from '~/lib/constants';

// Use environment variable for API base URL, fallback to /api
const API_BASE_URL = process.env.NEXT_PUBLIC_FOIL_API_URL || '/api';

// Default values for form fields
const BASE_CHAIN_ID = 8453;
const DEFAULT_BASE_OWNER = '0xdb5Af497A73620d881561eDb508012A5f84e9BA2';
const DEFAULT_BOND_CURRENCY = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const DEFAULT_COLLATERAL_ASSET = '0x5875eee11cf8398102fdad704c9e96607675467a';
const DEFAULT_OPTIMISTIC_ORACLE = '0x2aBf1Bd76655de80eDB3086114315Eec75AF500c';
const DEFAULT_UNISWAP_POS_MANAGER =
  '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';
const DEFAULT_UNISWAP_SWAP_ROUTER =
  '0xAf5ead464aFFB12dD4CDFB98c9D2C490194FE5d0';
const DEFAULT_UNISWAP_QUOTER = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a';
const DEFAULT_FEE_RATE = '10000'; // 1%
const DEFAULT_ASSERTION_LIVENESS = '7200';
const DEFAULT_BOND_AMOUNT = '500000000';
const DEFAULT_MIN_TRADE_SIZE = '10000';
const DEFAULT_SQRT_PRICE = '56022770974786143748341366784';
const DEFAULT_MIN_PRICE_TICK = '-92200';
const DEFAULT_MAX_PRICE_TICK = '0';
const DEFAULT_FACTORY_ADDRESS = '0x5d9aAECe6Af4FfFC5Dca37a753339Ef440B6Be37';

// Type definitions
interface MarketParamsInput {
  feeRate: string;
  assertionLiveness: string;
  bondAmount: string;
  bondCurrency: string;
  uniswapPositionManager: string;
  uniswapSwapRouter: string;
  uniswapQuoter: string;
  optimisticOracleV3: string;
}

interface MarketInput {
  id: number;
  marketQuestion: string;
  optionName: string;
  startTime: string;
  endTime: string;
  startingSqrtPriceX96: string;
  baseAssetMinPriceTick: string;
  baseAssetMaxPriceTick: string;
  claimStatement: string;
}

interface CreateCombinedPayload {
  chainId: string;
  owner: string;
  collateralAsset: string;
  minTradeSize: string;
  marketParams: MarketParamsInput;
  nonce: string;
  question: string;
  category: string;
  baseTokenName: string;
  quoteTokenName: string;
  factoryAddress: string;
  resourceId?: number;
  isCumulative?: boolean;
  markets: MarketInput[];
  signature: `0x${string}` | undefined;
  signatureTimestamp: number;
}

// Zod validation schemas
const marketParamsSchema = z.object({
  feeRate: z.coerce.number().int('Invalid Fee Rate (must be an integer)'),
  assertionLiveness: z.string().refine((val) => {
    try {
      BigInt(val);
      return true;
    } catch {
      return false;
    }
  }, 'Invalid Assertion Liveness (must be a large integer)'),
  bondAmount: z.string().refine((val) => {
    try {
      BigInt(val);
      return true;
    } catch {
      return false;
    }
  }, 'Invalid Bond Amount (must be a large integer)'),
  bondCurrency: z.string().refine(isAddress, 'Invalid Bond Currency Address'),
  uniswapPositionManager: z
    .string()
    .refine(isAddress, 'Invalid Uniswap Position Manager Address'),
  uniswapSwapRouter: z
    .string()
    .refine(isAddress, 'Invalid Uniswap Swap Router Address'),
  uniswapQuoter: z.string().refine(isAddress, 'Invalid Uniswap Quoter Address'),
  optimisticOracleV3: z
    .string()
    .refine(isAddress, 'Invalid Optimistic Oracle V3 Address'),
});

const marketSchema = z
  .object({
    marketQuestion: z.string().trim().min(1, 'Market Question is required'),
    optionName: z.string().trim().optional(),
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
  })
  .refine((data) => data.endTime > data.startTime, {
    message: 'End Time must be after Start Time',
    path: ['endTime'],
  })
  .refine((data) => data.baseAssetMaxPriceTick > data.baseAssetMinPriceTick, {
    message: 'Max Price Tick must be greater than Min Price Tick',
    path: ['baseAssetMaxPriceTick'],
  });

const baseSchema = z.object({
  owner: z.string().refine(isAddress, 'Invalid Owner Address'),
  collateralAsset: z
    .string()
    .refine(isAddress, 'Invalid Collateral Asset Address'),
  minTradeSize: z.string().refine((val) => {
    try {
      BigInt(val);
      return true;
    } catch {
      return false;
    }
  }, 'Invalid Min Trade Size (must be a large integer)'),
  nonce: z.string().refine((val) => {
    try {
      BigInt(val);
      return true;
    } catch {
      return false;
    }
  }, 'Invalid Nonce (must be a large integer)'),
  marketParams: marketParamsSchema,
});

const combinedSchema = baseSchema.extend({
  chainId: z.coerce
    .number()
    .int()
    .positive('Chain ID must be a positive integer'),
  question: z.string().trim().min(1, 'Market Group Question is required'),
  category: z.string().min(1, 'Category is required'),
  baseTokenName: z.string().trim().min(1, 'Base Token Name is required'),
  quoteTokenName: z.string().trim().min(1, 'Quote Token Name is required'),
  factoryAddress: z.string().refine(isAddress, 'Invalid Factory Address'),
  resourceId: z.number().optional(),
  isCumulative: z.boolean().optional(),
  markets: z.array(marketSchema).min(1, 'At least one market is required'),
});

// Create empty market template
const createEmptyMarket = (id: number): MarketInput => {
  const now = Math.floor(Date.now() / 1000);
  return {
    id,
    marketQuestion: '',
    optionName: '',
    startTime: now.toString(),
    endTime: (now + 28 * 24 * 60 * 60).toString(),
    startingSqrtPriceX96: DEFAULT_SQRT_PRICE,
    baseAssetMinPriceTick: DEFAULT_MIN_PRICE_TICK,
    baseAssetMaxPriceTick: DEFAULT_MAX_PRICE_TICK,
    claimStatement: '',
  };
};

interface CombinedMarketDialogProps {
  onClose?: () => void;
}

const CombinedMarketDialog = ({ onClose }: CombinedMarketDialogProps) => {
  const { address: connectedAddress } = useAccount();
  const currentChainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: resources } = useResources();

  // Market group state
  const [chainId, setChainId] = useState<string>('8453');
  const [factoryAddress, setFactoryAddress] = useState<string>(
    DEFAULT_FACTORY_ADDRESS
  );
  const [owner, setOwner] = useState<string>(
    currentChainId === BASE_CHAIN_ID
      ? DEFAULT_BASE_OWNER
      : connectedAddress || ''
  );
  const [collateralAsset, setCollateralAsset] = useState<string>(
    DEFAULT_COLLATERAL_ASSET
  );
  const [minTradeSize, setMinTradeSize] = useState<string>(
    DEFAULT_MIN_TRADE_SIZE
  );
  const [nonce, setNonce] = useState<string>('');
  const [marketParams, setMarketParams] = useState<MarketParamsInput>({
    feeRate: DEFAULT_FEE_RATE,
    assertionLiveness: DEFAULT_ASSERTION_LIVENESS,
    bondAmount: DEFAULT_BOND_AMOUNT,
    bondCurrency: DEFAULT_BOND_CURRENCY,
    uniswapPositionManager: DEFAULT_UNISWAP_POS_MANAGER,
    uniswapSwapRouter: DEFAULT_UNISWAP_SWAP_ROUTER,
    uniswapQuoter: DEFAULT_UNISWAP_QUOTER,
    optimisticOracleV3: DEFAULT_OPTIMISTIC_ORACLE,
  });
  const [question, setQuestion] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>(
    DEFAULT_FOCUS_AREA.id
  );
  const [baseTokenName, setBaseTokenName] = useState<string>('Yes');
  const [quoteTokenName, setQuoteTokenName] = useState<string>('sUSDS');
  const [selectedResourceId, setSelectedResourceId] = useState<number | null>(
    null
  );
  const [isCumulative, setIsCumulative] = useState<boolean>(false);

  // Markets state
  const [markets, setMarkets] = useState<MarketInput[]>([createEmptyMarket(1)]);

  // Form state
  const [formError, setFormError] = useState<string | null>(null);
  const [activeMarketIndex, setActiveMarketIndex] = useState<number>(0);

  // Initialize nonce on component mount
  useEffect(() => {
    setNonce(Math.floor(Math.random() * 1e18).toString());
  }, []);

  // Update owner if network changes
  useEffect(() => {
    const isOwnerDefaultForCurrentChain =
      owner ===
      (currentChainId === BASE_CHAIN_ID
        ? DEFAULT_BASE_OWNER
        : connectedAddress || '');
    const isOwnerDefaultForNewChain =
      owner ===
      (Number(currentChainId) === BASE_CHAIN_ID
        ? DEFAULT_BASE_OWNER
        : connectedAddress || '');

    if (isOwnerDefaultForNewChain || isOwnerDefaultForCurrentChain) {
      setOwner(
        Number(currentChainId) === BASE_CHAIN_ID
          ? DEFAULT_BASE_OWNER
          : connectedAddress || ''
      );
    }
  }, [currentChainId, connectedAddress, owner]);

  // Handle market params changes
  const handleMarketParamsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setMarketParams((prev) => ({ ...prev, [name]: value }));
  };

  // Handle market changes
  const handleMarketChange = (
    index: number,
    field: keyof MarketInput,
    value: string
  ) => {
    setMarkets((prevMarkets) => {
      const newMarkets = [...prevMarkets];
      newMarkets[index] = {
        ...newMarkets[index],
        [field]: value,
      };
      return newMarkets;
    });
  };

  // Add a new market
  const addMarket = () => {
    setMarkets((prevMarkets) => [
      ...prevMarkets,
      createEmptyMarket(prevMarkets.length + 1),
    ]);
    setActiveMarketIndex(markets.length);
  };

  // Remove a market
  const removeMarket = (index: number) => {
    if (markets.length <= 1) return;

    setMarkets((prevMarkets) => {
      const newMarkets = prevMarkets.filter((_, i) => i !== index);
      // Reassign IDs
      return newMarkets.map((market, i) => ({ ...market, id: i + 1 }));
    });

    if (activeMarketIndex >= index && activeMarketIndex > 0) {
      setActiveMarketIndex(activeMarketIndex - 1);
    }
  };

  // Validate form data
  const validateFormData = (): string | null => {
    const formData = {
      owner,
      collateralAsset,
      minTradeSize,
      marketParams,
      nonce,
      factoryAddress,
      chainId,
      question,
      category: selectedCategory,
      baseTokenName,
      quoteTokenName,
      ...(selectedResourceId
        ? {
            resourceId: selectedResourceId,
            isCumulative,
          }
        : {}),
      markets,
    };

    try {
      combinedSchema.parse(formData);
      return null;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return error.errors[0]?.message || 'Validation failed';
      }
      console.error('Unexpected validation error:', error);
      return 'An unexpected validation error occurred.';
    }
  };

  const createCombinedMarketGroup = async (payload: CreateCombinedPayload) => {
    // Call the API endpoint
    const response = await fetch(`${API_BASE_URL}/create-market-group`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || 'Failed to create market group and markets'
      );
    }

    return data;
  };

  const { mutate: createMarketGroup, isPending } = useMutation<
    unknown,
    Error,
    CreateCombinedPayload
  >({
    mutationFn: createCombinedMarketGroup,
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Market Group and Markets created successfully.',
        variant: 'default',
      });
      queryClient.invalidateQueries({ queryKey: ['marketGroups'] });
      onClose?.(); // Close the dialog on success
    },
    onError: (error: Error) => {
      console.error('Error creating market group:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'An unknown error occurred',
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    const validationError = validateFormData();
    if (validationError) {
      setFormError(validationError);
      toast({
        title: 'Validation Error',
        description: validationError,
        variant: 'destructive',
      });
      return;
    }

    // Generate signature
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

    // Prepare payload
    const payload: CreateCombinedPayload = {
      chainId,
      owner,
      collateralAsset,
      minTradeSize,
      marketParams,
      nonce,
      question,
      category: selectedCategory,
      baseTokenName,
      quoteTokenName,
      factoryAddress,
      ...(selectedResourceId
        ? {
            resourceId: selectedResourceId,
            isCumulative,
          }
        : {}),
      markets: markets.map((m, index) => ({ ...m, id: index + 1 })), // Ensure market ID is set correctly
      signature,
      signatureTimestamp: timestamp,
    };

    createMarketGroup(payload);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 overflow-y-auto max-h-[85vh] p-1"
    >
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Market Group Details</h3>

        {/* Market Group Question */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="marketGroupQuestion">Market Group Question</Label>
            <Input
              id="marketGroupQuestion"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Enter the main question for the market group"
              required
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={selectedCategory}
              onValueChange={setSelectedCategory}
            >
              <SelectTrigger id="category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {FOCUS_AREAS.map((area) => (
                  <SelectItem key={area.id} value={area.id}>
                    {area.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Base Token Name Input */}
          <div className="space-y-2">
            <Label htmlFor="baseTokenName">Base Token Name</Label>
            <Input
              id="baseTokenName"
              type="text"
              value={baseTokenName}
              onChange={(e) => setBaseTokenName(e.target.value)}
              placeholder="Yes"
              required
            />
          </div>

          {/* Quote Token Name Input */}
          <div className="space-y-2">
            <Label htmlFor="quoteTokenName">Quote Token Name</Label>
            <Input
              id="quoteTokenName"
              type="text"
              value={quoteTokenName}
              onChange={(e) => setQuoteTokenName(e.target.value)}
              placeholder="sUSDS"
              required
            />
          </div>
        </div>

        {/* Resource Selection - Full width, under token names */}
        <div className="space-y-2">
          <Label htmlFor="resource">Index</Label>
          <Select
            value={selectedResourceId?.toString() || 'none'}
            onValueChange={(value) =>
              setSelectedResourceId(
                value !== 'none' ? parseInt(value, 10) : null
              )
            }
          >
            <SelectTrigger id="resource">
              <SelectValue placeholder="Select a resource (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {resources?.map((resource) => (
                <SelectItem key={resource.id} value={resource.id.toString()}>
                  {resource.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* isCumulative toggle - only shown when a resource is selected */}
        {selectedResourceId && (
          <div className="flex items-center gap-2 py-2">
            <Label htmlFor="isCumulative" className="font-medium">
              Cumulative
            </Label>
            <Switch
              id="isCumulative"
              checked={isCumulative}
              onCheckedChange={setIsCumulative}
            />
          </div>
        )}

        {/* Market Group Configuration */}
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="details">
            <AccordionTrigger>
              Advanced Market Group Configuration
            </AccordionTrigger>
            <AccordionContent className="space-y-6 pt-4">
              {/* Chain ID and Factory Address */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="chainId">Chain ID</Label>
                  <Input
                    id="chainId"
                    type="number"
                    value={chainId}
                    onChange={(e) => setChainId(e.target.value)}
                    placeholder="e.g., 1"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="factoryAddress">Factory Address</Label>
                  <Input
                    id="factoryAddress"
                    type="text"
                    value={factoryAddress}
                    onChange={(e) => setFactoryAddress(e.target.value)}
                    placeholder="0x..."
                    required
                  />
                </div>
              </div>

              {/* Owner, Nonce, Collateral Asset, Min Trade Size */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="owner">Owner</Label>
                  <Input
                    id="owner"
                    type="text"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    placeholder="0x..."
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nonce">Nonce</Label>
                  <Input
                    id="nonce"
                    type="text"
                    value={nonce}
                    onChange={(e) => setNonce(e.target.value)}
                    placeholder="Random nonce value"
                    required
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="collateralAsset">Collateral Asset</Label>
                  <Input
                    id="collateralAsset"
                    type="text"
                    value={collateralAsset}
                    onChange={(e) => setCollateralAsset(e.target.value)}
                    placeholder="0x..."
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="minTradeSize">Min Trade Size (Units)</Label>
                  <Input
                    id="minTradeSize"
                    type="text"
                    value={minTradeSize}
                    onChange={(e) => setMinTradeSize(e.target.value)}
                    placeholder="e.g., 1000000000000000000"
                    required
                    inputMode="numeric"
                  />
                </div>
              </div>

              {/* Market Parameters */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4">
                  {Object.entries(marketParams).map(([key, value]) => {
                    const isNumericInput =
                      key === 'feeRate' ||
                      key === 'assertionLiveness' ||
                      key === 'bondAmount';
                    const inputType = isNumericInput ? 'number' : 'text';
                    const inputModeType = isNumericInput ? 'numeric' : 'text';

                    // Replace nested ternary with more readable code
                    let placeholderText = '0x...';
                    if (key.includes('Amount') || key.includes('Liveness')) {
                      placeholderText = 'e.g., 100...';
                    } else if (key.includes('Rate')) {
                      placeholderText = 'e.g., 3000';
                    }

                    return (
                      <div key={key} className="space-y-2">
                        <Label htmlFor={key} className="capitalize">
                          {key.replace(/([A-Z])/g, ' $1')}
                        </Label>
                        <Input
                          id={key}
                          type={inputType}
                          name={key}
                          value={value}
                          onChange={handleMarketParamsChange}
                          placeholder={placeholderText}
                          required
                          inputMode={inputModeType}
                          disabled={key === 'feeRate'}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Markets Section */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium">Markets</h3>
          <Button type="button" variant="outline" size="sm" onClick={addMarket}>
            <Plus className="h-4 w-4 mr-2" />
            Add Market
          </Button>
        </div>

        {/* Market Tabs */}
        <div className="flex flex-wrap gap-2 mb-4">
          {markets.map((market, index) => (
            <button
              key={index}
              type="button"
              className={`px-3 py-1 text-sm rounded-md flex items-center ${
                activeMarketIndex === index
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary'
              }`}
              onClick={() => setActiveMarketIndex(index)}
            >
              Market {market.id}
              {markets.length > 1 && (
                <Trash
                  className="h-3.5 w-3.5 ml-2 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeMarket(index);
                  }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Active Market Form */}
        {markets.map((market, index) => (
          <div
            key={index}
            className={`space-y-4 ${activeMarketIndex === index ? 'block' : 'hidden'}`}
          >
            <Card>
              <CardHeader>
                <CardTitle>Market {market.id} Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Market Question & Option Name */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor={`marketQuestion-${index}`}>
                      Market Question
                    </Label>
                    <Input
                      id={`marketQuestion-${index}`}
                      type="text"
                      value={market.marketQuestion}
                      onChange={(e) =>
                        handleMarketChange(
                          index,
                          'marketQuestion',
                          e.target.value
                        )
                      }
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor={`optionName-${index}`}>Option Name</Label>
                    <Input
                      id={`optionName-${index}`}
                      type="text"
                      value={market.optionName}
                      onChange={(e) =>
                        handleMarketChange(index, 'optionName', e.target.value)
                      }
                    />
                  </div>
                </div>

                {/* Claim Statement */}
                <div>
                  <Label htmlFor={`claimStatement-${index}`}>
                    Claim Statement
                  </Label>
                  <Input
                    id={`claimStatement-${index}`}
                    type="text"
                    value={market.claimStatement}
                    onChange={(e) =>
                      handleMarketChange(
                        index,
                        'claimStatement',
                        e.target.value
                      )
                    }
                    placeholder="e.g. The average cost of gas in June 2025 (represented in gwei with 18 decimals) is "
                    required
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    This will be followed by the settlement value in UMA.
                  </p>
                </div>

                {/* Start Time & End Time */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor={`startTime-${index}`}>
                      Start Time (Unix Timestamp)
                    </Label>
                    <Input
                      id={`startTime-${index}`}
                      type="number"
                      value={market.startTime}
                      onChange={(e) =>
                        handleMarketChange(index, 'startTime', e.target.value)
                      }
                      required
                      min="0"
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`endTime-${index}`}>
                      End Time (Unix Timestamp)
                    </Label>
                    <Input
                      id={`endTime-${index}`}
                      type="number"
                      value={market.endTime}
                      onChange={(e) =>
                        handleMarketChange(index, 'endTime', e.target.value)
                      }
                      required
                      min="0"
                      inputMode="numeric"
                    />
                  </div>
                </div>

                {/* Pricing Params */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor={`startingSqrtPriceX96-${index}`}>
                      Starting Sqrt Price X96
                    </Label>
                    <Input
                      id={`startingSqrtPriceX96-${index}`}
                      type="text"
                      value={market.startingSqrtPriceX96}
                      onChange={(e) =>
                        handleMarketChange(
                          index,
                          'startingSqrtPriceX96',
                          e.target.value
                        )
                      }
                      placeholder="e.g., 79228162514..."
                      required
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`baseAssetMinPriceTick-${index}`}>
                      Min Price Tick
                    </Label>
                    <Input
                      id={`baseAssetMinPriceTick-${index}`}
                      type="number"
                      value={market.baseAssetMinPriceTick}
                      onChange={(e) =>
                        handleMarketChange(
                          index,
                          'baseAssetMinPriceTick',
                          e.target.value
                        )
                      }
                      placeholder="e.g., -887220"
                      required
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`baseAssetMaxPriceTick-${index}`}>
                      Max Price Tick
                    </Label>
                    <Input
                      id={`baseAssetMaxPriceTick-${index}`}
                      type="number"
                      value={market.baseAssetMaxPriceTick}
                      onChange={(e) =>
                        handleMarketChange(
                          index,
                          'baseAssetMaxPriceTick',
                          e.target.value
                        )
                      }
                      placeholder="e.g., 887220"
                      required
                      inputMode="numeric"
                    />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end space-x-2">
                {index !== 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActiveMarketIndex(index - 1)}
                  >
                    Previous Market
                  </Button>
                )}
                {index !== markets.length - 1 && (
                  <Button
                    type="button"
                    onClick={() => setActiveMarketIndex(index + 1)}
                  >
                    Next Market
                  </Button>
                )}
              </CardFooter>
            </Card>
          </div>
        ))}
      </div>

      {/* Submit Button */}
      <div className="mt-6">
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit Market Group & Markets
        </Button>
      </div>

      {/* Status Messages */}
      <div className="space-y-4 mt-4">
        {formError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
      </div>
    </form>
  );
};

export default CombinedMarketDialog;
