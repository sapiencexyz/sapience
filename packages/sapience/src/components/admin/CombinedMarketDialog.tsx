'use client';

import { Button, Input, Label, useResources } from '@sapience/ui';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@sapience/ui/components/ui/accordion';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@sapience/ui/components/ui/alert';
import { Card, CardContent } from '@sapience/ui/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/ui/components/ui/select';
import { Switch } from '@sapience/ui/components/ui/switch';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, Loader2, Plus, Trash, ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { isAddress } from 'viem';
import { useAccount, useChainId, useSignMessage } from 'wagmi';
import { z } from 'zod';

import {
  FOCUS_AREAS,
  DEFAULT_FOCUS_AREA,
} from '../../lib/constants/focusAreas';
import { ADMIN_AUTHENTICATE_MSG } from '~/lib/constants';

import MarketFormFields, { type MarketInput } from './MarketFormFields'; // Import shared form and type

// Use environment variable for API base URL, fallback to /api
const API_BASE_URL = process.env.NEXT_PUBLIC_FOIL_API_URL || '/api';

// Default values for form fields

const CAT_MEOW_FILE = '/cat-meow.mp3';
const BASE_CHAIN_ID = 8453;
const DEFAULT_BASE_OWNER = '0xdb5Af497A73620d881561eDb508012A5f84e9BA2';
const DEFAULT_BOND_CURRENCY = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const DEFAULT_COLLATERAL_ASSET = '0x5875eee11cf8398102fdad704c9e96607675467a';
const DEFAULT_OPTIMISTIC_ORACLE = '0xee6832F73862ABac4CC87bE58B4A949edd8533F7';
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
const DEFAULT_FACTORY_ADDRESS = '0x2492c9d2955448181a3CD2a3d5207714949ED0f6';

// Type definitions (MarketInput is now imported)
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

// MarketInput is imported, remove local definition
// interface MarketInput { ... }

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
  markets: Omit<MarketInput, 'id'>[]; // Send markets without client-side id
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

// Updated marketSchema to align with imported MarketInput for validation
// This schema is for individual market objects within the form.
const marketSchema = z
  .object({
    // id is client-side, not validated here for API payload
    marketQuestion: z.string().trim().min(1, 'Market Question is required'),
    optionName: z.string().trim().optional(), // Align with MarketInput type
    claimStatement: z.string().trim().min(1, 'Claim Statement is required'),
    startTime: z.coerce
      .number()
      .int()
      .nonnegative('Valid Start Time (>= 0) is required'),
    endTime: z.coerce
      .number()
      .int()
      .positive('Valid End Time (> 0) is required'),
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
    rules: z.string().optional(), // Align with MarketInput type
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
  markets: z.array(marketSchema).min(1, 'At least one market is required'), // Validates array of market objects
});

// Create empty market template using imported MarketInput type
const createEmptyMarket = (id: number): MarketInput => {
  const now = Math.floor(Date.now() / 1000);
  return {
    id, // For client-side list key and management
    marketQuestion: '',
    optionName: '',
    startTime: now.toString(),
    endTime: '', // Empty string - user must set this
    startingSqrtPriceX96: DEFAULT_SQRT_PRICE,
    baseAssetMinPriceTick: DEFAULT_MIN_PRICE_TICK,
    baseAssetMaxPriceTick: DEFAULT_MAX_PRICE_TICK,
    startingPrice: '0.5',
    lowTickPrice: '0.00009908435194807992',
    highTickPrice: '1',
    claimStatement: '',
    rules: '', // Initialize optional field
  };
};

// Create a new market with parameters copied from the previous market
const createMarketFromPrevious = (
  id: number,
  previousMarket: MarketInput
): MarketInput => {
  return {
    id,
    marketQuestion: previousMarket.marketQuestion, // Copy market question
    optionName: previousMarket.optionName || '', // Copy option name if it exists
    startTime: previousMarket.startTime, // Copy start time from previous market
    endTime: '', // Keep empty - user must set this
    startingSqrtPriceX96: previousMarket.startingSqrtPriceX96, // Copy pricing parameters
    baseAssetMinPriceTick: previousMarket.baseAssetMinPriceTick,
    baseAssetMaxPriceTick: previousMarket.baseAssetMaxPriceTick,
    startingPrice: previousMarket.startingPrice,
    lowTickPrice: previousMarket.lowTickPrice,
    highTickPrice: previousMarket.highTickPrice,
    claimStatement: previousMarket.claimStatement, // Copy claim statement
    rules: previousMarket.rules || '', // Copy rules if they exist
  };
};

const CombinedMarketDialog = () => {
  const { address: connectedAddress } = useAccount();
  const currentChainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const { toast } = useToast();
  // Remove unused queryClient
  const { data: resources } = useResources();
  const router = useRouter();

  // Market group state
  const [chainId, setChainId] = useState<string>('8453');
  const [factoryAddress, setFactoryAddress] = useState<string>(
    DEFAULT_FACTORY_ADDRESS
  );
  const [owner, setOwner] = useState<string>('');
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

  // Markets state (uses imported MarketInput)
  const [markets, setMarkets] = useState<MarketInput[]>([createEmptyMarket(1)]);
  const [marketsWithCopiedParams, setMarketsWithCopiedParams] = useState<
    Set<number>
  >(new Set());

  // Form state
  const [formError, setFormError] = useState<string | null>(null);
  const [activeMarketIndex, setActiveMarketIndex] = useState<number>(0);
  const [isMounted, setIsMounted] = useState(false);

  const [showCat, setShowCat] = useState(true);

  useEffect(() => {
    setIsMounted(true);
    // Generate nonce only on client side to prevent hydration mismatch
    setNonce(Math.floor(Math.random() * 1e18).toString());

    // Set owner based on chain and connected address after mounting
    const defaultOwner =
      currentChainId === BASE_CHAIN_ID
        ? DEFAULT_BASE_OWNER
        : connectedAddress || '';
    setOwner(defaultOwner);
  }, [currentChainId, connectedAddress]);

  const handleMarketParamsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setMarketParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleMarketChange = (
    index: number,
    field: keyof MarketInput,
    value: string
  ) => {
    setMarkets((prevMarkets) => {
      const newMarkets = [...prevMarkets];
      // Ensure the market object exists at the index
      if (newMarkets[index]) {
        newMarkets[index] = {
          ...newMarkets[index],
          [field]: value,
        };
      } else {
        // This case should ideally not happen if IDs are managed correctly
        console.warn(`Market at index ${index} not found during update.`);
      }
      return newMarkets;
    });
  };

  // Handler for market group level changes (when copying from existing markets)
  const handleMarketGroupChange = (field: string, value: string) => {
    switch (field) {
      case 'question':
        setQuestion(value);
        break;
      case 'category':
        setSelectedCategory(value);
        break;
      case 'resourceId':
        if (value === 'none') {
          setSelectedResourceId(null);
          // Update token names for Yes/No markets
          setBaseTokenName('Yes');
          setQuoteTokenName('sUSDS');
        } else {
          setSelectedResourceId(Number(value));
          // Clear token names for indexed markets
          setBaseTokenName('');
          setQuoteTokenName('');
        }
        break;
      case 'baseTokenName':
        setBaseTokenName(value);
        break;
      case 'quoteTokenName':
        setQuoteTokenName(value);
        break;
      default:
        console.warn(`Unknown market group field: ${field}`);
    }
  };

  // Handler for advanced configuration changes (when copying from existing markets)
  const handleAdvancedConfigChange = (field: string, value: string) => {
    switch (field) {
      case 'chainId':
        setChainId(value);
        break;
      case 'factoryAddress':
        setFactoryAddress(value);
        break;
      case 'owner':
        setOwner(value);
        break;
      case 'collateralAsset':
        setCollateralAsset(value);
        break;
      case 'minTradeSize':
        setMinTradeSize(value);
        break;
      case 'feeRate':
      case 'assertionLiveness':
      case 'bondAmount':
      case 'bondCurrency':
      case 'uniswapPositionManager':
      case 'uniswapSwapRouter':
      case 'uniswapQuoter':
      case 'optimisticOracleV3':
        setMarketParams((prev) => ({ ...prev, [field]: value }));
        break;
      default:
        console.warn(`Unknown advanced config field: ${field}`);
    }
  };

  const addMarket = () => {
    // Use a unique ID, e.g., timestamp or incrementing number if more robust generation is needed
    const newMarketId =
      markets.length > 0 ? Math.max(...markets.map((m) => m.id)) + 1 : 1;

    setMarkets((prevMarkets) => {
      const newMarket =
        prevMarkets.length > 0
          ? createMarketFromPrevious(
              newMarketId,
              prevMarkets[prevMarkets.length - 1]
            )
          : createEmptyMarket(newMarketId);

      return [...prevMarkets, newMarket];
    });

    // Track that this market has copied parameters (if there was a previous market)
    if (markets.length > 0) {
      setMarketsWithCopiedParams(
        (prev) => new Set([...Array.from(prev), newMarketId])
      );
    }

    setActiveMarketIndex(markets.length); // Set active to the new market
  };

  const removeMarket = (index: number) => {
    if (markets.length <= 1) return;

    setMarkets((prevMarkets) => {
      // Reassign sequential IDs if necessary or keep original unique IDs
      // For now, keeping original unique IDs is simpler after filtering.
      // If sequential IDs (1, 2, 3...) are strictly needed after removal, map them:
      // return newMarkets.map((market, i) => ({ ...market, id: i + 1 }));
      return prevMarkets.filter((_, i) => i !== index);
    });

    // Clean up tracking of copied parameters for the removed market
    setMarketsWithCopiedParams((prev) => {
      const newSet = new Set(Array.from(prev));
      const removedMarketId = markets[index]?.id;
      if (removedMarketId) {
        newSet.delete(removedMarketId);
      }
      return newSet;
    });

    // Adjust activeMarketIndex
    if (activeMarketIndex >= index) {
      setActiveMarketIndex(Math.max(0, activeMarketIndex - 1));
    }
  };

  const validateFormData = (): string | null => {
    // Prepare markets for validation by removing client-side 'id'
    const marketsToValidate = markets.map(
      ({ id, ...marketData }) => marketData
    );

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
      ...(selectedResourceId && {
        resourceId: selectedResourceId,
        isCumulative,
      }),
      markets: marketsToValidate, // Use the version without 'id'
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
    const response = await fetch(`${API_BASE_URL}/create-market-group`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    CreateCombinedPayload,
    unknown
  >({
    mutationFn: createCombinedMarketGroup,
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Market group created successfully!',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    const validationError = validateFormData();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    if (!connectedAddress) {
      setFormError('Please connect your wallet to create a market group');
      return;
    }

    try {
      // Generate signature timestamp
      const signatureTimestamp = Math.floor(Date.now() / 1000);

      // Create the payload
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
        resourceId: selectedResourceId || undefined,
        isCumulative: selectedResourceId ? isCumulative : undefined,
        markets: markets.map(({ id, ...market }) => market), // Remove client-side id
        signature: undefined, // Will be set after signing
        signatureTimestamp,
      };

      // Sign the message
      const message = ADMIN_AUTHENTICATE_MSG;
      const signature = await signMessageAsync({ message });

      if (!signature) {
        setFormError('Failed to sign message');
        return;
      }

      // Add signature to payload
      payload.signature = signature;

      // Create the market group
      await createMarketGroup(payload);

      // Play success sound
      const audio = new Audio(CAT_MEOW_FILE);
      audio.play().catch((audioError) => {
        console.log(
          'Error playing audio, playing a beep sound instead',
          audioError
        );
        // Fallback: create a simple success beep
        const context = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext)();
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(context.destination);

        oscillator.frequency.setValueAtTime(1000, context.currentTime);
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
          0.01,
          context.currentTime + 0.5
        );

        oscillator.start(context.currentTime);
        oscillator.stop(context.currentTime + 0.5);
      });

      // Navigate back to admin page
      router.push('/admin');
    } catch (error) {
      console.error('Error creating market group:', error);
      setFormError(
        error instanceof Error ? error.message : 'Failed to create market group'
      );
    }
  };

  return (
    <div>
      {!isMounted ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="relative">
          {/* Form - takes full width */}
          <form onSubmit={handleSubmit} className="space-y-6 p-1">
            {/* Back Button */}
            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/admin')}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Admin
              </Button>
            </div>

            {/* Market Group Details Section - remains largely the same */}
            <div className="space-y-4">
              {/* Market Group Question */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="marketGroupQuestion">
                    Market Group Question
                  </Label>
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
              </div>
              {/* Resource Selection */}
              <div className="space-y-2">
                <Label htmlFor="resource">Index</Label>
                <Select
                  value={selectedResourceId?.toString() || 'none'}
                  onValueChange={(value) => {
                    const newResourceId =
                      value !== 'none' ? parseInt(value, 10) : null;
                    setSelectedResourceId(newResourceId);
                    // Update token names based on resource selection
                    if (newResourceId === null) {
                      setBaseTokenName('Yes');
                      setQuoteTokenName('sUSDS');
                    } else {
                      setBaseTokenName('');
                      setQuoteTokenName('');
                    }
                  }}
                >
                  <SelectTrigger id="resource">
                    <SelectValue placeholder="Select a resource (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Yes/No)</SelectItem>
                    {resources?.map((resource) => (
                      <SelectItem
                        key={resource.id}
                        value={resource.id.toString()}
                      >
                        {resource.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Base Token Name Input */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="baseTokenName">Base Token Name</Label>
                  <Input
                    id="baseTokenName"
                    type="text"
                    value={baseTokenName}
                    onChange={(e) => setBaseTokenName(e.target.value)}
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
                    required
                  />
                </div>
              </div>
              {/* isCumulative toggle */}
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
            </div>

            {/* Markets Section - Refactored to use MarketFormFields */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Markets</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addMarket}
                >
                  <Plus className="h-4 w-4 mr-2" /> Add Market
                </Button>
              </div>

              {markets.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  💡 New markets will copy all parameters from the previous
                  market including market question, claim statement, pricing
                  parameters, rules, and option names. You&apos;ll still need to
                  set the end time for each market.
                </p>
              )}

              <div className="flex flex-wrap gap-2 mb-4">
                {markets.map((market, index) => (
                  <button
                    key={market.id} // Use market.id for key
                    type="button"
                    className={`px-3 py-1 text-sm rounded flex items-center ${
                      activeMarketIndex === index
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary'
                    }`}
                    onClick={() => setActiveMarketIndex(index)}
                  >
                    Market {index + 1} {/* Display 1-based index for user */}
                    {marketsWithCopiedParams.has(market.id) && (
                      <span
                        className="ml-1 text-xs opacity-70"
                        title="Parameters copied from previous market"
                      >
                        📋
                      </span>
                    )}
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

              {markets.map((market, index) => (
                <div
                  key={market.id}
                  className={activeMarketIndex === index ? 'block' : 'hidden'}
                >
                  <Card>
                    <CardContent>
                      <MarketFormFields
                        market={market}
                        onMarketChange={(field, value) =>
                          handleMarketChange(index, field, value)
                        }
                        marketIndex={index} // Pass index for unique field IDs
                        onMarketGroupChange={handleMarketGroupChange}
                        onAdvancedConfigChange={handleAdvancedConfigChange}
                      />
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>

            {/* Advanced Market Group Configuration */}
            <div className="space-y-4">
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
                        <Label htmlFor="collateralAsset">
                          Collateral Asset
                        </Label>
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
                        <Label htmlFor="minTradeSize">
                          Min Trade Size (Units)
                        </Label>
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
                          const inputModeType = isNumericInput
                            ? 'numeric'
                            : 'text';
                          let placeholderText = '0x...';
                          if (
                            key.includes('Amount') ||
                            key.includes('Liveness')
                          )
                            placeholderText = 'e.g., 100...';
                          else if (key.includes('Rate'))
                            placeholderText = 'e.g., 3000';
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

            <div className="mt-6">
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{' '}
                Submit Market Group & Markets
              </Button>
            </div>

            {formError && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
          </form>

          {/* Cat Picture - absolutely positioned in the whitespace on the right, with toggle always visible below */}
          <div className="hidden md:block">
            <div className="fixed right-12 top-32 z-20 w-80 flex flex-col justify-center items-center">
              {showCat && (
                <div>
                  <Image
                    src="/cat.png"
                    width={320}
                    height={320}
                    alt="A cute cat"
                    className="w-full h-auto rounded-lg shadow-lg cursor-pointer hover:scale-105 transition-transform"
                    onClick={() => {
                      // Using local cat meow sound file
                      const audio = new Audio(CAT_MEOW_FILE);
                      audio.play().catch((audioError) => {
                        console.log('Error playing audio', audioError);
                        // Fallback: create a simple beep sound
                        const context = new (window.AudioContext ||
                          (
                            window as unknown as {
                              webkitAudioContext: typeof AudioContext;
                            }
                          ).webkitAudioContext)();
                        const oscillator = context.createOscillator();
                        const gainNode = context.createGain();

                        oscillator.connect(gainNode);
                        gainNode.connect(context.destination);

                        oscillator.frequency.setValueAtTime(
                          800,
                          context.currentTime
                        );
                        oscillator.type = 'sine';

                        gainNode.gain.setValueAtTime(0.3, context.currentTime);
                        gainNode.gain.exponentialRampToValueAtTime(
                          0.01,
                          context.currentTime + 0.3
                        );

                        oscillator.start(context.currentTime);
                        oscillator.stop(context.currentTime + 0.3);
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        // Trigger the same click handler
                        const audio = new Audio(CAT_MEOW_FILE);
                        audio.play().catch((audioError) => {
                          console.log('Error playing audio', audioError);
                          // Fallback: create a simple beep sound
                          const context = new (window.AudioContext ||
                            (
                              window as unknown as {
                                webkitAudioContext: typeof AudioContext;
                              }
                            ).webkitAudioContext)();
                          const oscillator = context.createOscillator();
                          const gainNode = context.createGain();

                          oscillator.connect(gainNode);
                          gainNode.connect(context.destination);

                          oscillator.frequency.setValueAtTime(
                            800,
                            context.currentTime
                          );
                          oscillator.type = 'sine';

                          gainNode.gain.setValueAtTime(
                            0.3,
                            context.currentTime
                          );
                          gainNode.gain.exponentialRampToValueAtTime(
                            0.01,
                            context.currentTime + 0.3
                          );

                          oscillator.start(context.currentTime);
                          oscillator.stop(context.currentTime + 0.3);
                        });
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label="Click to hear cat meow sound"
                  />
                  <p className="text-sm text-muted-foreground mt-2 text-center">
                    🐱 Your friendly companion (pet it!)
                  </p>
                </div>
              )}
              {/* Show Cat Toggle always visible under the image/caption */}
              <div className="flex items-center gap-2 mt-4">
                <Label
                  htmlFor="show-cat"
                  className="text-sm font-medium select-none cursor-pointer"
                >
                  Show Cat
                </Label>
                <Switch
                  id="show-cat"
                  checked={showCat}
                  onCheckedChange={setShowCat}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CombinedMarketDialog;
