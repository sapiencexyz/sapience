'use client';

import { Button, Input, Label } from '@foil/ui';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@foil/ui/components/ui/select';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import type React from 'react';
import { useState, useEffect } from 'react';
import { parseAbiItem, decodeEventLog, isAddress, zeroAddress } from 'viem'; // Import values separately
import type {
  // Keep type imports separate
  AbiEvent,
  Address,
} from 'viem';
import {
  useAccount,
  useChainId,
} from 'wagmi';
import { z } from 'zod'; // Import zod

// Import FOCUS_AREAS

import {
  FOCUS_AREAS,
  DEFAULT_FOCUS_AREA,
} from '../../lib/constants/focusAreas';

// --- Import useMutation ---

// Use root export for Button, Input, Label
// Use direct paths for Card, Alert, Separator as they aren't in root index.ts

// ABI for the MarketGroupFactory contract
const marketGroupFactoryAbi = [
  {
    type: 'function',
    name: 'cloneAndInitializeMarketGroup',
    inputs: [
      { name: 'owner', type: 'address', internalType: 'address' },
      { name: 'collateralAsset', type: 'address', internalType: 'address' },
      { name: 'feeCollectors', type: 'address[]', internalType: 'address[]' },
      { name: 'callbackRecipient', type: 'address', internalType: 'address' },
      { name: 'minTradeSize', type: 'uint256', internalType: 'uint256' },
      {
        name: 'marketParams',
        type: 'tuple',
        internalType: 'struct IFoilStructs.MarketParams',
        components: [
          { name: 'feeRate', type: 'uint24', internalType: 'uint24' },
          { name: 'assertionLiveness', type: 'uint64', internalType: 'uint64' },
          { name: 'bondAmount', type: 'uint256', internalType: 'uint256' },
          { name: 'bondCurrency', type: 'address', internalType: 'address' },
          {
            name: 'uniswapPositionManager',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'uniswapSwapRouter',
            type: 'address',
            internalType: 'address',
          },
          { name: 'uniswapQuoter', type: 'address', internalType: 'address' },
          {
            name: 'optimisticOracleV3',
            type: 'address',
            internalType: 'address',
          },
        ],
      },
      { name: 'nonce', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [
      { name: '', type: 'address', internalType: 'address' },
      { name: '', type: 'bytes', internalType: 'bytes' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'MarketGroupInitialized',
    inputs: [
      {
        name: 'marketGroup',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'returnData',
        type: 'bytes',
        indexed: false,
        internalType: 'bytes',
      },
    ],
    anonymous: false,
  },
] as const; // Use 'as const' for stricter typing with wagmi/viem

// Event ABI item for parsing logs
const marketGroupInitializedEvent = parseAbiItem(
  'event MarketGroupInitialized(address indexed sender,address indexed marketGroup,uint256 nonce)'
) as AbiEvent; // Assert type for decodeEventLog

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

// Use environment variable for API base URL, fallback to /api
const API_BASE_URL = process.env.NEXT_PUBLIC_FOIL_API_URL || '/api';

// Define the expected payload type for the mutation
interface CreateMarketGroupPayload {
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
}
// Assume QueryClientProvider is set up higher in the component tree

// --- Zod Schemas ---
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

const apiSchema = baseSchema.extend({
  chainId: z.coerce
    .number()
    .int()
    .positive('Chain ID must be a positive integer'),
  question: z.string().trim().min(1, 'Market Group Question is required'),
  category: z.string().min(1, 'Category is required'), // Assuming category ID is a string
  baseTokenName: z.string().trim().min(1, 'Base Token Name is required'),
  quoteTokenName: z.string().trim().min(1, 'Quote Token Name is required'),
  factoryAddress: z.string().refine(isAddress, 'Invalid Factory Address'), // Assuming needed for API too, adjust if not
});

const deploymentSchema = baseSchema.extend({
  factoryAddress: z.string().refine(isAddress, 'Invalid Factory Address'),
});
// --- End Zod Schemas ---

const CreateMarketGroupDialog = () => {
  const { address: connectedAddress } = useAccount();
  const currentChainId = useChainId();

  // --- Default Addresses based on Chain ID ---
  const BASE_CHAIN_ID = 8453;
  const DEFAULT_BASE_OWNER = '0x66aB20e98fcACfadB298C0741dFddA92568B5826';
  const DEFAULT_BOND_CURRENCY = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  const DEFAULT_COLLATERAL_ASSET = '0x5875eee11cf8398102fdad704c9e96607675467a';
  const DEFAULT_OPTIMISTIC_ORACLE =
    '0x2aBf1Bd76655de80eDB3086114315Eec75AF500c';
  const DEFAULT_UNISWAP_POS_MANAGER =
    '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';
  const DEFAULT_UNISWAP_SWAP_ROUTER =
    '0xAf5ead464aFFB12dD4CDFB98c9D2C490194FE5d0';
  const DEFAULT_UNISWAP_QUOTER = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a';
  const DEFAULT_FEE_RATE = '10000'; // 1%
  const DEFAULT_ASSERTION_LIVENESS = '21600';
  const DEFAULT_BOND_AMOUNT = '500000000';
  const DEFAULT_MIN_TRADE_SIZE = '10000';
  // --- End Defaults ---

  // Form State
  const [chainId, setChainId] = useState<string>('8453');
  const [factoryAddress, setFactoryAddress] = useState<string>(
    '0xe2C8572AE43E7Def359259e513d9c329aAEFf7cC'
  );
  // Default owner based on chain ID
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
  // --- Add Nonce State ---
  const [nonce, setNonce] = useState<string>('');
  // --- End Nonce State ---
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

  const [formError, setFormError] = useState<string | null>(null);
  const [question, setQuestion] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>(
    DEFAULT_FOCUS_AREA.id
  ); // Add state for selected category
  const [baseTokenName, setBaseTokenName] = useState<string>('Yes'); // Add state for base token name
  const [quoteTokenName, setQuoteTokenName] = useState<string>('sUSDS'); // Add state for quote token name

  const createMarketGroupMutation = useMutation({
    mutationFn: async (payload: CreateMarketGroupPayload) => {
      const { nonce, ...bodyPayload } = payload;
      console.log('Creating market group with nonce:', nonce, payload);
      const response = await fetch(
        `${API_BASE_URL}/create-market-group/${nonce}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bodyPayload), // Send the rest of the payload in the body
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
      setFormError(null); // Clear previous errors
      // Optionally invalidate queries or update cache using queryClient
      // queryClient.invalidateQueries({ queryKey: ['marketGroups'] });
      // TODO: Add success feedback to the user (e.g., toast notification)
    },
    onError: (error: Error) => {
      console.error('API Submission Error:', error);
      setFormError(`API Submission Failed: ${error.message}`);
      // TODO: Show error message more visibly in the UI
    },
  });
  // --- End Tanstack Query Mutation Setup ---

  // Update owner if network changes, but keep chainId fixed
  useEffect(() => {
    const newChainIdStr = currentChainId?.toString() || ''; // Get current chain ID as string
    // setChainId(newChainIdStr); // Remove this line to keep default 8453

    // Set default owner only if owner hasn't been manually changed from the default for that chain
    const isOwnerDefaultForCurrentChain =
      owner ===
      (currentChainId === BASE_CHAIN_ID
        ? DEFAULT_BASE_OWNER
        : connectedAddress || '');
    const isOwnerDefaultForNewChain =
      owner ===
      (Number(newChainIdStr) === BASE_CHAIN_ID
        ? DEFAULT_BASE_OWNER
        : connectedAddress || '');

    // If the owner is currently the default for the *new* chain, update it.
    // Or if the owner was the default for the *previous* chain, update it to the new default.
    // This avoids overwriting manual input but resets to default on chain change.
    if (isOwnerDefaultForNewChain || isOwnerDefaultForCurrentChain) {
      setOwner(
        Number(newChainIdStr) === BASE_CHAIN_ID
          ? DEFAULT_BASE_OWNER
          : connectedAddress || ''
      );
    }
  }, [currentChainId, connectedAddress, owner]); // Add owner to dependency array

  // --- Generate Initial Nonce ---
  useEffect(() => {
    // Generate a large random integer string for the nonce
    setNonce(Math.floor(Math.random() * 1e18).toString());
  }, []); // Empty dependency array ensures this runs only once on mount
  // --- End Nonce Generation ---

  // Input Handlers
  const handleMarketParamsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setMarketParams((prev) => ({ ...prev, [name]: value }));
  };

  // --- Zod Validation Function ---
  const validateFormData = (): string | null => {
    const schema = apiSchema; // Always use API schema now
    const formData = {
      // API + Deployment Fields
      owner,
      collateralAsset,
      minTradeSize,
      marketParams,
      nonce,
      factoryAddress, // Common to both deployment and potentially API

      // API Only Fields (will be ignored by deploymentSchema)
      chainId, // Pass string, zod coerces
      question,
      category: selectedCategory,
      baseTokenName,
      quoteTokenName,
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
  // --- End Zod Validation ---

  // Form Submission
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    // Basic Validation using the helper function
    const validationError = validateFormData(); // Use Zod for API validation
    if (validationError) {
      setFormError(validationError);
      return;
    }

    // Construct payload for mutation
    const payload: CreateMarketGroupPayload = {
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
      factoryAddress, // Pass factory address if needed
    };

    // Trigger the mutation
    createMarketGroupMutation.mutate(payload);
  };

  // Helper function for button text - use mutation state
  const getButtonText = () => {
    if (createMarketGroupMutation.isPending) {
      return 'Saving...';
    }
    return 'Save Market Group';
  };

  // Render Logic using Shadcn and Tailwind
  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Top Grid: Category, Base/Quote Tokens */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Market Group Question Input */}
          <div className="space-y-2">
            <Label htmlFor="marketGroupQuestion">Market Group Question</Label>
            <Input
              id="marketGroupQuestion"
              type="text"
              value={question}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setQuestion(e.target.value)
              }
              placeholder="Enter the main question for the market group"
              required
            />
          </div>

          {/* Category Select */}
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
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setBaseTokenName(e.target.value)
              }
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
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setQuoteTokenName(e.target.value)
              }
              placeholder="sUSDS"
              required
            />
          </div>
        </div>

        {/* Accordion for Details */}
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1">
            <AccordionTrigger>Details</AccordionTrigger>
            <AccordionContent className="space-y-6 pt-4">
              {/* Chain ID and Factory Address */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="chainId">Chain ID</Label>
                  <Input
                    id="chainId"
                    type="number"
                    value={chainId}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setChainId(e.target.value)
                    }
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
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setFactoryAddress(e.target.value)
                    }
                    placeholder="0x..."
                    required
                  />
                </div>
              </div>

              {/* Market Group Details */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="owner">Owner</Label>
                    <Input
                      id="owner"
                      type="text"
                      value={owner}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setOwner(e.target.value)
                      }
                      placeholder="0x..."
                      required
                      inputMode="numeric"
                    />
                  </div>
                  {/* --- Add Nonce Field --- */}
                  <div className="space-y-2">
                    <Label htmlFor="nonce">Nonce</Label>
                    <Input
                      id="nonce"
                      type="text"
                      value={nonce}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setNonce(e.target.value)
                      }
                      placeholder="Random nonce value"
                      required
                      inputMode="numeric"
                    />
                  </div>
                  {/* --- End Nonce Field --- */}
                  <div className="space-y-2">
                    <Label htmlFor="collateralAsset">Collateral Asset</Label>
                    <Input
                      id="collateralAsset"
                      type="text"
                      value={collateralAsset}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setCollateralAsset(e.target.value)
                      }
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
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setMinTradeSize(e.target.value)
                      }
                      placeholder="e.g., 1000000000000000000"
                      required
                      inputMode="numeric"
                    />
                  </div>
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

                    let placeholderText: string;
                    if (key.includes('Amount') || key.includes('Liveness')) {
                      placeholderText = 'e.g., 100...';
                    } else if (key.includes('Rate')) {
                      placeholderText = 'e.g., 3000';
                    } else {
                      placeholderText = '0x...';
                    }

                    return (
                      <div key={key} className="space-y-2">
                        <Label htmlFor={key} className="capitalize">
                          {/* Simple regex to add space before capitals */}
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
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* --- Remove Flex Container for Buttons, only one button remains --- */}
        {/* <div className="flex gap-4 w-full"> */}
          <Button
            type="submit"
            disabled={createMarketGroupMutation.isPending} // Use mutation pending state
            className="w-full mb-4" // Make button full width
          >
            {createMarketGroupMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {getButtonText()}
          </Button>
          {/* --- Remove Deploy Button --- */}
          {/* <Button
            type="button" // Important: prevent form submission
            onClick={handleDeploy}
            disabled={isWritePending || isConfirming} // Disable during write or confirmation
            className="flex-1 mb-4" // Use flex-1 to share space
          >
            {(isWritePending || isConfirming) && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Deploy Market Group
          </Button> */}
          {/* --- End New Deploy Button --- */}
        {/* </div> */}
      </form>

      {/* Results and Errors */} 
      <div className="space-y-4 mt-4"> {/* Added margin-top */} 
        {/* Display mutation success message (optional) */}
        {createMarketGroupMutation.isSuccess && (
          <Alert variant="default">
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Submission Successful!</AlertTitle>
            <AlertDescription>
              Market group details saved.
              {/* You could display data returned from the API here: */}
              {/* <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-auto">
                {JSON.stringify(createMarketGroupMutation.data, null, 2)}
              </pre> */}
            </AlertDescription>
          </Alert>
        )}

        {/* Display form validation errors or mutation errors */}
        {(formError || createMarketGroupMutation.isError) && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {
                formError ||
                  (createMarketGroupMutation.error as Error)?.message ||
                  // Remove wagmi/receipt errors
                  // writeError?.message || null ||
                  // receiptError?.message || null ||
                  'An unknown error occurred' // Fallback
              }
            </AlertDescription>
          </Alert>
        )}

        {/* Remove wagmi results */}
        {/* {hash && (...)} */}

        {/* Remove deployment success/issue alerts */}
        {/* {isSuccess && createdMarketGroup && (...)} */}
        {/* {isSuccess && !createdMarketGroup && formError && (...)} */}
      </div>
    </>
  );
};

export default CreateMarketGroupDialog;
