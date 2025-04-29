// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

interface IFoilStructs {
    enum PositionKind {
        Unknown,
        Liquidity,
        Trade
    }

    struct LiquidityMintParams {
        uint256 epochId;
        uint256 amountTokenA;
        uint256 amountTokenB;
        uint256 collateralAmount;
        int24 lowerTick;
        int24 upperTick;
        uint256 minAmountTokenA;
        uint256 minAmountTokenB;
        uint256 deadline;
    }

    struct LiquidityDecreaseParams {
        uint256 positionId;
        uint128 liquidity;
        uint256 minGasAmount;
        uint256 minEthAmount;
        uint256 deadline;
    }

    struct LiquidityIncreaseParams {
        uint256 positionId;
        uint256 collateralAmount;
        uint256 gasTokenAmount;
        uint256 ethTokenAmount;
        uint256 minGasAmount;
        uint256 minEthAmount;
        uint256 deadline;
    }

    struct MarketParams {
        uint24 feeRate;
        uint64 assertionLiveness;
        uint256 bondAmount;
        address bondCurrency;
        address uniswapPositionManager;
        address uniswapSwapRouter;
        address uniswapQuoter;
        address optimisticOracleV3;
    }

    struct EpochData {
        uint256 epochId;
        uint256 startTime;
        uint256 endTime;
        address pool;
        address ethToken;
        address gasToken;
        uint256 minPriceD18;
        uint256 maxPriceD18;
        int24 baseAssetMinPriceTick;
        int24 baseAssetMaxPriceTick;
        bool settled;
        uint256 settlementPriceD18;
        bytes32 assertionId;
        bytes claimStatement;
    }
}
