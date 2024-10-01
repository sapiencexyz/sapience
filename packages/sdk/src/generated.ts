import {
  createReadContract,
  createWriteContract,
  createSimulateContract,
  createWatchContractEvent,
} from 'wagmi/codegen'

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Foil
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const foilAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: '_marketInitializer', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'acceptOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'startTime', internalType: 'uint256', type: 'uint256' },
      { name: 'endTime', internalType: 'uint256', type: 'uint256' },
      {
        name: 'startingSqrtPriceX96',
        internalType: 'uint160',
        type: 'uint160',
      },
      { name: 'salt', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'createEpoch',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'initialOwner', internalType: 'address', type: 'address' },
      { name: 'collateralAsset', internalType: 'address', type: 'address' },
      {
        name: 'epochParams',
        internalType: 'struct IFoilStructs.EpochParams',
        type: 'tuple',
        components: [
          {
            name: 'baseAssetMinPriceTick',
            internalType: 'int24',
            type: 'int24',
          },
          {
            name: 'baseAssetMaxPriceTick',
            internalType: 'int24',
            type: 'int24',
          },
          { name: 'feeRate', internalType: 'uint24', type: 'uint24' },
          { name: 'assertionLiveness', internalType: 'uint64', type: 'uint64' },
          { name: 'bondCurrency', internalType: 'address', type: 'address' },
          { name: 'bondAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'priceUnit', internalType: 'bytes32', type: 'bytes32' },
          {
            name: 'uniswapPositionManager',
            internalType: 'address',
            type: 'address',
          },
          {
            name: 'uniswapSwapRouter',
            internalType: 'address',
            type: 'address',
          },
          { name: 'uniswapQuoter', internalType: 'address', type: 'address' },
          {
            name: 'optimisticOracleV3',
            internalType: 'address',
            type: 'address',
          },
        ],
      },
    ],
    name: 'initializeMarket',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'pendingOwner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'newOwner', internalType: 'address', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'epochParams',
        internalType: 'struct IFoilStructs.EpochParams',
        type: 'tuple',
        components: [
          {
            name: 'baseAssetMinPriceTick',
            internalType: 'int24',
            type: 'int24',
          },
          {
            name: 'baseAssetMaxPriceTick',
            internalType: 'int24',
            type: 'int24',
          },
          { name: 'feeRate', internalType: 'uint24', type: 'uint24' },
          { name: 'assertionLiveness', internalType: 'uint64', type: 'uint64' },
          { name: 'bondCurrency', internalType: 'address', type: 'address' },
          { name: 'bondAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'priceUnit', internalType: 'bytes32', type: 'bytes32' },
          {
            name: 'uniswapPositionManager',
            internalType: 'address',
            type: 'address',
          },
          {
            name: 'uniswapSwapRouter',
            internalType: 'address',
            type: 'address',
          },
          { name: 'uniswapQuoter', internalType: 'address', type: 'address' },
          {
            name: 'optimisticOracleV3',
            internalType: 'address',
            type: 'address',
          },
        ],
      },
    ],
    name: 'updateMarket',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'epochId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'startTime',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'endTime',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'startingSqrtPriceX96',
        internalType: 'uint160',
        type: 'uint160',
        indexed: false,
      },
    ],
    name: 'EpochCreated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'version',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'Initialized',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'initialOwner',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'collateralAsset',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'epochParams',
        internalType: 'struct IFoilStructs.EpochParams',
        type: 'tuple',
        components: [
          {
            name: 'baseAssetMinPriceTick',
            internalType: 'int24',
            type: 'int24',
          },
          {
            name: 'baseAssetMaxPriceTick',
            internalType: 'int24',
            type: 'int24',
          },
          { name: 'feeRate', internalType: 'uint24', type: 'uint24' },
          { name: 'assertionLiveness', internalType: 'uint64', type: 'uint64' },
          { name: 'bondCurrency', internalType: 'address', type: 'address' },
          { name: 'bondAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'priceUnit', internalType: 'bytes32', type: 'bytes32' },
          {
            name: 'uniswapPositionManager',
            internalType: 'address',
            type: 'address',
          },
          {
            name: 'uniswapSwapRouter',
            internalType: 'address',
            type: 'address',
          },
          { name: 'uniswapQuoter', internalType: 'address', type: 'address' },
          {
            name: 'optimisticOracleV3',
            internalType: 'address',
            type: 'address',
          },
        ],
        indexed: false,
      },
    ],
    name: 'MarketInitialized',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'epochParams',
        internalType: 'struct IFoilStructs.EpochParams',
        type: 'tuple',
        components: [
          {
            name: 'baseAssetMinPriceTick',
            internalType: 'int24',
            type: 'int24',
          },
          {
            name: 'baseAssetMaxPriceTick',
            internalType: 'int24',
            type: 'int24',
          },
          { name: 'feeRate', internalType: 'uint24', type: 'uint24' },
          { name: 'assertionLiveness', internalType: 'uint64', type: 'uint64' },
          { name: 'bondCurrency', internalType: 'address', type: 'address' },
          { name: 'bondAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'priceUnit', internalType: 'bytes32', type: 'bytes32' },
          {
            name: 'uniswapPositionManager',
            internalType: 'address',
            type: 'address',
          },
          {
            name: 'uniswapSwapRouter',
            internalType: 'address',
            type: 'address',
          },
          { name: 'uniswapQuoter', internalType: 'address', type: 'address' },
          {
            name: 'optimisticOracleV3',
            internalType: 'address',
            type: 'address',
          },
        ],
        indexed: false,
      },
    ],
    name: 'MarketUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferStarted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferred',
  },
  {
    type: 'error',
    inputs: [
      { name: 'startTime', internalType: 'uint256', type: 'uint256' },
      { name: 'endTime', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'EndTimeTooEarly',
  },
  { type: 'error', inputs: [], name: 'EpochAlreadyStarted' },
  {
    type: 'error',
    inputs: [
      { name: 'maxPriceTick', internalType: 'int24', type: 'int24' },
      { name: 'tickSpacing', internalType: 'int24', type: 'int24' },
    ],
    name: 'InvalidBaseAssetMaxPriceTick',
  },
  {
    type: 'error',
    inputs: [
      { name: 'minPriceTick', internalType: 'int24', type: 'int24' },
      { name: 'tickSpacing', internalType: 'int24', type: 'int24' },
    ],
    name: 'InvalidBaseAssetMinPriceTick',
  },
  { type: 'error', inputs: [], name: 'InvalidInitialization' },
  { type: 'error', inputs: [], name: 'InvalidMarket' },
  {
    type: 'error',
    inputs: [
      { name: 'minPriceTick', internalType: 'int24', type: 'int24' },
      { name: 'maxPriceTick', internalType: 'int24', type: 'int24' },
    ],
    name: 'InvalidPriceTickRange',
  },
  {
    type: 'error',
    inputs: [{ name: 'feeRate', internalType: 'uint24', type: 'uint24' }],
    name: 'InvalidTickSpacing',
  },
  { type: 'error', inputs: [], name: 'MarketAlreadyCreated' },
  { type: 'error', inputs: [], name: 'MarketNotInitialized' },
  { type: 'error', inputs: [], name: 'NotInitializing' },
  {
    type: 'error',
    inputs: [
      { name: 'sender', internalType: 'address', type: 'address' },
      { name: 'initializer', internalType: 'address', type: 'address' },
    ],
    name: 'OnlyInitializer',
  },
  { type: 'error', inputs: [], name: 'OnlyOwner' },
  { type: 'error', inputs: [], name: 'OverflowInt24ToUint256' },
  {
    type: 'error',
    inputs: [{ name: 'sender', internalType: 'address', type: 'address' }],
    name: 'OwnableUnauthorizedAccount',
  },
  { type: 'error', inputs: [], name: 'ReentrancyGuardReentrantCall' },
  {
    type: 'error',
    inputs: [
      { name: 'startTime', internalType: 'uint256', type: 'uint256' },
      { name: 'blockTime', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'StartTimeTooEarly',
  },
  { type: 'error', inputs: [], name: 'TokensAlreadyCreated' },
  {
    type: 'function',
    inputs: [
      {
        name: 'params',
        internalType: 'struct IFoilStructs.LiquidityMintParams',
        type: 'tuple',
        components: [
          { name: 'epochId', internalType: 'uint256', type: 'uint256' },
          { name: 'amountTokenA', internalType: 'uint256', type: 'uint256' },
          { name: 'amountTokenB', internalType: 'uint256', type: 'uint256' },
          {
            name: 'collateralAmount',
            internalType: 'uint256',
            type: 'uint256',
          },
          { name: 'lowerTick', internalType: 'int24', type: 'int24' },
          { name: 'upperTick', internalType: 'int24', type: 'int24' },
          { name: 'minAmountTokenA', internalType: 'uint256', type: 'uint256' },
          { name: 'minAmountTokenB', internalType: 'uint256', type: 'uint256' },
          { name: 'deadline', internalType: 'uint256', type: 'uint256' },
        ],
      },
    ],
    name: 'createLiquidityPosition',
    outputs: [
      { name: 'id', internalType: 'uint256', type: 'uint256' },
      { name: 'collateralAmount', internalType: 'uint256', type: 'uint256' },
      { name: 'uniswapNftId', internalType: 'uint256', type: 'uint256' },
      { name: 'liquidity', internalType: 'uint128', type: 'uint128' },
      { name: 'addedAmount0', internalType: 'uint256', type: 'uint256' },
      { name: 'addedAmount1', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'params',
        internalType: 'struct IFoilStructs.LiquidityDecreaseParams',
        type: 'tuple',
        components: [
          { name: 'positionId', internalType: 'uint256', type: 'uint256' },
          { name: 'liquidity', internalType: 'uint128', type: 'uint128' },
          { name: 'minGasAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'minEthAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'deadline', internalType: 'uint256', type: 'uint256' },
        ],
      },
    ],
    name: 'decreaseLiquidityPosition',
    outputs: [
      { name: 'amount0', internalType: 'uint256', type: 'uint256' },
      { name: 'amount1', internalType: 'uint256', type: 'uint256' },
      { name: 'collateralAmount', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'positionId', internalType: 'uint256', type: 'uint256' },
      { name: 'amount0', internalType: 'uint256', type: 'uint256' },
      { name: 'amount1', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'getCollateralRequirementForAdditionalTokens',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'epochId', internalType: 'uint256', type: 'uint256' },
      {
        name: 'depositedCollateralAmount',
        internalType: 'uint256',
        type: 'uint256',
      },
      { name: 'sqrtPriceX96', internalType: 'uint160', type: 'uint160' },
      { name: 'sqrtPriceAX96', internalType: 'uint160', type: 'uint160' },
      { name: 'sqrtPriceBX96', internalType: 'uint160', type: 'uint160' },
    ],
    name: 'getTokenAmounts',
    outputs: [
      { name: 'amount0', internalType: 'uint256', type: 'uint256' },
      { name: 'amount1', internalType: 'uint256', type: 'uint256' },
      { name: 'liquidity', internalType: 'uint128', type: 'uint128' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'params',
        internalType: 'struct IFoilStructs.LiquidityIncreaseParams',
        type: 'tuple',
        components: [
          { name: 'positionId', internalType: 'uint256', type: 'uint256' },
          {
            name: 'collateralAmount',
            internalType: 'uint256',
            type: 'uint256',
          },
          { name: 'gasTokenAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'ethTokenAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'minGasAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'minEthAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'deadline', internalType: 'uint256', type: 'uint256' },
        ],
      },
    ],
    name: 'increaseLiquidityPosition',
    outputs: [
      { name: 'liquidity', internalType: 'uint128', type: 'uint128' },
      { name: 'amount0', internalType: 'uint256', type: 'uint256' },
      { name: 'amount1', internalType: 'uint256', type: 'uint256' },
      { name: 'collateralAmount', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'epochId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'positionId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'kind',
        internalType: 'enum IFoilStructs.PositionKind',
        type: 'uint8',
        indexed: false,
      },
      {
        name: 'collectedAmount0',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'collectedAmount1',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'LiquidityPositionClosed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'epochId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'positionId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'collateralAmount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'liquidity',
        internalType: 'uint128',
        type: 'uint128',
        indexed: false,
      },
      {
        name: 'addedAmount0',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'addedAmount1',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'lowerTick',
        internalType: 'int24',
        type: 'int24',
        indexed: false,
      },
      {
        name: 'upperTick',
        internalType: 'int24',
        type: 'int24',
        indexed: false,
      },
    ],
    name: 'LiquidityPositionCreated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'epochId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'positionId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'collateralAmount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'liquidity',
        internalType: 'uint128',
        type: 'uint128',
        indexed: false,
      },
      {
        name: 'amount0',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'amount1',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'LiquidityPositionDecreased',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'epochId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'positionId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'collateralAmount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'liquidity',
        internalType: 'uint128',
        type: 'uint128',
        indexed: false,
      },
      {
        name: 'amount0',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'amount1',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'LiquidityPositionIncreased',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'from', internalType: 'address', type: 'address', indexed: true },
      { name: 'to', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'tokenId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
    ],
    name: 'Transfer',
  },
  {
    type: 'error',
    inputs: [{ name: 'target', internalType: 'address', type: 'address' }],
    name: 'AddressEmptyCode',
  },
  {
    type: 'error',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'AddressInsufficientBalance',
  },
  { type: 'error', inputs: [], name: 'ExpiredEpoch' },
  { type: 'error', inputs: [], name: 'FailedInnerCall' },
  {
    type: 'error',
    inputs: [
      { name: 'amountRequired', internalType: 'uint256', type: 'uint256' },
      { name: 'collateralAvailable', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'InsufficientCollateral',
  },
  { type: 'error', inputs: [], name: 'InvalidEpoch' },
  {
    type: 'error',
    inputs: [
      { name: 'parameter', internalType: 'string', type: 'string' },
      { name: 'reason', internalType: 'string', type: 'string' },
    ],
    name: 'InvalidParameter',
  },
  {
    type: 'error',
    inputs: [{ name: 'positionId', internalType: 'uint256', type: 'uint256' }],
    name: 'InvalidPositionId',
  },
  { type: 'error', inputs: [], name: 'InvalidPositionKind' },
  {
    type: 'error',
    inputs: [
      { name: 'requestedTick', internalType: 'int24', type: 'int24' },
      { name: 'boundedTick', internalType: 'int24', type: 'int24' },
    ],
    name: 'InvalidRange',
  },
  {
    type: 'error',
    inputs: [
      { name: 'tokenId', internalType: 'uint256', type: 'uint256' },
      { name: 'sender', internalType: 'address', type: 'address' },
    ],
    name: 'NotAccountOwnerOrAuthorized',
  },
  { type: 'error', inputs: [], name: 'OverflowInt256ToUint256' },
  { type: 'error', inputs: [], name: 'OverflowUint256ToInt256' },
  { type: 'error', inputs: [], name: 'PositionAlreadyCreated' },
  {
    type: 'error',
    inputs: [{ name: 'positionId', internalType: 'uint256', type: 'uint256' }],
    name: 'PositionAlreadySettled',
  },
  {
    type: 'error',
    inputs: [{ name: 'token', internalType: 'address', type: 'address' }],
    name: 'SafeERC20FailedOperation',
  },
  {
    type: 'error',
    inputs: [{ name: 'id', internalType: 'uint256', type: 'uint256' }],
    name: 'TokenAlreadyMinted',
  },
  { type: 'error', inputs: [], name: 'ZeroAddress' },
  {
    type: 'function',
    inputs: [{ name: 'assertionId', internalType: 'bytes32', type: 'bytes32' }],
    name: 'assertionDisputedCallback',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'assertionId', internalType: 'bytes32', type: 'bytes32' },
      { name: 'assertedTruthfully', internalType: 'bool', type: 'bool' },
    ],
    name: 'assertionResolvedCallback',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'epochId', internalType: 'uint256', type: 'uint256' },
      { name: 'settlementPriceD18', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'submitSettlementPrice',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'epochId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'assertionId',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
      {
        name: 'settlementPriceD18',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'MarketSettled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'epochId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'disputeTime',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'SettlementDisputed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'epochId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'price',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'submissionTime',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'SettlementSubmitted',
  },
  {
    type: 'function',
    inputs: [
      { name: 'epochId', internalType: 'uint256', type: 'uint256' },
      { name: 'size', internalType: 'int256', type: 'int256' },
      {
        name: 'deltaCollateralLimit',
        internalType: 'uint256',
        type: 'uint256',
      },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'createTraderPosition',
    outputs: [{ name: 'positionId', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'positionId', internalType: 'uint256', type: 'uint256' },
      { name: 'size', internalType: 'int256', type: 'int256' },
      { name: 'deltaCollateralLimit', internalType: 'int256', type: 'int256' },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'modifyTraderPosition',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'epochId', internalType: 'uint256', type: 'uint256' },
      { name: 'size', internalType: 'int256', type: 'int256' },
    ],
    name: 'quoteCreateTraderPosition',
    outputs: [
      { name: 'requiredCollateral', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'positionId', internalType: 'uint256', type: 'uint256' },
      { name: 'size', internalType: 'int256', type: 'int256' },
    ],
    name: 'quoteModifyTraderPosition',
    outputs: [
      { name: 'requiredCollateral', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'epochId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'positionId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'collateralAmount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'vEthAmount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'vGasAmount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'borrowedVEth',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'borrowedVGas',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'initialPrice',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'finalPrice',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'tradeRatio',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'TraderPositionCreated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'epochId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'positionId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'collateralAmount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'vEthAmount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'vGasAmount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'borrowedVEth',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'borrowedVGas',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'initialPrice',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'finalPrice',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'tradeRatio',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'TraderPositionModified',
  },
  {
    type: 'error',
    inputs: [
      { name: 'collateralRequired', internalType: 'int256', type: 'int256' },
      { name: 'maxCollateral', internalType: 'int256', type: 'int256' },
    ],
    name: 'CollateralLimitReached',
  },
  {
    type: 'error',
    inputs: [{ name: 'epochId', internalType: 'uint256', type: 'uint256' }],
    name: 'EpochNotSettled',
  },
  { type: 'error', inputs: [], name: 'EpochSettled' },
  {
    type: 'error',
    inputs: [{ name: 'message', internalType: 'string', type: 'string' }],
    name: 'InvalidData',
  },
  {
    type: 'error',
    inputs: [
      { name: 'poolPrice', internalType: 'uint160', type: 'uint160' },
      { name: 'minPrice', internalType: 'uint160', type: 'uint160' },
      { name: 'maxPrice', internalType: 'uint160', type: 'uint160' },
    ],
    name: 'PoolPriceOutOfRange',
  },
  {
    type: 'function',
    inputs: [{ name: 'epochId', internalType: 'uint256', type: 'uint256' }],
    name: 'getReferencePrice',
    outputs: [
      { name: 'price18Digits', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'tokenId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'holder', internalType: 'address', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'tokenId', internalType: 'uint256', type: 'uint256' }],
    name: 'getApproved',
    outputs: [{ name: 'operator', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'holder', internalType: 'address', type: 'address' },
      { name: 'operator', internalType: 'address', type: 'address' },
    ],
    name: 'isApprovedForAll',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'name',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'tokenId', internalType: 'uint256', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'from', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'tokenId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'safeTransferFrom',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'from', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'tokenId', internalType: 'uint256', type: 'uint256' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'safeTransferFrom',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'operator', internalType: 'address', type: 'address' },
      { name: 'approved', internalType: 'bool', type: 'bool' },
    ],
    name: 'setApprovalForAll',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'index', internalType: 'uint256', type: 'uint256' }],
    name: 'tokenByIndex',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'owner', internalType: 'address', type: 'address' },
      { name: 'index', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'tokenOfOwnerByIndex',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'tokenId', internalType: 'uint256', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'from', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'tokenId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'transferFrom',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'owner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'approved',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'tokenId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
    ],
    name: 'Approval',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'owner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'operator',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      { name: 'approved', internalType: 'bool', type: 'bool', indexed: false },
    ],
    name: 'ApprovalForAll',
  },
  {
    type: 'error',
    inputs: [{ name: 'addr', internalType: 'address', type: 'address' }],
    name: 'CannotSelfApprove',
  },
  {
    type: 'error',
    inputs: [
      { name: 'requestedIndex', internalType: 'uint256', type: 'uint256' },
      { name: 'length', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'IndexOverrun',
  },
  {
    type: 'error',
    inputs: [{ name: 'addr', internalType: 'address', type: 'address' }],
    name: 'InvalidOwner',
  },
  {
    type: 'error',
    inputs: [{ name: 'addr', internalType: 'address', type: 'address' }],
    name: 'InvalidTransferRecipient',
  },
  {
    type: 'error',
    inputs: [{ name: 'id', internalType: 'uint256', type: 'uint256' }],
    name: 'TokenDoesNotExist',
  },
  {
    type: 'error',
    inputs: [{ name: 'addr', internalType: 'address', type: 'address' }],
    name: 'Unauthorized',
  },
  {
    type: 'function',
    inputs: [{ name: 'id', internalType: 'uint256', type: 'uint256' }],
    name: 'getEpoch',
    outputs: [
      { name: 'startTime', internalType: 'uint256', type: 'uint256' },
      { name: 'endTime', internalType: 'uint256', type: 'uint256' },
      { name: 'pool', internalType: 'address', type: 'address' },
      { name: 'ethToken', internalType: 'address', type: 'address' },
      { name: 'gasToken', internalType: 'address', type: 'address' },
      { name: 'minPriceD18', internalType: 'uint256', type: 'uint256' },
      { name: 'maxPriceD18', internalType: 'uint256', type: 'uint256' },
      { name: 'settled', internalType: 'bool', type: 'bool' },
      { name: 'settlementPriceD18', internalType: 'uint256', type: 'uint256' },
      {
        name: 'params',
        internalType: 'struct IFoilStructs.EpochParams',
        type: 'tuple',
        components: [
          {
            name: 'baseAssetMinPriceTick',
            internalType: 'int24',
            type: 'int24',
          },
          {
            name: 'baseAssetMaxPriceTick',
            internalType: 'int24',
            type: 'int24',
          },
          { name: 'feeRate', internalType: 'uint24', type: 'uint24' },
          { name: 'assertionLiveness', internalType: 'uint64', type: 'uint64' },
          { name: 'bondCurrency', internalType: 'address', type: 'address' },
          { name: 'bondAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'priceUnit', internalType: 'bytes32', type: 'bytes32' },
          {
            name: 'uniswapPositionManager',
            internalType: 'address',
            type: 'address',
          },
          {
            name: 'uniswapSwapRouter',
            internalType: 'address',
            type: 'address',
          },
          { name: 'uniswapQuoter', internalType: 'address', type: 'address' },
          {
            name: 'optimisticOracleV3',
            internalType: 'address',
            type: 'address',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getLatestEpoch',
    outputs: [
      { name: 'epochId', internalType: 'uint256', type: 'uint256' },
      { name: 'startTime', internalType: 'uint256', type: 'uint256' },
      { name: 'endTime', internalType: 'uint256', type: 'uint256' },
      { name: 'pool', internalType: 'address', type: 'address' },
      { name: 'ethToken', internalType: 'address', type: 'address' },
      { name: 'gasToken', internalType: 'address', type: 'address' },
      { name: 'minPriceD18', internalType: 'uint256', type: 'uint256' },
      { name: 'maxPriceD18', internalType: 'uint256', type: 'uint256' },
      { name: 'settled', internalType: 'bool', type: 'bool' },
      { name: 'settlementPriceD18', internalType: 'uint256', type: 'uint256' },
      {
        name: 'params',
        internalType: 'struct IFoilStructs.EpochParams',
        type: 'tuple',
        components: [
          {
            name: 'baseAssetMinPriceTick',
            internalType: 'int24',
            type: 'int24',
          },
          {
            name: 'baseAssetMaxPriceTick',
            internalType: 'int24',
            type: 'int24',
          },
          { name: 'feeRate', internalType: 'uint24', type: 'uint24' },
          { name: 'assertionLiveness', internalType: 'uint64', type: 'uint64' },
          { name: 'bondCurrency', internalType: 'address', type: 'address' },
          { name: 'bondAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'priceUnit', internalType: 'bytes32', type: 'bytes32' },
          {
            name: 'uniswapPositionManager',
            internalType: 'address',
            type: 'address',
          },
          {
            name: 'uniswapSwapRouter',
            internalType: 'address',
            type: 'address',
          },
          { name: 'uniswapQuoter', internalType: 'address', type: 'address' },
          {
            name: 'optimisticOracleV3',
            internalType: 'address',
            type: 'address',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getMarket',
    outputs: [
      { name: 'owner', internalType: 'address', type: 'address' },
      { name: 'collateralAsset', internalType: 'address', type: 'address' },
      {
        name: 'epochParams',
        internalType: 'struct IFoilStructs.EpochParams',
        type: 'tuple',
        components: [
          {
            name: 'baseAssetMinPriceTick',
            internalType: 'int24',
            type: 'int24',
          },
          {
            name: 'baseAssetMaxPriceTick',
            internalType: 'int24',
            type: 'int24',
          },
          { name: 'feeRate', internalType: 'uint24', type: 'uint24' },
          { name: 'assertionLiveness', internalType: 'uint64', type: 'uint64' },
          { name: 'bondCurrency', internalType: 'address', type: 'address' },
          { name: 'bondAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'priceUnit', internalType: 'bytes32', type: 'bytes32' },
          {
            name: 'uniswapPositionManager',
            internalType: 'address',
            type: 'address',
          },
          {
            name: 'uniswapSwapRouter',
            internalType: 'address',
            type: 'address',
          },
          { name: 'uniswapQuoter', internalType: 'address', type: 'address' },
          {
            name: 'optimisticOracleV3',
            internalType: 'address',
            type: 'address',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'positionId', internalType: 'uint256', type: 'uint256' }],
    name: 'getPosition',
    outputs: [
      {
        name: '',
        internalType: 'struct Position.Data',
        type: 'tuple',
        components: [
          { name: 'id', internalType: 'uint256', type: 'uint256' },
          {
            name: 'kind',
            internalType: 'enum IFoilStructs.PositionKind',
            type: 'uint8',
          },
          { name: 'epochId', internalType: 'uint256', type: 'uint256' },
          {
            name: 'depositedCollateralAmount',
            internalType: 'uint256',
            type: 'uint256',
          },
          { name: 'borrowedVEth', internalType: 'uint256', type: 'uint256' },
          { name: 'borrowedVGas', internalType: 'uint256', type: 'uint256' },
          { name: 'vEthAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'vGasAmount', internalType: 'uint256', type: 'uint256' },
          {
            name: 'uniswapPositionId',
            internalType: 'uint256',
            type: 'uint256',
          },
          { name: 'isSettled', internalType: 'bool', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [{ name: 'positionId', internalType: 'uint256', type: 'uint256' }],
    name: 'getPositionSize',
    outputs: [{ name: '', internalType: 'int256', type: 'int256' }],
    stateMutability: 'view',
  },
  { type: 'error', inputs: [], name: 'NoEpochsCreated' },
  {
    type: 'function',
    inputs: [{ name: 'interfaceId', internalType: 'bytes4', type: 'bytes4' }],
    name: 'supportsInterface',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'positionId', internalType: 'uint256', type: 'uint256' }],
    name: 'settlePosition',
    outputs: [
      {
        name: 'withdrawableCollateral',
        internalType: 'uint256',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'positionId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'withdrawnCollateral',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'PositionSettled',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Action
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link foilAbi}__
 */
export const readFoil = /*#__PURE__*/ createReadContract({ abi: foilAbi })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"owner"`
 */
export const readFoilOwner = /*#__PURE__*/ createReadContract({
  abi: foilAbi,
  functionName: 'owner',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"pendingOwner"`
 */
export const readFoilPendingOwner = /*#__PURE__*/ createReadContract({
  abi: foilAbi,
  functionName: 'pendingOwner',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"getCollateralRequirementForAdditionalTokens"`
 */
export const readFoilGetCollateralRequirementForAdditionalTokens =
  /*#__PURE__*/ createReadContract({
    abi: foilAbi,
    functionName: 'getCollateralRequirementForAdditionalTokens',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"getTokenAmounts"`
 */
export const readFoilGetTokenAmounts = /*#__PURE__*/ createReadContract({
  abi: foilAbi,
  functionName: 'getTokenAmounts',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"getReferencePrice"`
 */
export const readFoilGetReferencePrice = /*#__PURE__*/ createReadContract({
  abi: foilAbi,
  functionName: 'getReferencePrice',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"balanceOf"`
 */
export const readFoilBalanceOf = /*#__PURE__*/ createReadContract({
  abi: foilAbi,
  functionName: 'balanceOf',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"getApproved"`
 */
export const readFoilGetApproved = /*#__PURE__*/ createReadContract({
  abi: foilAbi,
  functionName: 'getApproved',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"isApprovedForAll"`
 */
export const readFoilIsApprovedForAll = /*#__PURE__*/ createReadContract({
  abi: foilAbi,
  functionName: 'isApprovedForAll',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"name"`
 */
export const readFoilName = /*#__PURE__*/ createReadContract({
  abi: foilAbi,
  functionName: 'name',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"ownerOf"`
 */
export const readFoilOwnerOf = /*#__PURE__*/ createReadContract({
  abi: foilAbi,
  functionName: 'ownerOf',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"symbol"`
 */
export const readFoilSymbol = /*#__PURE__*/ createReadContract({
  abi: foilAbi,
  functionName: 'symbol',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"tokenByIndex"`
 */
export const readFoilTokenByIndex = /*#__PURE__*/ createReadContract({
  abi: foilAbi,
  functionName: 'tokenByIndex',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"tokenOfOwnerByIndex"`
 */
export const readFoilTokenOfOwnerByIndex = /*#__PURE__*/ createReadContract({
  abi: foilAbi,
  functionName: 'tokenOfOwnerByIndex',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"tokenURI"`
 */
export const readFoilTokenUri = /*#__PURE__*/ createReadContract({
  abi: foilAbi,
  functionName: 'tokenURI',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"totalSupply"`
 */
export const readFoilTotalSupply = /*#__PURE__*/ createReadContract({
  abi: foilAbi,
  functionName: 'totalSupply',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"getEpoch"`
 */
export const readFoilGetEpoch = /*#__PURE__*/ createReadContract({
  abi: foilAbi,
  functionName: 'getEpoch',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"getLatestEpoch"`
 */
export const readFoilGetLatestEpoch = /*#__PURE__*/ createReadContract({
  abi: foilAbi,
  functionName: 'getLatestEpoch',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"getMarket"`
 */
export const readFoilGetMarket = /*#__PURE__*/ createReadContract({
  abi: foilAbi,
  functionName: 'getMarket',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"getPosition"`
 */
export const readFoilGetPosition = /*#__PURE__*/ createReadContract({
  abi: foilAbi,
  functionName: 'getPosition',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"getPositionSize"`
 */
export const readFoilGetPositionSize = /*#__PURE__*/ createReadContract({
  abi: foilAbi,
  functionName: 'getPositionSize',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const readFoilSupportsInterface = /*#__PURE__*/ createReadContract({
  abi: foilAbi,
  functionName: 'supportsInterface',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link foilAbi}__
 */
export const writeFoil = /*#__PURE__*/ createWriteContract({ abi: foilAbi })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"acceptOwnership"`
 */
export const writeFoilAcceptOwnership = /*#__PURE__*/ createWriteContract({
  abi: foilAbi,
  functionName: 'acceptOwnership',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"createEpoch"`
 */
export const writeFoilCreateEpoch = /*#__PURE__*/ createWriteContract({
  abi: foilAbi,
  functionName: 'createEpoch',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"initializeMarket"`
 */
export const writeFoilInitializeMarket = /*#__PURE__*/ createWriteContract({
  abi: foilAbi,
  functionName: 'initializeMarket',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const writeFoilTransferOwnership = /*#__PURE__*/ createWriteContract({
  abi: foilAbi,
  functionName: 'transferOwnership',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"updateMarket"`
 */
export const writeFoilUpdateMarket = /*#__PURE__*/ createWriteContract({
  abi: foilAbi,
  functionName: 'updateMarket',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"createLiquidityPosition"`
 */
export const writeFoilCreateLiquidityPosition =
  /*#__PURE__*/ createWriteContract({
    abi: foilAbi,
    functionName: 'createLiquidityPosition',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"decreaseLiquidityPosition"`
 */
export const writeFoilDecreaseLiquidityPosition =
  /*#__PURE__*/ createWriteContract({
    abi: foilAbi,
    functionName: 'decreaseLiquidityPosition',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"increaseLiquidityPosition"`
 */
export const writeFoilIncreaseLiquidityPosition =
  /*#__PURE__*/ createWriteContract({
    abi: foilAbi,
    functionName: 'increaseLiquidityPosition',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"assertionDisputedCallback"`
 */
export const writeFoilAssertionDisputedCallback =
  /*#__PURE__*/ createWriteContract({
    abi: foilAbi,
    functionName: 'assertionDisputedCallback',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"assertionResolvedCallback"`
 */
export const writeFoilAssertionResolvedCallback =
  /*#__PURE__*/ createWriteContract({
    abi: foilAbi,
    functionName: 'assertionResolvedCallback',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"submitSettlementPrice"`
 */
export const writeFoilSubmitSettlementPrice = /*#__PURE__*/ createWriteContract(
  { abi: foilAbi, functionName: 'submitSettlementPrice' },
)

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"createTraderPosition"`
 */
export const writeFoilCreateTraderPosition = /*#__PURE__*/ createWriteContract({
  abi: foilAbi,
  functionName: 'createTraderPosition',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"modifyTraderPosition"`
 */
export const writeFoilModifyTraderPosition = /*#__PURE__*/ createWriteContract({
  abi: foilAbi,
  functionName: 'modifyTraderPosition',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"quoteCreateTraderPosition"`
 */
export const writeFoilQuoteCreateTraderPosition =
  /*#__PURE__*/ createWriteContract({
    abi: foilAbi,
    functionName: 'quoteCreateTraderPosition',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"quoteModifyTraderPosition"`
 */
export const writeFoilQuoteModifyTraderPosition =
  /*#__PURE__*/ createWriteContract({
    abi: foilAbi,
    functionName: 'quoteModifyTraderPosition',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"approve"`
 */
export const writeFoilApprove = /*#__PURE__*/ createWriteContract({
  abi: foilAbi,
  functionName: 'approve',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"safeTransferFrom"`
 */
export const writeFoilSafeTransferFrom = /*#__PURE__*/ createWriteContract({
  abi: foilAbi,
  functionName: 'safeTransferFrom',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"setApprovalForAll"`
 */
export const writeFoilSetApprovalForAll = /*#__PURE__*/ createWriteContract({
  abi: foilAbi,
  functionName: 'setApprovalForAll',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"transferFrom"`
 */
export const writeFoilTransferFrom = /*#__PURE__*/ createWriteContract({
  abi: foilAbi,
  functionName: 'transferFrom',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"settlePosition"`
 */
export const writeFoilSettlePosition = /*#__PURE__*/ createWriteContract({
  abi: foilAbi,
  functionName: 'settlePosition',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link foilAbi}__
 */
export const simulateFoil = /*#__PURE__*/ createSimulateContract({
  abi: foilAbi,
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"acceptOwnership"`
 */
export const simulateFoilAcceptOwnership = /*#__PURE__*/ createSimulateContract(
  { abi: foilAbi, functionName: 'acceptOwnership' },
)

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"createEpoch"`
 */
export const simulateFoilCreateEpoch = /*#__PURE__*/ createSimulateContract({
  abi: foilAbi,
  functionName: 'createEpoch',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"initializeMarket"`
 */
export const simulateFoilInitializeMarket =
  /*#__PURE__*/ createSimulateContract({
    abi: foilAbi,
    functionName: 'initializeMarket',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const simulateFoilTransferOwnership =
  /*#__PURE__*/ createSimulateContract({
    abi: foilAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"updateMarket"`
 */
export const simulateFoilUpdateMarket = /*#__PURE__*/ createSimulateContract({
  abi: foilAbi,
  functionName: 'updateMarket',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"createLiquidityPosition"`
 */
export const simulateFoilCreateLiquidityPosition =
  /*#__PURE__*/ createSimulateContract({
    abi: foilAbi,
    functionName: 'createLiquidityPosition',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"decreaseLiquidityPosition"`
 */
export const simulateFoilDecreaseLiquidityPosition =
  /*#__PURE__*/ createSimulateContract({
    abi: foilAbi,
    functionName: 'decreaseLiquidityPosition',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"increaseLiquidityPosition"`
 */
export const simulateFoilIncreaseLiquidityPosition =
  /*#__PURE__*/ createSimulateContract({
    abi: foilAbi,
    functionName: 'increaseLiquidityPosition',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"assertionDisputedCallback"`
 */
export const simulateFoilAssertionDisputedCallback =
  /*#__PURE__*/ createSimulateContract({
    abi: foilAbi,
    functionName: 'assertionDisputedCallback',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"assertionResolvedCallback"`
 */
export const simulateFoilAssertionResolvedCallback =
  /*#__PURE__*/ createSimulateContract({
    abi: foilAbi,
    functionName: 'assertionResolvedCallback',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"submitSettlementPrice"`
 */
export const simulateFoilSubmitSettlementPrice =
  /*#__PURE__*/ createSimulateContract({
    abi: foilAbi,
    functionName: 'submitSettlementPrice',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"createTraderPosition"`
 */
export const simulateFoilCreateTraderPosition =
  /*#__PURE__*/ createSimulateContract({
    abi: foilAbi,
    functionName: 'createTraderPosition',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"modifyTraderPosition"`
 */
export const simulateFoilModifyTraderPosition =
  /*#__PURE__*/ createSimulateContract({
    abi: foilAbi,
    functionName: 'modifyTraderPosition',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"quoteCreateTraderPosition"`
 */
export const simulateFoilQuoteCreateTraderPosition =
  /*#__PURE__*/ createSimulateContract({
    abi: foilAbi,
    functionName: 'quoteCreateTraderPosition',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"quoteModifyTraderPosition"`
 */
export const simulateFoilQuoteModifyTraderPosition =
  /*#__PURE__*/ createSimulateContract({
    abi: foilAbi,
    functionName: 'quoteModifyTraderPosition',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"approve"`
 */
export const simulateFoilApprove = /*#__PURE__*/ createSimulateContract({
  abi: foilAbi,
  functionName: 'approve',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"safeTransferFrom"`
 */
export const simulateFoilSafeTransferFrom =
  /*#__PURE__*/ createSimulateContract({
    abi: foilAbi,
    functionName: 'safeTransferFrom',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"setApprovalForAll"`
 */
export const simulateFoilSetApprovalForAll =
  /*#__PURE__*/ createSimulateContract({
    abi: foilAbi,
    functionName: 'setApprovalForAll',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"transferFrom"`
 */
export const simulateFoilTransferFrom = /*#__PURE__*/ createSimulateContract({
  abi: foilAbi,
  functionName: 'transferFrom',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link foilAbi}__ and `functionName` set to `"settlePosition"`
 */
export const simulateFoilSettlePosition = /*#__PURE__*/ createSimulateContract({
  abi: foilAbi,
  functionName: 'settlePosition',
})

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link foilAbi}__
 */
export const watchFoilEvent = /*#__PURE__*/ createWatchContractEvent({
  abi: foilAbi,
})

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link foilAbi}__ and `eventName` set to `"EpochCreated"`
 */
export const watchFoilEpochCreatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: foilAbi,
    eventName: 'EpochCreated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link foilAbi}__ and `eventName` set to `"Initialized"`
 */
export const watchFoilInitializedEvent = /*#__PURE__*/ createWatchContractEvent(
  { abi: foilAbi, eventName: 'Initialized' },
)

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link foilAbi}__ and `eventName` set to `"MarketInitialized"`
 */
export const watchFoilMarketInitializedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: foilAbi,
    eventName: 'MarketInitialized',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link foilAbi}__ and `eventName` set to `"MarketUpdated"`
 */
export const watchFoilMarketUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: foilAbi,
    eventName: 'MarketUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link foilAbi}__ and `eventName` set to `"OwnershipTransferStarted"`
 */
export const watchFoilOwnershipTransferStartedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: foilAbi,
    eventName: 'OwnershipTransferStarted',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link foilAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const watchFoilOwnershipTransferredEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: foilAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link foilAbi}__ and `eventName` set to `"LiquidityPositionClosed"`
 */
export const watchFoilLiquidityPositionClosedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: foilAbi,
    eventName: 'LiquidityPositionClosed',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link foilAbi}__ and `eventName` set to `"LiquidityPositionCreated"`
 */
export const watchFoilLiquidityPositionCreatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: foilAbi,
    eventName: 'LiquidityPositionCreated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link foilAbi}__ and `eventName` set to `"LiquidityPositionDecreased"`
 */
export const watchFoilLiquidityPositionDecreasedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: foilAbi,
    eventName: 'LiquidityPositionDecreased',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link foilAbi}__ and `eventName` set to `"LiquidityPositionIncreased"`
 */
export const watchFoilLiquidityPositionIncreasedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: foilAbi,
    eventName: 'LiquidityPositionIncreased',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link foilAbi}__ and `eventName` set to `"Transfer"`
 */
export const watchFoilTransferEvent = /*#__PURE__*/ createWatchContractEvent({
  abi: foilAbi,
  eventName: 'Transfer',
})

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link foilAbi}__ and `eventName` set to `"MarketSettled"`
 */
export const watchFoilMarketSettledEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: foilAbi,
    eventName: 'MarketSettled',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link foilAbi}__ and `eventName` set to `"SettlementDisputed"`
 */
export const watchFoilSettlementDisputedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: foilAbi,
    eventName: 'SettlementDisputed',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link foilAbi}__ and `eventName` set to `"SettlementSubmitted"`
 */
export const watchFoilSettlementSubmittedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: foilAbi,
    eventName: 'SettlementSubmitted',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link foilAbi}__ and `eventName` set to `"TraderPositionCreated"`
 */
export const watchFoilTraderPositionCreatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: foilAbi,
    eventName: 'TraderPositionCreated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link foilAbi}__ and `eventName` set to `"TraderPositionModified"`
 */
export const watchFoilTraderPositionModifiedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: foilAbi,
    eventName: 'TraderPositionModified',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link foilAbi}__ and `eventName` set to `"Approval"`
 */
export const watchFoilApprovalEvent = /*#__PURE__*/ createWatchContractEvent({
  abi: foilAbi,
  eventName: 'Approval',
})

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link foilAbi}__ and `eventName` set to `"ApprovalForAll"`
 */
export const watchFoilApprovalForAllEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: foilAbi,
    eventName: 'ApprovalForAll',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link foilAbi}__ and `eventName` set to `"PositionSettled"`
 */
export const watchFoilPositionSettledEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: foilAbi,
    eventName: 'PositionSettled',
  })
