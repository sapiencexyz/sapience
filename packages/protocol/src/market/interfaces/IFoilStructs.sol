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

    struct EpochParams {
        int24 baseAssetMinPriceTick;
        int24 baseAssetMaxPriceTick;
        uint24 feeRate;
        uint64 assertionLiveness;
        uint256 bondAmount;
        address bondCurrency;
        address uniswapPositionManager;
        address uniswapSwapRouter;
        address uniswapQuoter;
        address optimisticOracleV3;
        bytes claimStatement;
    }
}
