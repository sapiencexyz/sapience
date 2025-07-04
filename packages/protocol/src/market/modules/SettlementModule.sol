// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ISapienceStructs} from "../interfaces/ISapienceStructs.sol";
import {Position} from "../storage/Position.sol";
import {Market} from "../storage/Market.sol";
import {MarketGroup} from "../storage/MarketGroup.sol";
import {Errors} from "../storage/Errors.sol";
import {Pool} from "../libraries/Pool.sol";
import {DecimalPrice} from "../libraries/DecimalPrice.sol";
import {ERC721Storage} from "../storage/ERC721Storage.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {ISettlementModule} from "../interfaces/ISettlementModule.sol";
import {ISapiencePositionEvents} from "../interfaces/ISapiencePositionEvents.sol";
import {INonfungiblePositionManager} from "../interfaces/external/INonfungiblePositionManager.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

contract SettlementModule is ISettlementModule, ReentrancyGuardUpgradeable {
    using Position for Position.Data;
    using MarketGroup for MarketGroup.Data;
    using Market for Market.Data;

    function settlePosition(uint256 positionId) external override nonReentrant returns (uint256 withdrawnCollateral) {
        Position.Data storage position = Position.loadValid(positionId);
        Market.Data storage market = Market.loadValid(position.marketId);
        MarketGroup.Data storage marketGroup = MarketGroup.load();

        if (ERC721Storage._ownerOf(positionId) != msg.sender) {
            revert Errors.NotAccountOwner(positionId, msg.sender);
        }

        // Ensure the market has ended
        if (!market.settled) {
            revert Errors.MarketNotSettled(position.marketId);
        }

        // Ensure the position hasn't been settled already
        if (position.isSettled) {
            revert Errors.PositionAlreadySettled(positionId);
        }

        // Perform settlement logic based on position kind
        uint256 withdrawableCollateral;
        if (position.kind == ISapienceStructs.PositionKind.Liquidity) {
            withdrawableCollateral = _settleLiquidityPosition(position, market);
        } else if (position.kind == ISapienceStructs.PositionKind.Trade) {
            withdrawableCollateral = position.settle(market.settlementPriceD18);
        } else {
            revert Errors.InvalidPositionKind();
        }

        withdrawnCollateral = marketGroup.withdrawCollateral(msg.sender, withdrawableCollateral);

        int256 deltaCollateral = -int256(withdrawnCollateral);

        // update position collateral. If there is more than zero deposited collateral, after this update, it means there wasn't any collateral left in the contract.
        position.depositedCollateralAmount -= withdrawnCollateral;

        emit ISapiencePositionEvents.PositionSettled(
            positionId,
            withdrawnCollateral,
            position.depositedCollateralAmount,
            position.vQuoteAmount,
            position.vBaseAmount,
            position.borrowedVQuote,
            position.borrowedVBase,
            deltaCollateral,
            position.marketId,
            msg.sender
        );
    }

    function __manual_setSettlementPrice() external override returns (uint160 settlementPriceX96) {
        uint256 DURATION_MULTIPLIER = 2;

        MarketGroup.Data storage marketGroup = MarketGroup.load();
        Market.Data storage market = Market.loadValid(marketGroup.lastMarketId);

        if (market.settled) {
            revert Errors.MarketSettled();
        }

        uint256 marketDuration = market.endTime - market.startTime;
        uint256 requiredDelay = marketDuration * DURATION_MULTIPLIER;
        uint256 timeSinceEnd = block.timestamp - market.endTime;

        if (timeSinceEnd < requiredDelay) {
            revert Errors.ManualSettlementTooEarly(requiredDelay - timeSinceEnd);
        }

        settlementPriceX96 = market.getCurrentPoolPriceSqrtX96();
        market.setSettlementPriceInRange(DecimalPrice.sqrtRatioX96ToPrice(settlementPriceX96));

        // update settlement
        market.settlement = Market.Settlement({
            settlementPriceSqrtX96: settlementPriceX96,
            submissionTime: block.timestamp,
            disputed: false
        });

        emit MarketManualSettlement(market.id, settlementPriceX96);
    }

    function _settleLiquidityPosition(Position.Data storage position, Market.Data storage market)
        internal
        returns (uint256)
    {
        // Get current token amounts using Pool library
        (uint256 currentAmount0, uint256 currentAmount1,,,,,) = Pool.getCurrentPositionTokenAmounts(market, position);

        // Update the position's token amounts with the current values
        position.vBaseAmount += currentAmount0;
        position.vQuoteAmount += currentAmount1;

        // Collect fees from the Uniswap position
        (uint256 amount0, uint256 amount1) = INonfungiblePositionManager(market.marketParams.uniswapPositionManager)
            .collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: position.uniswapPositionId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        // Update the position's token amounts
        position.vBaseAmount += amount0;
        position.vQuoteAmount += amount1;

        return position.settle(market.settlementPriceD18);
    }
}
