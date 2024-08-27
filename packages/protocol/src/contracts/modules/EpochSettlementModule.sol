// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IFoilStructs} from "../interfaces/IFoilStructs.sol";
import {Position} from "../storage/Position.sol";
import {Epoch} from "../storage/Epoch.sol";
import {Market} from "../storage/Market.sol";
import {Errors} from "../storage/Errors.sol";

contract EpochSettlementModule {
    function settlePosition(
        uint256 positionId
    ) external returns (uint256 withdrawableCollateral) {
        Position.Data storage position = Position.loadValid(positionId);
        Epoch.Data storage epoch = Epoch.loadValid(position.epochId);
        Market.Data storage market = Market.load();

        // Ensure the epoch has ended
        if (!epoch.settled) {
            revert Errors.EpochNotSettled(position.epochId);
        }

        // Ensure the position hasn't been settled already
        if (position.isSettled) {
            revert Errors.PositionAlreadySettled(positionId);
        }

        // Perform settlement logic based on position kind
        if (position.kind == IFoilStructs.PositionKind.Liquidity) {
            withdrawableCollateral = _settleLiquidityPosition(
                position,
                epoch,
                market
            );
        } else if (position.kind == IFoilStructs.PositionKind.Trade) {
            withdrawableCollateral = position.settle(epoch.settlementPriceD18);
        } else {
            revert Errors.InvalidPositionKind();
        }

        market.withdraw(msg.sender, withdrawableCollateral);

        emit PositionSettled(positionId, withdrawnCollateral);
    }

    function _settleLiquidityPosition(
        Position.Data storage position,
        Epoch.Data storage epoch,
        Market.Data storage market
    ) internal {
        // Collect fees from the Uniswap position
        (uint256 amount0, uint256 amount1) = epoch.pool.collect(
            address(this),
            position.uniswapPositionId,
            type(uint128).max,
            type(uint128).max
        );

        // Update the position's token amounts
        position.vGasAmount += amount0;
        position.vEthAmount += amount1;

        uint256 withdrawableCollateral = position.settle(
            epoch.settlementPriceD18
        );

        return withdrawableCollateral;
    }
}
