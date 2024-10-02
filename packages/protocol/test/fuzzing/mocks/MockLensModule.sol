//SPDX-License-Identifier: MIT
pragma solidity >=0.8.11 <0.9.0;

import {LiquidityModule as EpochLiquidityModule} from "../../../src/contracts/modules/LiquidityModule.sol";

import {Market} from "../../../src/contracts/storage/Market.sol";
import "../../../src/contracts/storage/Position.sol";
import {Epoch} from "../../../src/contracts/storage/Epoch.sol";
import {FullMath} from "../../../src/contracts/external/univ3/FullMath.sol";
import {LiquidityAmounts} from "../../../src/contracts/external/univ3/LiquidityAmounts.sol";
import {Pool} from "../../../src/contracts/libraries/Pool.sol";

contract MockLensModule is EpochLiquidityModule {
    using Market for Market.Data;
    using Position for Position.Data;
    using Epoch for Epoch.Data;

    function getPositionLiquidity(
        uint positionId
    )
        public
        returns (
            uint256 amount0,
            uint256 amount1,
            int24 lowerTick,
            int24 upperTick,
            uint128 previousLiquidity
        )
    {
        Market.Data storage market = Market.load();
        Position.Data storage position = Position.loadValid(positionId);
        Epoch.Data storage epoch = Epoch.loadValid(position.epochId);

        position.preValidateLp(); //this will revert if msg.sender != owner of position
        (amount0, amount1, lowerTick, upperTick, previousLiquidity) = Pool
            .getCurrentPositionTokenAmounts(market, epoch, position);
    }

    function getEthToGas(uint ethAmount, uint epochId) public returns (uint) {
        Epoch.Data storage epoch = Epoch.loadValid(epochId);
        uint256 decimalPrice = epoch.getCurrentPoolPrice();
        return FullMath.mulDiv(ethAmount, 1e18, decimalPrice);
    }

    function getSettlementPrice(uint epochId) public returns (uint) {
        Epoch.Data storage epoch = Epoch.loadValid(epochId);
        return epoch.settlementPriceD18;
    }

    function getCurrentPrice(uint epochId) public returns (uint) {
        Epoch.Data storage epoch = Epoch.loadValid(epochId);
        return epoch.getCurrentPoolPrice();
    }

    function getMarketOwner() public returns (address) {
        Market.Data storage market = Market.load();
        return market.owner;
    }

    function getCurrentEpochTicks(uint epochId) public returns (int24, int24) {
        Epoch.Data storage epoch = Epoch.loadValid(epochId);
        return (
            epoch.params.baseAssetMinPriceTick,
            epoch.params.baseAssetMaxPriceTick
        );
    }

    function getCurrentEpochSqrtPriceX96MaxMin(
        uint epochId
    ) public returns (uint160, uint160) {
        Epoch.Data storage epoch = Epoch.loadValid(epochId);
        return (epoch.sqrtPriceMinX96, epoch.sqrtPriceMaxX96);
    }

    function getAmount0ForLiquidity_Foil(
        uint160 sqrtRatioAX96,
        uint160 sqrtRatioBX96,
        uint128 liquidity
    ) public returns (uint256 amount0) {
        return
            LiquidityAmounts.getAmount0ForLiquidity(
                sqrtRatioAX96,
                sqrtRatioBX96,
                liquidity
            );
    }

    function getPositionOwner(
        uint256 positionId
    ) public view returns (address) {
        Position.Data storage position = Position.loadValid(positionId);
        return ERC721Storage._ownerOf(position.id);
    }
}
