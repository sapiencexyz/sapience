'use client';

import { Button, Input, Label } from '@foil/ui';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@foil/ui/components/ui/alert';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@foil/ui/components/ui/accordion';
import { Separator } from '@foil/ui/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@foil/ui/components/ui/select';
import {
  AlertCircle,
  Terminal,
  CheckCircle,
  Info,
  Loader2,
} from 'lucide-react';
import type React from 'react';
import { useState, useEffect } from 'react';
import { parseAbiItem, decodeEventLog, isAddress } from 'viem'; // Import values separately
import type {
  // Keep type imports separate
  AbiEvent,
  Address,
} from 'viem';

// Import FOCUS_AREAS
import {
  FOCUS_AREAS,
  DEFAULT_FOCUS_AREA,
} from '../../lib/constants/focusAreas';

// Use root export for Button, Input, Label
// Use direct paths for Card, Alert, Separator as they aren't in root index.ts
import {
  useAccount,
  useChainId,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';

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
  'event MarketGroupInitialized(address indexed marketGroup, bytes returnData)'
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

const CreateMarketGroupDialog = () => {
  const { address: connectedAddress } = useAccount();
  const currentChainId = useChainId();
  const {
    data: hash,
    error: writeError,
    isPending: isWritePending,
    writeContract,
  } = useWriteContract();

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
  const [chainId, setChainId] = useState<string>(
    currentChainId?.toString() || ''
  );
  const [factoryAddress, setFactoryAddress] = useState<string>('');
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

  const [createdMarketGroup, setCreatedMarketGroup] = useState<Address | null>(
    null
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [question, setQuestion] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>(
    DEFAULT_FOCUS_AREA.id
  ); // Add state for selected category
  const [baseTokenName, setBaseTokenName] = useState<string>(''); // Add state for base token name
  const [quoteTokenName, setQuoteTokenName] = useState<string>(''); // Add state for quote token name

  // Update chainId and potentially owner if network changes
  useEffect(() => {
    const newChainIdStr = currentChainId?.toString() || '';
    setChainId(newChainIdStr);
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
  }, [currentChainId, connectedAddress]); // Need connectedAddress here too

  // Transaction Receipt Handling
  const {
    data: receipt,
    isLoading: isConfirming,
    isSuccess,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });

  // Parse event log on successful transaction
  useEffect(() => {
    if (isSuccess && receipt) {
      try {
        const logs = receipt.logs
          .map((log) => {
            try {
              // Ensure topics are correctly passed as an array
              const topics = Array.isArray(log.topics) ? log.topics : [];
              // Explicitly type topics for decodeEventLog
              const typedTopics: [`0x${string}`, ...`0x${string}`[]] | [] =
                topics as any;
              return decodeEventLog({
                abi: [marketGroupInitializedEvent],
                data: log.data,
                topics: typedTopics,
              });
            } catch (e) {
              // console.debug('Log decoding failed for one log:', e); // Optional debug log
              return null; // Ignore logs that don't match the event
            }
          })
          .filter(
            (decodedLog) =>
              decodedLog !== null &&
              decodedLog.eventName === 'MarketGroupInitialized'
          );

        if (logs.length > 0 && logs[0]?.args && 'marketGroup' in logs[0].args) {
          setCreatedMarketGroup(logs[0].args.marketGroup as Address);
        } else {
          console.warn(
            'MarketGroupInitialized event not found in transaction logs.'
          );
          setFormError(
            'Transaction succeeded, but event emission was not detected.'
          );
        }
      } catch (e) {
        console.error('Error processing logs:', e);
        setFormError('Error processing transaction logs.');
      }
    }
  }, [isSuccess, receipt, marketGroupInitializedEvent]); // Add marketGroupInitializedEvent to dependency array

  // Input Handlers
  const handleMarketParamsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setMarketParams((prev) => ({ ...prev, [name]: value }));
  };

  // Form Submission
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreatedMarketGroup(null);
    setFormError(null);

    // Basic Validation
    if (!chainId) return setFormError('Chain ID is required');
    if (!isAddress(factoryAddress))
      return setFormError('Invalid Factory Address');
    if (!isAddress(owner)) return setFormError('Invalid Owner Address');
    if (!isAddress(collateralAsset))
      return setFormError('Invalid Collateral Asset Address');
    try {
      BigInt(minTradeSize);
    } catch {
      return setFormError('Invalid Min Trade Size (must be a number)');
    }
    try {
      Number(marketParams.feeRate);
    } catch {
      return setFormError('Invalid Fee Rate (must be a number)');
    }
    try {
      BigInt(marketParams.assertionLiveness);
    } catch {
      return setFormError('Invalid Assertion Liveness (must be a number)');
    }
    try {
      BigInt(marketParams.bondAmount);
    } catch {
      return setFormError('Invalid Bond Amount (must be a number)');
    }
    if (!isAddress(marketParams.bondCurrency))
      return setFormError('Invalid Bond Currency Address');
    if (!isAddress(marketParams.uniswapPositionManager))
      return setFormError('Invalid Uniswap Position Manager Address');
    if (!isAddress(marketParams.uniswapSwapRouter))
      return setFormError('Invalid Uniswap Swap Router Address');
    if (!isAddress(marketParams.uniswapQuoter))
      return setFormError('Invalid Uniswap Quoter Address');
    if (!isAddress(marketParams.optimisticOracleV3))
      return setFormError('Invalid Optimistic Oracle V3 Address');

    try {
      const params = {
        owner: owner as Address,
        collateralAsset: collateralAsset as Address,
        feeCollectors: [] as Address[],
        callbackRecipient:
          '0x0000000000000000000000000000000000000000' as Address,
        minTradeSize: BigInt(minTradeSize),
        marketParams: {
          feeRate: Number(marketParams.feeRate),
          assertionLiveness: BigInt(marketParams.assertionLiveness),
          bondAmount: BigInt(marketParams.bondAmount),
          bondCurrency: marketParams.bondCurrency as Address,
          uniswapPositionManager:
            marketParams.uniswapPositionManager as Address,
          uniswapSwapRouter: marketParams.uniswapSwapRouter as Address,
          uniswapQuoter: marketParams.uniswapQuoter as Address,
          optimisticOracleV3: marketParams.optimisticOracleV3 as Address,
        },
      };

      writeContract({
        address: factoryAddress as Address,
        abi: marketGroupFactoryAbi,
        functionName: 'cloneAndInitializeMarketGroup',
        args: [
          params.owner,
          params.collateralAsset,
          params.feeCollectors,
          params.callbackRecipient,
          params.minTradeSize,
          params.marketParams,
        ],
        chainId: parseInt(chainId, 10),
      });
    } catch (err: any) {
      console.error('Error constructing transaction:', err);
      setFormError(
        `Error preparing transaction: ${err.message || 'Invalid input format'}`
      );
    }
  };

  // Helper function for button text
  const getButtonText = () => {
    if (isWritePending) {
      return 'Check Wallet...';
    }
    if (isConfirming) {
      return 'Creating Market Group...';
    }
    return 'Create Market Group';
  };

  // Render Logic using Shadcn and Tailwind
  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Top Grid: Question, Category, Base/Quote Tokens */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Question Input */}
          <div className="space-y-2">
            <Label htmlFor="question">Question</Label>
            <Input
              id="question"
              type="text"
              value={question}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setQuestion(e.target.value)
              }
              placeholder="Enter the market group question"
              required
            />
          </div>

          {/* Category Select */}
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
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
                  <div className="space-y-2 md:col-span-2">
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

        <Button
          type="submit"
          disabled={isWritePending || isConfirming}
          className="w-full mb-4"
        >
          {(isWritePending || isConfirming) && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          {getButtonText()}
        </Button>
      </form>

      {/* Results and Errors */}
      <div className="space-y-4">
        {hash && (
          <Alert variant="default">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Transaction Submitted</AlertTitle>
            <AlertDescription className="break-all">
              Hash: {hash}
              {isConfirming && (
                <span className="ml-2 inline-flex items-center">
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Waiting for confirmation...
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}

        {isSuccess && createdMarketGroup && (
          <Alert variant="default">
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Success!</AlertTitle>
            <AlertDescription className="break-all">
              Market Group Created: {createdMarketGroup}
              {/* Optionally show receipt details, maybe in a collapsed section */}
              {/* <details className="mt-2">
                           <summary className="cursor-pointer">View Receipt</summary>
                           <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-auto">
                             {JSON.stringify(receipt, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2)}
                           </pre>
                         </details> */}
            </AlertDescription>
          </Alert>
        )}

        {isSuccess && !createdMarketGroup && formError && (
          <Alert variant="default">
            <Info className="h-4 w-4" />
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        {formError && !isSuccess && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Form Error</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        {writeError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Transaction Submission Error</AlertTitle>
            <AlertDescription>{writeError.message}</AlertDescription>
          </Alert>
        )}

        {receiptError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Transaction Confirmation Error</AlertTitle>
            <AlertDescription>{receiptError.message}</AlertDescription>
          </Alert>
        )}
      </div>
    </>
  );
};

export default CreateMarketGroupDialog;
