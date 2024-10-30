// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IFoilStructs} from "../interfaces/IFoilStructs.sol";
import {Position} from "../storage/Position.sol";
import {Epoch} from "../storage/Epoch.sol";
import {Market} from "../storage/Market.sol";
import {Errors} from "../storage/Errors.sol";
import {Pool} from "../libraries/Pool.sol";
import {DecimalPrice} from "../libraries/DecimalPrice.sol";
import {ERC721Storage} from "../storage/ERC721Storage.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {ISettlementModule} from "../interfaces/ISettlementModule.sol";
import {INonfungiblePositionManager} from "../interfaces/external/INonfungiblePositionManager.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

contract SettlementModule is ISettlementModule, ReentrancyGuardUpgradeable {
    using Position for Position.Data;
    using Market for Market.Data;

    function settlePosition(
        uint256 positionId
    ) external override nonReentrant returns (uint256 withdrawableCollateral) {
        Position.Data storage position = Position.loadValid(positionId);
        Epoch.Data storage epoch = Epoch.loadValid(position.epochId);
        Market.Data storage market = Market.load();

        if (ERC721Storage._ownerOf(positionId) != msg.sender) {
            revert Errors.NotAccountOwnerOrAuthorized(positionId, msg.sender);
        }

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
                market,
                epoch
            );
        } else if (position.kind == IFoilStructs.PositionKind.Trade) {
            withdrawableCollateral = position.settle(epoch.settlementPriceD18);
        } else {
            revert Errors.InvalidPositionKind();
        }

        market.withdrawCollateral(msg.sender, withdrawableCollateral);

        emit PositionSettled(positionId, withdrawableCollateral);
    }

    function _settleLiquidityPosition(
        Position.Data storage position,
        Market.Data storage market,
        Epoch.Data storage epoch
    ) internal returns (uint256) {
        // Get current token amounts using Pool library
        (uint256 currentAmount0, uint256 currentAmount1, , , ) = Pool
            .getCurrentPositionTokenAmounts(market, epoch, position);

        // Update the position's token amounts with the current values
        position.vGasAmount += currentAmount0;
        position.vEthAmount += currentAmount1;

        // Collect fees from the Uniswap position
        (uint256 amount0, uint256 amount1) = INonfungiblePositionManager(
            epoch.marketParams.uniswapPositionManager
        ).collect(
                INonfungiblePositionManager.CollectParams({
                    tokenId: position.uniswapPositionId,
                    recipient: address(this),
                    amount0Max: type(uint128).max,
                    amount1Max: type(uint128).max
                })
            );

        // Update the position's token amounts
        position.vGasAmount += amount0;
        position.vEthAmount += amount1;

        return position.settle(epoch.settlementPriceD18);
    }
}
