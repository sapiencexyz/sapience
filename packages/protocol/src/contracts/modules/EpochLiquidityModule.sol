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
    using Epoch for Epoch.Data;

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

        account.updateCollateral(
            market.collateralAsset,
            params.collateralAmount
        );

        INonfungiblePositionManager.MintParams
            memory mintParams = INonfungiblePositionManager.MintParams({
                token0: address(epoch.gasToken),
                token1: address(epoch.ethToken),
                fee: epoch.params.feeRate,
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

        account.updateLoan(
            tokenId,
            params.collateralAmount,
            addedAmount0,
            addedAmount1
        );

        epoch.validateProvidedLiquidity(
            params.collateralAmount,
            liquidity,
            params.lowerTick,
            params.upperTick
        );

        // emit event
        emit LiquidityPositionCreated(
            tokenId,
            liquidity,
            addedAmount0,
            addedAmount1
        );
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
        Market.Data storage market = Market.load();
        FAccount.Data storage account = FAccount.load(accountId);

        (, , , , , int24 lowerTick, int24 upperTick, , , , , ) = market
            .uniswapPositionManager
            .positions(account.tokenId);

        account.updateCollateral(market.collateralAsset, collateralAmount);

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
        Epoch.load().validateProvidedLiquidity(
            collateralAmount,
            liquidity,
            lowerTick,
            upperTick
        );

        emit LiquidityPositionDecreased(account.tokenId, amount0, amount1);

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
        Market.Data storage market = Market.load();
        FAccount.Data storage account = FAccount.load(accountId);

        (, , , , , int24 lowerTick, int24 upperTick, , , , , ) = market
            .uniswapPositionManager
            .positions(account.tokenId);

        account.updateCollateral(market.collateralAsset, collateralAmount);

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
        Epoch.load().validateProvidedLiquidity(
            collateralAmount,
            liquidity,
            lowerTick,
            upperTick
        );

        emit LiquidityPositionIncreased(
            account.tokenId,
            liquidity,
            amount0,
            amount1
        );
    }

    function getTokenAmounts(
        uint256 collateralAmount,
        uint160 sqrtPriceX96,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96
    )
        external
        view
        override
        returns (uint256 amount0, uint256 amount1, uint128 liquidity)
    {
        // calculate for unit
        uint128 unitLiquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            sqrtPriceAX96,
            sqrtPriceBX96,
            1e18,
            1e18
        );

        (
            uint256 requiredCollateral,
            uint256 unitAmount0,
            uint256 uintAmount1
        ) = Epoch.load().requiredCollateralForLiquidity(
                unitLiquidity,
                sqrtPriceX96,
                sqrtPriceAX96,
                sqrtPriceBX96
            );

        // scale up for fractional collateral ratio
        uint256 collateralRatio = FullMath.mulDiv(
            collateralAmount,
            1e18, // Create MathUtil and use UNIT
            requiredCollateral
        );

        // scale up liquidity by collateral amount
        return (
            FullMath.mulDiv(unitAmount0, collateralRatio, 1e18),
            FullMath.mulDiv(uintAmount1, collateralRatio, 1e18),
            uint128(unitLiquidity * collateralRatio) / 1e18
        );
    }

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
