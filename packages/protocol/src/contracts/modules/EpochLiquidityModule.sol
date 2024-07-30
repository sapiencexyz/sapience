// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "../../synthetix/interfaces/IERC721Receiver.sol";
import "../storage/ERC721Storage.sol";
import {TickMath} from "../external/univ3/TickMath.sol";
import "../storage/ERC721EnumerableStorage.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../storage/FAccount.sol";
import "../storage/Market.sol";
import "../storage/Epoch.sol";
import "../storage/Errors.sol";
import {IFoilStructs} from "../interfaces/IFoilStructs.sol";
import {IEpochLiquidityModule} from "../interfaces/IEpochLiquidityModule.sol";

import "forge-std/console2.sol";

contract EpochLiquidityModule is
    ReentrancyGuard,
    IERC721Receiver,
    IEpochLiquidityModule
{
    using Market for Market.Data;
    using FAccount for FAccount.Data;

    function createLiquidityPosition(
        IFoilStructs.LiquidityPositionParams memory params
    )
        external
        override
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 addedAmount0,
            uint256 addedAmount1
        )
    {
        tokenId = ERC721EnumerableStorage.totalSupply() + 1;
        FAccount.Data storage account = FAccount.createValid(tokenId);
        ERC721Storage._mint(msg.sender, tokenId);

        Market.Data storage market = Market.load();
        Epoch.Data storage epoch = Epoch.load();

        INonfungiblePositionManager.MintParams
            memory mintParams = INonfungiblePositionManager.MintParams({
                token0: address(epoch.gasToken),
                token1: address(epoch.ethToken),
                fee: epoch.marketParams.feeRate,
                tickLower: params.lowerTick,
                tickUpper: params.upperTick,
                amount0Desired: params.amountTokenA,
                amount1Desired: params.amountTokenB,
                amount0Min: 0,
                amount1Min: 0,
                recipient: address(this),
                deadline: block.timestamp
            });

        (tokenId, liquidity, addedAmount0, addedAmount1) = market
            .uniswapPositionManager
            .mint(mintParams);

        console2.log("ADDED AMTS", addedAmount0, addedAmount1, liquidity);

        account.updateLoan(
            tokenId,
            params.collateralAmount,
            addedAmount0,
            addedAmount1
        );

        (, , address token0, address token1, , , , uint128 liq, , , , ) = market
            .uniswapPositionManager
            .positions(tokenId);

        account.validateProvidedLiquidity(
            epoch.marketParams,
            liquidity,
            params.lowerTick,
            params.upperTick
        );

        // TODO: refund
    }

    function onERC721Received(
        address operator,
        address,
        uint256 tokenId,
        bytes calldata
    ) external override returns (bytes4) {
        // get position information

        console2.log("onERC721Received", tokenId);

        return this.onERC721Received.selector;
    }

    function collectFees(
        uint256 tokenId
    ) external override returns (uint256 amount0, uint256 amount1) {
        Market.Data storage market = Market.load();
        Epoch.Data storage epoch = Epoch.load();

        // TODO: verify msg sender is owner of this tokenId

        INonfungiblePositionManager.CollectParams
            memory params = INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            });

        (amount0, amount1) = market.uniswapPositionManager.collect(params);

        // transfer the collateral to the account (virtual tokens)
        // use current price to determine collateral amount

        // TODO: emit event
    }

    function decreaseLiquidityPosition(
        uint256 accountId,
        uint256 collateralAmount,
        uint128 liquidity,
        uint256 minGasAmount,
        uint256 minEthAmount
    ) external override returns (uint256 amount0, uint256 amount1) {
        console2.log("--DECREASE LIQ POSITION--");
        Market.Data storage market = Market.load();
        FAccount.Data storage account = FAccount.load(accountId);

        (, , , , , int24 lowerTick, int24 upperTick, , , , , ) = market
            .uniswapPositionManager
            .positions(account.tokenId);

        INonfungiblePositionManager.DecreaseLiquidityParams
            memory decreaseParams = INonfungiblePositionManager
                .DecreaseLiquidityParams({
                    tokenId: account.tokenId,
                    liquidity: liquidity,
                    amount0Min: 0,
                    amount1Min: 0,
                    deadline: block.timestamp
                });

        (amount0, amount1) = market.uniswapPositionManager.decreaseLiquidity(
            decreaseParams
        );

        account.updateLoan(account.tokenId, collateralAmount, amount0, amount1);
        account.validateProvidedLiquidity(
            market.marketParams,
            liquidity,
            lowerTick,
            upperTick
        );

        // transfer or remove collateral
    }

    function increaseLiquidityPosition(
        uint256 accountId,
        uint256 collateralAmount,
        uint256 gasTokenAmount,
        uint256 ethTokenAmount,
        uint256 minGasAmount,
        uint256 minEthAmount
    ) external returns (uint128 liquidity, uint256 amount0, uint256 amount1) {
        console2.log("--INCREASE LIQ POSITION--");
        Market.Data storage market = Market.load();
        FAccount.Data storage account = FAccount.load(accountId);

        (, , , , , int24 lowerTick, int24 upperTick, , , , , ) = market
            .uniswapPositionManager
            .positions(account.tokenId);

        INonfungiblePositionManager.IncreaseLiquidityParams
            memory increaseParams = INonfungiblePositionManager
                .IncreaseLiquidityParams({
                    tokenId: account.tokenId,
                    amount0Desired: gasTokenAmount,
                    amount1Desired: ethTokenAmount,
                    amount0Min: minGasAmount,
                    amount1Min: minEthAmount,
                    deadline: block.timestamp
                });

        (liquidity, amount0, amount1) = market
            .uniswapPositionManager
            .increaseLiquidity(increaseParams);

        account.updateLoan(account.tokenId, collateralAmount, amount0, amount1);
        account.validateProvidedLiquidity(
            market.marketParams,
            liquidity,
            lowerTick,
            upperTick
        );
    }

    // function getTokenAmounts(
    //     uint256 collateralAmount,
    //     int24 tickLower,
    //     int24 tickUpper
    // )
    //     public
    //     view
    //     returns (uint256 amount0, uint256 amount1, uint128 liquidity)
    // {
    //     Epoch.Data storage epoch = Epoch.load();
    //     console2.log("calc liq amts");

    //     uint160 sqrtRatioAX96 = TickMath.getSqrtRatioAtTick(tickLower);
    //     uint160 sqrtRatioBX96 = TickMath.getSqrtRatioAtTick(tickUpper);

    //     uint160 minTickSqrtRatio = TickMath.getSqrtRatioAtTick(
    //         epoch.baseAssetMinPriceTick
    //     );
    //     uint256 maxTickSqrtRatio = TickMath.getSqrtRatioAtTick(
    //         epoch.baseAssetMaxPriceTick
    //     );
    //     // console2.log(minPrice);

    //     // liquidity = LiquidityAmounts.getLiquidityForAmount1(
    //     //     sqrtRatioAX96,
    //     //     sqrtRatioBX96,
    //     //     collateralAmount
    //     // );

    //     liquidity = LiquidityAmounts.getLiquidityForAmount1(
    //         sqrtRatioAX96,
    //         sqrtRatioBX96,
    //         collateralAmount
    //     );

    //     // console2.log("LIQUIDITY 2", liquidityOne, liquidityTwo);

    //     // liquidity = liquidityOne < liquidityTwo ? liquidityOne : liquidityTwo;

    //     uint128 scaleFactor = 1e9;

    //     console2.log("LIQUIDITY", liquidity);

    //     (amount0, amount1) = LiquidityAmounts.getAmountsForLiquidity(
    //         396140812571321687967719751680, // 25
    //         sqrtRatioAX96,
    //         sqrtRatioBX96,
    //         liquidity / scaleFactor
    //     );

    //     console2.log("Scaled amount0:", amount0);
    //     console2.log("Scaled amount1:", amount1);

    //     // Scale the amounts back up
    //     amount0 = amount0 * scaleFactor;
    //     amount1 = amount1 * scaleFactor;

    //     console2.log("Final amount0 (GAS):", amount0);
    //     console2.log("Final amount1 (GWEI):", amount1);

    //     (uint256 amount0final, uint256 amount1final) = LiquidityAmounts
    //         .getAmountsForLiquidity(
    //             minTickSqrtRatio,
    //             sqrtRatioAX96,
    //             sqrtRatioBX96,
    //             liquidity / scaleFactor
    //         );

    //     console2.log(
    //         "amountsmintick",
    //         amount0final * scaleFactor,
    //         amount1final * scaleFactor
    //     );
    // }

    function getPosition(
        uint256 accountId
    )
        external
        view
        override
        returns (
            uint256 tokenId,
            uint256 collateralAmount,
            uint256 borrowedGwei,
            uint256 borrowedGas
        )
    {
        FAccount.Data storage account = FAccount.load(accountId);
        return (
            account.tokenId,
            account.collateralAmount,
            account.borrowedGwei,
            account.borrowedGas
        );
    }
}
