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
    }

    struct LiquidityDecreaseParams {
        uint256 positionId;
        uint256 collateralAmount;
        uint128 liquidity;
        uint256 minGasAmount;
        uint256 minEthAmount;
    }

    struct LiquidityIncreaseParams {
        uint256 positionId;
        uint256 collateralAmount;
        uint256 gasTokenAmount;
        uint256 ethTokenAmount;
        uint256 minGasAmount;
        uint256 minEthAmount;
    }

    struct TraderPositionParams {
        uint256 positionId;
        uint256 amountTokenA;
        uint256 amountTokenB;
        uint256 collateralAmount;
        int256 size;
    }

    struct EpochParams {
        int24 baseAssetMinPriceTick;
        int24 baseAssetMaxPriceTick;
        uint24 feeRate;
        uint64 assertionLiveness;
        address bondCurrency;
        uint256 bondAmount;
        bytes32 priceUnit;
    }
}
