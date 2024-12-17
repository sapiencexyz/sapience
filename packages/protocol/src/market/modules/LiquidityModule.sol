// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "../storage/ERC721EnumerableStorage.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "../storage/Position.sol";
import {IFoilStructs} from "../interfaces/IFoilStructs.sol";
import {ILiquidityModule} from "../interfaces/ILiquidityModule.sol";
import {Pool} from "../libraries/Pool.sol";

contract LiquidityModule is ReentrancyGuardUpgradeable, ILiquidityModule {
    using Position for Position.Data;
    using Epoch for Epoch.Data;
    using Market for Market.Data;

    function createLiquidityPosition(
        IFoilStructs.LiquidityMintParams calldata params
    )
        external
        override
        nonReentrant
        returns (
            uint256 id,
            uint256 requiredCollateralAmount,
            uint256 totalDepositedCollateralAmount,
            uint256 uniswapNftId,
            uint128 liquidity,
            uint256 addedAmount0,
            uint256 addedAmount1
        )
    {
        if (params.deadline < block.timestamp) {
            revert Errors.TransactionExpired(params.deadline, block.timestamp);
        }

        id = ERC721EnumerableStorage.totalSupply() + 1;
        Position.Data storage position = Position.createValid(id);
        if (
            !ERC721Storage._checkOnERC721Received(
                address(this),
                msg.sender,
                id,
                ""
            )
        ) {
            revert Errors.InvalidTransferRecipient(msg.sender);
        }
        ERC721Storage._mint(msg.sender, id);

        Market.Data storage market = Market.load();
        Epoch.Data storage epoch = Epoch.loadValid(params.epochId);
        epoch.validateLpRequirements(params.lowerTick, params.upperTick);

        (
            uniswapNftId,
            liquidity,
            addedAmount0,
            addedAmount1
        ) = INonfungiblePositionManager(
            epoch.marketParams.uniswapPositionManager
        ).mint(
                INonfungiblePositionManager.MintParams({
                    token0: address(epoch.gasToken),
                    token1: address(epoch.ethToken),
                    fee: epoch.marketParams.feeRate,
                    tickLower: params.lowerTick,
                    tickUpper: params.upperTick,
                    amount0Desired: params.amountTokenA,
                    amount1Desired: params.amountTokenB,
                    amount0Min: params.minAmountTokenA,
                    amount1Min: params.minAmountTokenB,
                    recipient: address(this),
                    deadline: params.deadline
                })
            );

        bool isFeeCollector = market.isFeeCollector(msg.sender);
        (
            requiredCollateralAmount,
            totalDepositedCollateralAmount,
            ,

        ) = position.updateValidLp(
            epoch,
            Position.UpdateLpParams({
                uniswapNftId: uniswapNftId,
                liquidity: liquidity,
                additionalCollateral: params.collateralAmount,
                additionalLoanAmount0: addedAmount0,
                additionalLoanAmount1: addedAmount1,
                lowerTick: params.lowerTick,
                upperTick: params.upperTick,
                tokensOwed0: 0,
                tokensOwed1: 0,
                isFeeCollector: isFeeCollector
            })
        );

        position.updateCollateral(totalDepositedCollateralAmount);

        _emitLiquidityPositionCreated(
            ILiquidityModule.LiquidityPositionCreatedEventData({
                sender: msg.sender,
                epochId: epoch.id,
                positionId: id,
                depositedCollateralAmount: position.depositedCollateralAmount,
                liquidity: liquidity,
                addedAmount0: addedAmount0,
                addedAmount1: addedAmount1,
                lowerTick: params.lowerTick,
                upperTick: params.upperTick
            })
        );
    }

    function decreaseLiquidityPosition(
        IFoilStructs.LiquidityDecreaseParams memory params
    )
        external
        override
        nonReentrant
        returns (
            uint256 decreasedAmount0,
            uint256 decreasedAmount1,
            uint256 collateralAmount
        )
    {
        if (params.deadline < block.timestamp) {
            revert Errors.TransactionExpired(params.deadline, block.timestamp);
        }

        DecreaseLiquidityPositionStack memory stack;

        Market.Data storage market = Market.load();
        Position.Data storage position = Position.loadValid(params.positionId);
        Epoch.Data storage epoch = Epoch.loadValid(position.epochId);

        epoch.validateEpochNotExpired();
        position.preValidateLp();
        (
            stack.previousAmount0,
            stack.previousAmount1,
            stack.lowerTick,
            stack.upperTick,
            stack.previousLiquidity,
            ,

        ) = Pool.getCurrentPositionTokenAmounts(epoch, position);

        stack.decreaseParams = INonfungiblePositionManager
            .DecreaseLiquidityParams({
                tokenId: position.uniswapPositionId,
                liquidity: params.liquidity,
                amount0Min: params.minGasAmount,
                amount1Min: params.minEthAmount,
                deadline: params.deadline
            });

        (decreasedAmount0, decreasedAmount1) = INonfungiblePositionManager(
            epoch.marketParams.uniswapPositionManager
        ).decreaseLiquidity(stack.decreaseParams);

        // if all liquidity is removed, close the position and return
        if (params.liquidity == stack.previousLiquidity)
            return _closeLiquidityPosition(market, position);

        // otherwise, validate the decreased liquidity and update the position
        // get tokens owed
        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            stack.tokensOwed0,
            stack.tokensOwed1
        ) = INonfungiblePositionManager(
            epoch.marketParams.uniswapPositionManager
        ).positions(position.uniswapPositionId);

        stack.isFeeCollector = market.isFeeCollector(msg.sender);
        (
            stack.requiredCollateralAmount,
            stack.newCollateralAmount,
            stack.loanAmount0,
            stack.loanAmount1
        ) = position.updateValidLp(
            epoch,
            Position.UpdateLpParams({
                uniswapNftId: position.uniswapPositionId,
                liquidity: stack.previousLiquidity - params.liquidity,
                additionalCollateral: 0,
                additionalLoanAmount0: 0,
                additionalLoanAmount1: 0,
                lowerTick: stack.lowerTick,
                upperTick: stack.upperTick,
                tokensOwed0: stack.tokensOwed0, // decreased token0 + any fees accrued
                tokensOwed1: stack.tokensOwed1, // decreased token1 + any fees accrued
                isFeeCollector: stack.isFeeCollector
            })
        );

        // return collateral that isn't required when decreasing position
        // this is checked in updateValidLp but ignored when feeCollector
        // so we add the check here and return any excess collateral
        if (stack.newCollateralAmount > stack.requiredCollateralAmount) {
            position.updateCollateral(stack.requiredCollateralAmount);
            collateralAmount = stack.requiredCollateralAmount;
        } else {
            collateralAmount = stack.newCollateralAmount;
        }

        emit LiquidityPositionDecreased(
            msg.sender,
            epoch.id,
            position.id,
            stack.requiredCollateralAmount,
            params.liquidity,
            decreasedAmount0,
            decreasedAmount1,
            stack.loanAmount0,
            stack.loanAmount1
        );
    }

    function increaseLiquidityPosition(
        IFoilStructs.LiquidityIncreaseParams memory params
    )
        external
        nonReentrant
        returns (
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1,
            uint256 requiredCollateralAmount,
            uint256 totalDepositedCollateralAmount
        )
    {
        if (params.deadline < block.timestamp) {
            revert Errors.TransactionExpired(params.deadline, block.timestamp);
        }

        IncreaseLiquidityPositionStack memory stack;

        Market.Data storage market = Market.load();
        Position.Data storage position = Position.loadValid(params.positionId);
        Epoch.Data storage epoch = Epoch.loadValid(position.epochId);

        epoch.validateEpochNotExpired();
        position.preValidateLp();

        (
            stack.previousAmount0,
            stack.previousAmount1,
            stack.lowerTick,
            stack.upperTick,
            stack.previousLiquidity,
            ,

        ) = Pool.getCurrentPositionTokenAmounts(epoch, position);

        stack.increaseParams = INonfungiblePositionManager
            .IncreaseLiquidityParams({
                tokenId: position.uniswapPositionId,
                amount0Desired: params.gasTokenAmount,
                amount1Desired: params.ethTokenAmount,
                amount0Min: params.minGasAmount,
                amount1Min: params.minEthAmount,
                deadline: params.deadline
            });

        (liquidity, amount0, amount1) = INonfungiblePositionManager(
            epoch.marketParams.uniswapPositionManager
        ).increaseLiquidity(stack.increaseParams);

        // get tokens owed
        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            stack.tokensOwed0,
            stack.tokensOwed1
        ) = INonfungiblePositionManager(
            epoch.marketParams.uniswapPositionManager
        ).positions(position.uniswapPositionId);

        stack.isFeeCollector = market.isFeeCollector(msg.sender);
        (
            requiredCollateralAmount,
            totalDepositedCollateralAmount,
            stack.loanAmount0,
            stack.loanAmount1
        ) = position.updateValidLp(
            epoch,
            Position.UpdateLpParams({
                uniswapNftId: position.uniswapPositionId,
                liquidity: stack.previousLiquidity + liquidity,
                additionalCollateral: params.collateralAmount,
                additionalLoanAmount0: amount0, // these are the added tokens to the position
                additionalLoanAmount1: amount1,
                lowerTick: stack.lowerTick,
                upperTick: stack.upperTick,
                tokensOwed0: stack.tokensOwed0,
                tokensOwed1: stack.tokensOwed1,
                isFeeCollector: stack.isFeeCollector
            })
        );

        position.updateCollateral(totalDepositedCollateralAmount);

        emit LiquidityPositionIncreased(
            msg.sender,
            epoch.id,
            position.id,
            stack.newCollateralAmount,
            liquidity,
            amount0,
            amount1,
            stack.loanAmount0,
            stack.loanAmount1
        );
    }

    struct QuoteCollateralStack {
        int24 lowerTick;
        int24 upperTick;
        uint128 currentLiquidity;
        uint256 tokensOwed0;
        uint256 tokensOwed1;
        uint160 sqrtPriceX96;
        uint160 sqrtPriceAX96;
        uint160 sqrtPriceBX96;
        uint256 finalLoanAmount0;
        uint256 finalLoanAmount1;
        uint256 amount0;
        uint256 amount1;
    }
    function quoteRequiredCollateral(
        uint256 positionId,
        uint128 liquidity
    ) external view override returns (uint256 requiredCollateral) {
        Position.Data storage position = Position.loadValid(positionId);
        Epoch.Data storage epoch = Epoch.loadValid(position.epochId);

        QuoteCollateralStack memory stack;

        (
            ,
            ,
            ,
            ,
            ,
            stack.lowerTick,
            stack.upperTick,
            stack.currentLiquidity,
            ,
            ,
            stack.tokensOwed0,
            stack.tokensOwed1
        ) = INonfungiblePositionManager(
            epoch.marketParams.uniswapPositionManager
        ).positions(position.uniswapPositionId);

        (stack.sqrtPriceX96, , , , , , ) = epoch.pool.slot0();

        stack.sqrtPriceAX96 = TickMath.getSqrtRatioAtTick(stack.lowerTick);
        stack.sqrtPriceBX96 = TickMath.getSqrtRatioAtTick(stack.upperTick);

        stack.finalLoanAmount0 = position.borrowedVGas;
        stack.finalLoanAmount1 = position.borrowedVEth;

        if (liquidity > stack.currentLiquidity) {
            (stack.amount0, stack.amount1) = LiquidityAmounts
                .getAmountsForLiquidity(
                    stack.sqrtPriceX96,
                    stack.sqrtPriceAX96,
                    stack.sqrtPriceBX96,
                    liquidity - stack.currentLiquidity
                );
            stack.finalLoanAmount0 += stack.amount0;
            stack.finalLoanAmount1 += stack.amount1;
        } else {
            (stack.amount0, stack.amount1) = LiquidityAmounts
                .getAmountsForLiquidity(
                    stack.sqrtPriceX96,
                    stack.sqrtPriceAX96,
                    stack.sqrtPriceBX96,
                    stack.currentLiquidity - liquidity
                );
            stack.tokensOwed0 += stack.amount0;
            stack.tokensOwed1 += stack.amount1;
        }

        return
            epoch.requiredCollateralForLiquidity(
                liquidity,
                stack.finalLoanAmount0,
                stack.finalLoanAmount1,
                stack.tokensOwed0,
                stack.tokensOwed1,
                stack.sqrtPriceAX96,
                stack.sqrtPriceBX96
            );
    }

    function quoteLiquidityPositionTokens(
        uint256 epochId,
        uint256 depositedCollateralAmount,
        uint160 sqrtPriceX96,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96
    )
        external
        view
        override
        returns (uint256 amount0, uint256 amount1, uint128 liquidity)
    {
        Epoch.Data storage epoch = Epoch.load(epochId);

        // calculate for unit
        uint128 unitLiquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            sqrtPriceAX96,
            sqrtPriceBX96,
            1e18,
            1e18
        );

        (uint256 unitAmount0, uint256 unitAmount1) = LiquidityAmounts
            .getAmountsForLiquidity(
                sqrtPriceX96,
                sqrtPriceAX96,
                sqrtPriceBX96,
                unitLiquidity
            );

        uint256 requiredCollateral = epoch.requiredCollateralForLiquidity(
            unitLiquidity,
            unitAmount0,
            unitAmount1,
            0,
            0,
            sqrtPriceAX96,
            sqrtPriceBX96
        );

        // scale up for fractional collateral ratio
        uint256 collateralRatio = FullMath.mulDiv(
            depositedCollateralAmount,
            1e18, // Create MathUtil and use UNIT
            requiredCollateral
        );

        // scale up liquidity by collateral amount
        return (
            FullMath.mulDiv(unitAmount0, collateralRatio, 1e18),
            FullMath.mulDiv(unitAmount1, collateralRatio, 1e18),
            uint128(unitLiquidity * collateralRatio) / 1e18
        );
    }

    function depositCollateral(
        uint256 positionId,
        uint256 collateralAmount
    ) external override {
        if (!Market.load().isFeeCollector(msg.sender)) {
            revert Errors.OnlyFeeCollector();
        }

        Position.Data storage position = Position.loadValid(positionId);
        position.validateLp();
        // add to the collateral instead of updating
        position.updateCollateral(
            position.depositedCollateralAmount + collateralAmount
        );

        emit CollateralDeposited(
            msg.sender,
            position.epochId,
            position.id,
            position.depositedCollateralAmount,
            collateralAmount
        );
    }

    function getTokensFromLiquidity(
        uint128 liquidity,
        uint160 sqrtPriceX96,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96
    ) external pure override returns (uint256 amount0, uint256 amount1) {
        return
            LiquidityAmounts.getAmountsForLiquidity(
                sqrtPriceX96,
                sqrtPriceAX96,
                sqrtPriceBX96,
                liquidity
            );
    }

    function _closeLiquidityPosition(
        Market.Data storage market,
        Position.Data storage position
    )
        internal
        returns (
            uint256 collectedAmount0,
            uint256 collectedAmount1,
            uint256 collateralAmount
        )
    {
        Epoch.Data storage epoch = Epoch.loadValid(position.epochId);
        // Collect fees and remaining tokens
        (collectedAmount0, collectedAmount1) = INonfungiblePositionManager(
            epoch.marketParams.uniswapPositionManager
        ).collect(
                INonfungiblePositionManager.CollectParams({
                    tokenId: position.uniswapPositionId,
                    recipient: address(this),
                    amount0Max: type(uint128).max,
                    amount1Max: type(uint128).max
                })
            );
        // Burn the Uniswap position
        INonfungiblePositionManager(epoch.marketParams.uniswapPositionManager)
            .burn(position.uniswapPositionId);
        position.uniswapPositionId = 0;

        // due to rounding on the uniswap side, 1 wei is left over on loan amount when opening & immediately closing position
        // it seems like it's always 1 wei lower than original added amount so adding it to collected amount to make sure we don't have any rounding error
        // @dev notice we are doing it only if the values are non-zero
        if (collectedAmount0 > 0) {
            collectedAmount0 += 1;
        }
        if (collectedAmount1 > 0) {
            collectedAmount1 += 1;
        }

        if (collectedAmount0 > position.borrowedVGas) {
            position.vGasAmount = collectedAmount0 - position.borrowedVGas;
            position.borrowedVGas = 0;
        } else {
            position.borrowedVGas = position.borrowedVGas - collectedAmount0;
        }

        // recouncil with deposited collateral
        if (collectedAmount1 > position.borrowedVEth) {
            position.depositedCollateralAmount +=
                collectedAmount1 -
                position.borrowedVEth;
            position.borrowedVEth = 0;
        } else {
            uint256 collateralDelta = position.borrowedVEth - collectedAmount1;
            if (position.depositedCollateralAmount < collateralDelta) {
                position.borrowedVEth = collateralDelta;
            } else {
                position.depositedCollateralAmount -= collateralDelta;
                position.borrowedVEth = 0;
            }
        }

        // if all debt is paid off, and no vGAS, withdraw collateral to user
        // otherwise, transition user to trader and user can trade through pool to close position
        // in a subsequent tx
        if (
            position.borrowedVGas == 0 &&
            position.vGasAmount == 0 &&
            position.borrowedVEth == 0
        ) {
            collateralAmount = market.withdrawCollateral(
                ERC721Storage._ownerOf(position.id),
                position.depositedCollateralAmount
            );
            position.depositedCollateralAmount = 0;
            position.kind = IFoilStructs.PositionKind.Unknown;
        } else {
            position.kind = IFoilStructs.PositionKind.Trade;
        }

        // Emit an event for the closed position
        emit LiquidityPositionClosed(
            msg.sender,
            epoch.id,
            position.id,
            position.kind,
            collectedAmount0,
            collectedAmount1,
            position.borrowedVGas,
            position.borrowedVEth
        );
    }

    function _emitLiquidityPositionCreated(
        ILiquidityModule.LiquidityPositionCreatedEventData memory eventData
    ) private {
        emit LiquidityPositionCreated(
            eventData.sender,
            eventData.epochId,
            eventData.positionId,
            eventData.depositedCollateralAmount,
            eventData.liquidity,
            eventData.addedAmount0,
            eventData.addedAmount1,
            eventData.lowerTick,
            eventData.upperTick
        );
    }
}
