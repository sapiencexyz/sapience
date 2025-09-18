'use client';

import { Button, Input, Label } from '@sapience/ui';
// Removed Dialog imports; copy dialog is now a separate component
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
import { AlertCircle, Loader2, Plus, Trash } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isAddress } from 'viem';
import { useAccount, useChainId } from 'wagmi';
import { z } from 'zod';

import { FOCUS_AREAS } from '../../lib/constants/focusAreas';
import CopyMarketParametersDialog from './CopyMarketParametersDialog';
import MarketFormFields, { type MarketInput } from './MarketFormFields'; // Import shared form and type
import {
  DEFAULT_CHAIN_ID,
  DEFAULT_OWNER,
  DEFAULT_BOND_CURRENCY,
  DEFAULT_COLLATERAL_ASSET,
  DEFAULT_OPTIMISTIC_ORACLE,
  DEFAULT_UNISWAP_POS_MANAGER,
  DEFAULT_UNISWAP_SWAP_ROUTER,
  DEFAULT_UNISWAP_QUOTER,
  DEFAULT_FEE_RATE,
  DEFAULT_ASSERTION_LIVENESS,
  DEFAULT_BOND_AMOUNT,
  DEFAULT_MIN_TRADE_SIZE,
  DEFAULT_SQRT_PRICE,
  DEFAULT_MIN_PRICE_TICK,
  DEFAULT_MAX_PRICE_TICK,
  DEFAULT_FACTORY_ADDRESS,
  DEFAULT_BASE_TOKEN_NAME,
  DEFAULT_QUOTE_TOKEN_NAME,
} from './constants';
import { useResources } from '~/hooks/useResources';
import { useAdminApi } from '~/hooks/useAdminApi';

// API base URL resolved at call time via foilApi

// Default values for form fields moved to shared constants

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
  rules?: string;
  category: string;
  baseTokenName: string;
  quoteTokenName: string;
  factoryAddress: string;
  resourceId?: number;
  isCumulative?: boolean;
  isBridged?: boolean;
  markets: Omit<MarketInput, 'id'>[]; // Send markets without client-side id
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
    shortName: z.string().trim().optional(),
    optionName: z.string().trim().optional(), // Align with MarketInput type
    claimStatementYesOrNumeric: z
      .string()
      .trim()
      .min(1, 'Claim Statement is required'),
    claimStatementNo: z.string().trim().optional(),
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
    similarMarkets: z.array(z.string().url('Invalid URL format')).optional(),
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
    shortName: '',
    optionName: '',
    startTime: now.toString(),
    endTime: '', // Empty string - user must set this
    startingSqrtPriceX96: DEFAULT_SQRT_PRICE,
    baseAssetMinPriceTick: DEFAULT_MIN_PRICE_TICK,
    baseAssetMaxPriceTick: DEFAULT_MAX_PRICE_TICK,
    startingPrice: '0.5',
    lowTickPrice: '0.00009908435194807992',
    highTickPrice: '1',
    claimStatementYesOrNumeric: '',
    claimStatementNo: '',
    public: true,
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
    shortName: previousMarket.shortName || '',
    optionName: previousMarket.optionName || '', // Copy option name if it exists
    startTime: previousMarket.startTime, // Copy start time from previous market
    endTime: '', // Keep empty - user must set this
    startingSqrtPriceX96: previousMarket.startingSqrtPriceX96, // Copy pricing parameters
    baseAssetMinPriceTick: previousMarket.baseAssetMinPriceTick,
    baseAssetMaxPriceTick: previousMarket.baseAssetMaxPriceTick,
    startingPrice: previousMarket.startingPrice,
    lowTickPrice: previousMarket.lowTickPrice,
    highTickPrice: previousMarket.highTickPrice,
    claimStatementYesOrNumeric: previousMarket.claimStatementYesOrNumeric, // Copy claim statement
    claimStatementNo: previousMarket.claimStatementNo, // Copy claim statement
    public: previousMarket.public,
  };
};

const CreateMarketGroupForm = () => {
  const { address: connectedAddress } = useAccount();
  const currentChainId = useChainId();
  const { toast } = useToast();
  // Remove unused queryClient
  const { data: resources } = useResources();
  const router = useRouter();

  // Market group state
  const [chainId, setChainId] = useState<string>(DEFAULT_CHAIN_ID.toString());
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
  const [rules, setRules] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [isBridged, setIsBridged] = useState<boolean>(false);
  const [baseTokenName, setBaseTokenName] = useState<string>(
    DEFAULT_BASE_TOKEN_NAME
  );
  const [quoteTokenName, setQuoteTokenName] = useState<string>(
    DEFAULT_QUOTE_TOKEN_NAME
  );
  const [selectedResourceId, setSelectedResourceId] = useState<number | null>(
    null
  );
  const [isCumulative, setIsCumulative] = useState<boolean>(false);

  // Markets state (uses imported MarketInput)
  const [markets, setMarkets] = useState<MarketInput[]>([createEmptyMarket(1)]);

  // Form state
  const [formError, setFormError] = useState<string | null>(null);
  const [activeMarketIndex, setActiveMarketIndex] = useState<number>(0);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    // Generate nonce only on client side to prevent hydration mismatch
    setNonce(Math.floor(Math.random() * 1e18).toString());

    // Set owner based on chain and connected address after mounting
    const defaultOwner =
      currentChainId === DEFAULT_CHAIN_ID
        ? DEFAULT_OWNER
        : connectedAddress || '';
    setOwner(defaultOwner);
  }, [currentChainId, connectedAddress]);

  const { postJson } = useAdminApi();

  const handleMarketParamsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setMarketParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleMarketChange = (
    index: number,
    field: keyof MarketInput,
    value: string | boolean | string[]
  ) => {
    setMarkets((prevMarkets) => {
      const newMarkets = [...prevMarkets];
      // Ensure the market object exists at the index
      if (newMarkets[index]) {
        newMarkets[index] = {
          ...newMarkets[index],
          [field]: value as any,
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
      case 'rules':
        setRules(value || '');
        break;
      case 'category':
        setSelectedCategory(value);
        break;
      case 'resourceId':
        if (value === 'none') {
          setSelectedResourceId(null);
          // Update token names for Yes/No markets
          setBaseTokenName('Yes');
          setQuoteTokenName(DEFAULT_QUOTE_TOKEN_NAME);
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

    // Adjust activeMarketIndex
    if (activeMarketIndex >= index) {
      setActiveMarketIndex(Math.max(0, activeMarketIndex - 1));
    }
  };

  const validateFormData = (): string | null => {
    // Prepare markets for validation by removing client-side 'id'
    const marketsToValidate = markets.map(
      ({ id: _id, ...marketData }) => marketData
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
      isBridged,
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
    return postJson(`/marketGroups`, payload);
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
      // Create the payload (no signature in body; headers used)
      const payload: CreateCombinedPayload = {
        chainId,
        owner,
        collateralAsset,
        minTradeSize,
        marketParams,
        nonce,
        question,
        rules: rules || undefined,
        category: selectedCategory,
        baseTokenName,
        quoteTokenName,
        factoryAddress,
        resourceId: selectedResourceId || undefined,
        isCumulative: selectedResourceId ? isCumulative : undefined,
        isBridged,
        markets: markets.map(({ id: _id, ...market }) => market), // Remove client-side id
      };

      // Create the market group
      await createMarketGroup(payload); // eslint-disable-line @typescript-eslint/await-thenable

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
                    placeholder="Who will become the Mayor of NYC?"
                    required
                  />
                  <p className="text-sm text-muted-foreground">
                    Write a brief, clear question an AI can understand.
                  </p>
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
              {/* Base/Quote Token Names and Index (on one row) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Index Selection */}
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
                        setQuoteTokenName(DEFAULT_QUOTE_TOKEN_NAME);
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
                      <SelectItem value="none">None (Yes/No Market)</SelectItem>
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
              {/* Rules - full width, after index/base/quote token name */}
              <div className="space-y-2">
                <Label htmlFor="rules">Rules</Label>
                <textarea
                  id="rules"
                  className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  placeholder="This will be settled based on reporting from...."
                />
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
              <div className="flex flex-wrap items-center gap-2 mb-4">
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
                <button
                  type="button"
                  className="px-3 py-1 text-sm rounded flex items-center bg-secondary"
                  onClick={addMarket}
                >
                  <Plus className="h-3.5 w-3.5 mr-2" /> Add Market
                </button>
                <div className="ml-auto">
                  <CopyMarketParametersDialog
                    market={markets[activeMarketIndex]}
                    onMarketChange={(field, value) =>
                      handleMarketChange(activeMarketIndex, field, value)
                    }
                    onMarketGroupChange={handleMarketGroupChange}
                    onAdvancedConfigChange={handleAdvancedConfigChange}
                  />
                </div>
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
                        marketIndex={index}
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
                    {/* isBridged toggle */}
                    <div className="flex items-center gap-2 py-2">
                      <Label htmlFor="isBridged" className="font-medium">
                        Bridged
                      </Label>
                      <Switch
                        id="isBridged"
                        checked={isBridged}
                        onCheckedChange={setIsBridged}
                      />
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
        </div>
      )}
    </div>
  );
};

export default CreateMarketGroupForm;
