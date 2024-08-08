// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

interface IFoilStructs {
    enum PositionKind {
        Liquidity,
        Trade
    }
    struct LiquidityPositionParams {
        uint256 epochId;
        uint256 amountTokenA;
        uint256 amountTokenB;
        uint256 collateralAmount;
        int24 lowerTick;
        int24 upperTick;
        uint256 minAmountTokenA;
        uint256 minAmountTokenB;
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
