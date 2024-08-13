// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "../storage/ERC721EnumerableStorage.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../storage/Position.sol";
import {IFoilStructs} from "../interfaces/IFoilStructs.sol";
import {IEpochLiquidityModule} from "../interfaces/IEpochLiquidityModule.sol";

import "forge-std/console2.sol";

contract EpochLiquidityModule is
    ReentrancyGuard,
    IERC721Receiver,
    IEpochLiquidityModule
{
    using Position for Position.Data;
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
        Position.Data storage position = Position.createValid(tokenId);
        ERC721Storage._mint(msg.sender, tokenId);
        position.epochId = params.epochId;

        Market.Data storage market = Market.load();
        Epoch.Data storage epoch = Epoch.load(params.epochId);

        position.updateCollateral(
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

        position.updateLoan(
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

        return this.onERC721Received.selector;
    }

    function collectFees(
        uint256 epochId,
        uint256 tokenId
    ) external override returns (uint256 amount0, uint256 amount1) {
        Market.Data storage market = Market.load();
        Epoch.Data storage epoch = Epoch.load(epochId);

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
        uint256 positionId,
        uint256 collateralAmount,
        uint128 liquidity,
        uint256 minGasAmount,
        uint256 minEthAmount
    ) external override returns (uint256 amount0, uint256 amount1) {
        Market.Data storage market = Market.load();
        Position.Data storage position = Position.load(positionId);
        Epoch.Data storage epoch = Epoch.load(position.epochId);

        (, , , , , int24 lowerTick, int24 upperTick, , , , , ) = market
            .uniswapPositionManager
            .positions(position.tokenId);

        position.updateCollateral(market.collateralAsset, collateralAmount);

        INonfungiblePositionManager.DecreaseLiquidityParams
            memory decreaseParams = INonfungiblePositionManager
                .DecreaseLiquidityParams({
                    tokenId: position.tokenId,
                    liquidity: liquidity,
                    amount0Min: 0,
                    amount1Min: 0,
                    deadline: block.timestamp
                });

        (amount0, amount1) = market.uniswapPositionManager.decreaseLiquidity(
            decreaseParams
        );

        position.updateLoan(
            position.tokenId,
            collateralAmount,
            amount0,
            amount1
        );
        epoch.validateProvidedLiquidity(
            collateralAmount,
            liquidity,
            lowerTick,
            upperTick
        );

        emit LiquidityPositionDecreased(position.tokenId, amount0, amount1);
    }

    function increaseLiquidityPosition(
        uint256 positionId,
        uint256 collateralAmount,
        uint256 gasTokenAmount,
        uint256 ethTokenAmount,
        uint256 minGasAmount,
        uint256 minEthAmount
    ) external returns (uint128 liquidity, uint256 amount0, uint256 amount1) {
        Market.Data storage market = Market.load();
        Position.Data storage position = Position.load(positionId);
        Epoch.Data storage epoch = Epoch.load(position.epochId);

        (, , , , , int24 lowerTick, int24 upperTick, , , , , ) = market
            .uniswapPositionManager
            .positions(position.tokenId);

        position.updateCollateral(market.collateralAsset, collateralAmount);

        INonfungiblePositionManager.IncreaseLiquidityParams
            memory increaseParams = INonfungiblePositionManager
                .IncreaseLiquidityParams({
                    tokenId: position.tokenId,
                    amount0Desired: gasTokenAmount,
                    amount1Desired: ethTokenAmount,
                    amount0Min: minGasAmount,
                    amount1Min: minEthAmount,
                    deadline: block.timestamp
                });

        (liquidity, amount0, amount1) = market
            .uniswapPositionManager
            .increaseLiquidity(increaseParams);

        position.updateLoan(
            position.tokenId,
            collateralAmount,
            amount0,
            amount1
        );
        epoch.validateProvidedLiquidity(
            collateralAmount,
            liquidity,
            lowerTick,
            upperTick
        );

        emit LiquidityPositionIncreased(
            position.tokenId,
            liquidity,
            amount0,
            amount1
        );
    }

    function getTokenAmounts(
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

        (
            uint256 requiredCollateral,
            uint256 unitAmount0,
            uint256 uintAmount1
        ) = epoch.requiredCollateralForLiquidity(
                unitLiquidity,
                sqrtPriceX96,
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
            FullMath.mulDiv(uintAmount1, collateralRatio, 1e18),
            uint128(unitLiquidity * collateralRatio) / 1e18
        );
    }
}
