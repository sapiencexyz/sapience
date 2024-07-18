// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "../../synthetix/interfaces/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../storage/Account.sol";
import {IFoilStructs} from "../interfaces/IFoilStructs.sol";
import "../storage/ERC721EnumerableStorage.sol";
import "../utils/UniV3Abstraction.sol";
import "forge-std/console2.sol";

// Constants
uint256 constant ONE_ETHER_IN_GWEI = 10 ** 9;
uint256 constant ONE_ETH_IN_WEI = 10 ** 18;
uint256 constant Q192 = 2 ** 192;

contract EpochLiquidityModule is ReentrancyGuard, IERC721Receiver {
    // using Epoch for Epoch.Data;
    // using Account for Account.Data;
    // using Position for Position.Data;

    // using ERC721Storage for ERC721Storage.Data;

    function createLiquidityPosition(
        IFoilStructs.LiquidityPositionParams memory params
    )
        external
        payable
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 addedAmount0,
            uint256 addedAmount1
        )
    {
        // create or load account
        // save tokenId to account
        console2.log("HELLO");
        Epoch.Data storage epoch = Epoch.load();
        console2.log(
            "BEFORE MINTING TOKENS",
            params.amountTokenA,
            params.amountTokenB
        );
        console2.logAddress(address(this));
        console2.logAddress(address(epoch.ethToken));

        console2.log("AFTER MINTING TOKENS");

        epoch.ethToken.approve(
            address(epoch.uniswapPositionManager),
            params.amountTokenA
        );
        epoch.gasToken.approve(
            address(epoch.uniswapPositionManager),
            params.amountTokenB
        );

        console2.log("MINT, ADDRESS");
        console2.logAddress(address(this));

        INonfungiblePositionManager.MintParams
            memory mintParams = INonfungiblePositionManager.MintParams({
                token0: address(epoch.ethToken),
                token1: address(epoch.gasToken),
                fee: epoch.feeRate,
                tickLower: params.lowerTick,
                tickUpper: params.upperTick,
                amount0Desired: params.amountTokenA,
                amount1Desired: params.amountTokenB,
                amount0Min: 0,
                amount1Min: 0,
                recipient: address(this),
                deadline: block.timestamp
            });
        console2.log("BEFORE MINT");

        (tokenId, liquidity, addedAmount0, addedAmount1) = epoch
            .uniswapPositionManager
            .mint(mintParams);

        console2.log("YAY", tokenId);
        console2.log("ADDED AMTS", addedAmount0, addedAmount1);

        (, , address token0, address token1, , , , uint128 liq, , , , ) = epoch
            .uniswapPositionManager
            .positions(tokenId);

        console2.log("Liquidity", liq);

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
    ) external returns (uint256 amount0, uint256 amount1) {
        Epoch.Data storage epoch = Epoch.load();

        // TODO: verify msg sender is owner of this tokenId

        INonfungiblePositionManager.CollectParams
            memory params = INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            });

        (amount0, amount1) = epoch.uniswapPositionManager.collect(params);

        // transfer the collateral to the account (virtual tokens)
        // use current price to determine collateral amount

        // TODO: emit event
    }

    function getPosition(
        uint256 positionId
    )
        external
        view
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        )
    {
        Epoch.Data storage epoch = Epoch.load();
        return epoch.uniswapPositionManager.positions(positionId);
    }

    function updateLiquidityPosition(
        uint256 tokenId,
        uint256 collateral,
        uint128 liquidity
    ) external payable returns (uint256 amount0, uint256 amount1) {
        console2.log("UPDATELIQPOSITION");
        Epoch.Data storage epoch = Epoch.load();
        console2.log("removing liquidity");
        console2.logAddress(address(this));

        INonfungiblePositionManager.DecreaseLiquidityParams
            memory decreaseParams = INonfungiblePositionManager
                .DecreaseLiquidityParams({
                    tokenId: tokenId,
                    liquidity: liquidity,
                    amount0Min: 0,
                    amount1Min: 0,
                    deadline: block.timestamp
                });

        (amount0, amount1) = epoch.uniswapPositionManager.decreaseLiquidity(
            decreaseParams
        );
        console2.log("REMOVED", amount0, amount1);
    }

    function getTokenAmounts(
        uint256 collateralAmountETH, // in ETH terms (18 decimals)
        int24 tickLower,
        int24 tickUpper,
        uint160 sqrtPriceX96
    ) external pure returns (uint256 amountGWEI, uint256 amountGAS) {
        // Calculate price P from sqrtPriceX96 using FullMath.mulDiv for precision
        uint256 price = FullMath.mulDiv(
            uint256(sqrtPriceX96),
            uint256(sqrtPriceX96),
            Q192
        );

        // Convert collateral amount from ETH to Wei
        uint256 collateralAmountETHWei = collateralAmountETH * ONE_ETH_IN_WEI;

        // Calculate collateral amounts in GWEI and GAS based on price ratio
        uint256 collateralAmountGAS = collateralAmountETHWei / (price + 1);
        uint256 collateralAmountETHAdjusted = collateralAmountETHWei -
            FullMath.mulDiv(collateralAmountGAS, price, ONE_ETH_IN_WEI);

        // Convert tick range to sqrt prices
        uint160 sqrtRatioAX96 = TickMath.getSqrtRatioAtTick(tickLower);
        uint160 sqrtRatioBX96 = TickMath.getSqrtRatioAtTick(tickUpper);

        // Calculate liquidity using LiquidityAmounts library
        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            sqrtRatioAX96,
            sqrtRatioBX96,
            collateralAmountETHAdjusted,
            collateralAmountGAS
        );

        // Get the token amounts from liquidity
        (uint256 amount0, uint256 amount1) = LiquidityAmounts
            .getAmountsForLiquidity(
                sqrtRatioAX96,
                sqrtRatioBX96,
                sqrtPriceX96,
                liquidity
            );

        // Convert amounts to readable format
        amountGWEI = amount0 / ONE_ETHER_IN_GWEI;
        amountGAS = amount1 / ONE_ETH_IN_WEI;

        return (amountGWEI, amountGAS);
    }
}
