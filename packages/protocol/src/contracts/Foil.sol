// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {INonfungiblePositionManager} from "../interfaces/external/INonfungiblePositionManager.sol";
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import {IUniswapV3MintCallback} from "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3MintCallback.sol";
import {IUniswapV3SwapCallback} from "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol";
import {TickMath} from "../external/univ3/TickMath.sol";
import "./VirtualToken.sol";
import "../interfaces/IFoil.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../storage/Epoch.sol";
import "../storage/Account.sol";
import "../storage/Position.sol";
import {ERC721Enumerable} from "../synthetix/token/ERC721Enumerable.sol";

// possibly remove
import {LiquidityAmounts} from "../external/univ3/LiquidityAmounts.sol";

import "forge-std/console2.sol";

contract Foil is
    ReentrancyGuard,
    IFoil,
    IUniswapV3MintCallback,
    IUniswapV3SwapCallback,
    ERC721Enumerable
{
    using Epoch for Epoch.Data;
    using Account for Account.Data;
    using Position for Position.Data;

    constructor(
        uint endTime,
        address uniswapPositionManager,
        address resolver,
        address collateralAsset,
        uint baseAssetMinPrice,
        uint baseAssetMaxPrice,
        uint24 feeRate
    ) {
        Epoch.Data storage epoch = Epoch.createValid(
            endTime,
            uniswapPositionManager,
            resolver,
            collateralAsset,
            baseAssetMinPrice,
            baseAssetMaxPrice,
            feeRate
        );
    }

    function getMarket()
        external
        view
        returns (
            uint endTime,
            address uniswapPositionManager,
            address resolver,
            address collateralAsset,
            uint baseAssetMinPrice,
            uint baseAssetMaxPrice,
            uint24 feeRate,
            address ethToken,
            address gasToken,
            address pool
        )
    {
        Epoch.Data storage epoch = Epoch.load();
        return (
            epoch.endTime,
            address(epoch.uniswapPositionManager),
            address(epoch.resolver),
            address(epoch.collateralAsset),
            epoch.baseAssetMinPrice,
            epoch.baseAssetMaxPrice,
            epoch.feeRate,
            address(epoch.ethToken),
            address(epoch.gasToken),
            address(epoch.pool)
        );
    }

    function onERC721Received(
        address operator,
        address,
        uint256 tokenId,
        bytes calldata
    ) external returns (bytes4) {
        // get position information
        // Position.load()

        // epoch.updateDebtPosition(tokenId);

        return this.onERC721Received.selector;
    }

    function getEpoch()
        external
        view
        returns (address pool, address ethToken, address gasToken)
    {
        Epoch.Data storage epoch = Epoch.load();
        return (
            address(epoch.pool),
            address(epoch.ethToken),
            address(epoch.gasToken)
        );
    }

    function mint(uint256 accountId) external {
        Account.createValid(accountId);
        _mint(msg.sender, accountId);

        // Create empty position
        Position.load(accountId).accountId = accountId;
    }

    /*
        1. LP providers call this function to add liquidity to uniswap pool
        2. Specify the range of liquidity to add (i.e from 10 - 50 GWEI)

    */

    function addLiquidity(
        IFoilStructs.AddLiquidityParams memory params
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
        tokenId = params.accountId;
        require(ownerOf(tokenId) == msg.sender, "Not NFT owner");
        Account.Data storage account = Account.loadValid(params.accountId);
        // check within configured range

        Epoch.Data storage epoch = Epoch.load();

        UniV3Abstraction.RuntimeAddLiquidityParams
            memory uniV3HelperAddLiquidityParams = UniV3Abstraction
                .RuntimeAddLiquidityParams({
                    accountId: params.accountId,
                    recipient: address(this),
                    pool: address(epoch.pool),
                    lowerTick: params.lowerTick,
                    upperTick: params.upperTick,
                    amountTokenA: params.amountTokenA,
                    amountTokenB: params.amountTokenB
                });

        (addedAmount0, addedAmount1, liquidity) = UniV3Abstraction.addLiquidity(
            uniV3HelperAddLiquidityParams
        );
        /*
        (uint160 sqrtMarkPrice, , , , , , ) = epoch.pool.slot0();

        // VirtualToken(epoch.ethToken).mint(address(this), amountTokenA);
        // VirtualToken(epoch.gasToken).mint(address(this), amountTokenB);

        // TransferHelper.safeApprove(
        //     address(epoch.ethToken),
        //     address(epoch.uniswapPositionManager),
        //     type(uint256).max
        // );
        // TransferHelper.safeApprove(
        //     address(epoch.gasToken),
        //     address(epoch.uniswapPositionManager),
        //     type(uint256).max
        // );

        // get the equivalent amount of liquidity from amount0 & amount1 with current price
        liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtMarkPrice,
            TickMath.getSqrtRatioAtTick(params.lowerTick),
            TickMath.getSqrtRatioAtTick(params.upperTick),
            params.amountTokenA,
            params.amountTokenB
        );

        (uint256 addedAmount0, uint256 addedAmount1) = epoch.pool.mint(
            address(this),
            params.lowerTick,
            params.upperTick,
            liquidity,
            abi.encode(params.accountId)
        );
        */

        Position.load(params.accountId).vEthAmount += addedAmount0;
        Position.load(params.accountId).vGasAmount += addedAmount1;
        // epoch.validateInRange(lowerTick, upperTick);

        // uint256 ethAllowance = VirtualToken(epoch.ethToken).allowance(
        //     address(this),
        //     address(epoch.uniswapPositionManager)
        // );
        // console2.log("ethAllowance", ethAllowance);

        // INonfungiblePositionManager.MintParams
        //     memory mintParams = INonfungiblePositionManager.MintParams({
        //         token0: address(epoch.ethToken),
        //         token1: address(epoch.gasToken),
        //         fee: epoch.feeRate,
        //         tickLower: lowerTick,
        //         tickUpper: upperTick,
        //         amount0Desired: amountTokenA,
        //         amount1Desired: amountTokenB,
        //         amount0Min: 0, // TODO
        //         amount1Min: 0, // TODO
        //         recipient: address(this),
        //         deadline: block.timestamp + 10 minutes
        //     });

        // (tokenId, liquidity, amount0, amount1) = epoch
        //     .uniswapPositionManager
        //     .mint(mintParams);

        // Create a deposit
        // Position.load(accountId).createDeposit(tokenId);
        // epoch.updateDebtPosition(tokenId, amount0, amount1, liquidity);

        // Remove allowance and refund in both assets.
        // if (amount0 < amountTokenA) {
        //     TransferHelper.safeApprove(
        //         address(epoch.ethToken),
        //         address(epoch.uniswapPositionManager),
        //         0
        //     );
        //     uint256 refund0 = amountTokenA - amount0;
        //     TransferHelper.safeTransfer(
        //         address(epoch.ethToken),
        //         msg.sender,
        //         refund0
        //     );
        // }

        // if (amount1 < amountTokenB) {
        //     TransferHelper.safeApprove(
        //         address(epoch.gasToken),
        //         address(epoch.uniswapPositionManager),
        //         0
        //     );
        //     uint256 refund1 = amountTokenB - amount1;
        //     TransferHelper.safeTransfer(
        //         address(epoch.gasToken),
        //         msg.sender,
        //         refund1
        //     );
        // }
    }

    // function removeLiquidity(
    //     uint256 accountId,
    //     uint128 liquidity,
    //     int24 lowerTick,
    //     int24 upperTick
    // ) external {
    //     Epoch.Data storage epoch = Epoch.load();

    //     (
    //         ,
    //         ,
    //         uint128 amount0Received,
    //         uint128 amount1Received
    //     ) = UniV3Abstraction.removeLiquidity(
    //             Account.loadValid(accountId).getAddress(),
    //             address(epoch.pool),
    //             lowerTick,
    //             upperTick,
    //             liquidity
    //         );

    //     Position.load(accountId).updateBalance(
    //         int256(uint256(amount0Received)),
    //         int256(uint256(amount1Received))
    //     );
    // }

    function openLong(uint256 accountId, uint256 collateralAmount) external {
        uint tokenId = accountId;
        require(ownerOf(tokenId) == msg.sender, "Not NFT owner");
        // check within time range
        Account.Data storage account = Account.loadValid(accountId);
        Epoch.Data storage epoch = Epoch.load();

        // IERC20(epoch.collateralAsset).transferFrom(
        //     msg.sender,
        //     address(this),
        //     collateralAmount
        // );

        Position.load(accountId).openLong(collateralAmount);
    }

    function reduceLong(uint256 accountId, uint256 vGasAmount) external {
        uint tokenId = accountId;
        require(ownerOf(tokenId) == msg.sender, "Not NFT owner");
        Position.Data storage position = Position.loadValid(accountId);

        Position.load(accountId).reduceLong(vGasAmount);
    }

    function openShort(uint256 accountId, uint256 collateralAmount) external {
        uint tokenId = accountId;
        require(ownerOf(tokenId) == msg.sender, "Not NFT owner");
        // check within time range
        Account.Data storage account = Account.loadValid(accountId);
        Epoch.Data storage epoch = Epoch.load();

        // IERC20(epoch.collateralAsset).transferFrom(
        //     msg.sender,
        //     address(this),
        //     collateralAmount
        // );

        Position.load(accountId).openShort(collateralAmount);
    }

    function reduceShort(uint256 accountId, uint256 vEthAmount) external {
        uint tokenId = accountId;
        require(ownerOf(tokenId) == msg.sender, "Not NFT owner");
        Position.Data storage position = Position.loadValid(accountId);

        Position.load(accountId).reduceShort(vEthAmount);
    }

    function getPosition(
        uint256 accountId
    )
        external
        view
        override
        returns (uint256 tokenAmount0, uint256 tokenAmount1)
    {
        Position.Data storage position = Position.loadValid(accountId);
        return (position.vEthAmount, position.vGasAmount);
    }

    // --- Uniswap V3 Callbacks ---
    function uniswapV3MintCallback(
        uint256 amount0Owed,
        uint256 amount1Owed,
        bytes calldata data
    ) external override {
        // TODO: check sender is uniswap
        uint256 accountId = abi.decode(data, (uint256));

        Epoch.Data storage epoch = Epoch.load();
        Position.Data storage position = Position.loadValid(accountId);

        // VirtualToken(epoch.gasToken).mint(address(this), amountTokenB);

        // TransferHelper.safeApprove(
        //     address(epoch.ethToken),
        //     address(epoch.uniswapPositionManager),
        //     type(uint256).max
        // );
        // TransferHelper.safeApprove(
        //     address(epoch.gasToken),
        //     address(epoch.uniswapPositionManager),
        //     type(uint256).max
        // );

        if (amount0Owed > 0) {
            address token = IUniswapV3Pool(epoch.pool).token0();
            // Check if the tokens are not swapped
            if (token != address(epoch.ethToken)) {
                revert Errors.InvalidVirtualToken(token);
            }

            epoch.ethToken.mint(address(this), amount0Owed);
            epoch.ethToken.transfer(address(epoch.pool), amount0Owed);

            position.vEthAmount += amount0Owed;
        }

        if (amount1Owed > 0) {
            address token = IUniswapV3Pool(epoch.pool).token1();
            // Check if the tokens are not swapped
            if (token != address(epoch.gasToken)) {
                revert Errors.InvalidVirtualToken(token);
            }

            epoch.gasToken.mint(address(this), amount1Owed);
            epoch.gasToken.transfer(address(epoch.pool), amount1Owed);

            position.vGasAmount += amount1Owed;
        }
    }

    function uniswapV3SwapCallback(
        int256 amount0Delta, // vwstEth 1
        int256 amount1Delta, // vwstGas -50
        bytes calldata data
    ) external override {
        (uint256 accountId, bool shouldMint) = abi.decode(
            data,
            (uint256, bool)
        );

        console2.log("swap callback - accountId  :", accountId);
        console2.log("swap callback - shouldMint :", shouldMint);

        console2.log("swap callback - amount0Delta  :", amount0Delta);
        console2.log("swap callback - amount1Delta  :", amount1Delta);
        Epoch.Data storage epoch = Epoch.load();
        Position.Data storage position = Position.loadValid(accountId);

        if (amount0Delta > 0) {
            address token = IUniswapV3Pool(epoch.pool).token0();
            // Check if the tokens are not swapped
            if (token != address(epoch.ethToken)) {
                revert Errors.InvalidVirtualToken(token);
            }

            if (shouldMint) {
                epoch.ethToken.mint(address(this), uint(amount0Delta));
            }
            epoch.ethToken.transfer(address(epoch.pool), uint(amount0Delta));
        }

        if (amount1Delta > 0) {
            address token = IUniswapV3Pool(epoch.pool).token1();
            // Check if the tokens are not swapped
            if (token != address(epoch.gasToken)) {
                revert Errors.InvalidVirtualToken(token);
            }

            if (shouldMint) {
                epoch.gasToken.mint(address(this), uint(amount1Delta));
            }
            epoch.gasToken.transfer(address(epoch.pool), uint(amount1Delta));
        }
        Position.load(accountId).updateBalance(amount0Delta, amount1Delta);
        //     IUniswapV3Pool pool = IUniswapV3Pool(epoch.pool);

        //     (address token, uint256 amountToPay) = amount0Delta > 0
        //         ? (pool.token0(), uint256(amount0Delta))
        //         : (pool.token1(), uint256(amount1Delta));

        //     if (shouldMint) {
        //         VirtualToken(token).mint(address(this), amountToPay);
        //     }

        //     VirtualToken(token).transfer(address(epoch.pool), amountToPay);

        //     Position.load(accountId).updateBalance(amount0Delta, amount1Delta);
        // }
    }
}
