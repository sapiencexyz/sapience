// contracts/FoilImplementation.sol
// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IUniswapV3MintCallback} from "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3MintCallback.sol";
import {IUniswapV3SwapCallback} from "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol";
import {INonfungiblePositionManager} from "../interfaces/external/INonfungiblePositionManager.sol";
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "./VirtualToken.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../storage/Epoch.sol";
import "../storage/Account.sol";
import "../storage/Position.sol";

contract Foil is ReentrancyGuard {
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

    // function onERC721Received(
    //     address operator,
    //     address,
    //     uint256 tokenId,
    //     bytes calldata
    // ) external override returns (bytes4) {
    //     // get position information
    //     Position.load()

    //     epoch.updateDebtPosition(tokenId);

    //     return this.onERC721Received.selector;
    // }

    function createAccount(uint256 accountId) external {
        // create NFT
        Account.createValid(accountId);
    }

    // function getEpoch() external view returns (Epoch.Data memory) {
    //     return Epoch.load();
    // }

    /*
        1. LP providers call this function to add liquidity to uniswap pool
        2. Specify the range of liquidity to add (i.e from 10 - 50 GWEI)

    */
    function addLiquidity(
        uint256 accountId,
        uint256 amountTokenA,
        uint256 amountTokenB,
        uint256 collateralAmount,
        int24 lowerTick,
        int24 upperTick
    )
        external
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        )
    {
        Account.Data storage account = Account.loadValid(accountId);
        // check within configured range

        Epoch.Data storage epoch = Epoch.load();
        epoch.validateInRange(lowerTick, upperTick);

        VirtualToken(epoch.ethToken).mint(address(this), amountTokenA);
        VirtualToken(epoch.gasToken).mint(address(this), amountTokenB);

        INonfungiblePositionManager.MintParams
            memory mintParams = INonfungiblePositionManager.MintParams({
                token0: address(epoch.ethToken),
                token1: address(epoch.gasToken),
                fee: epoch.feeRate,
                tickLower: lowerTick,
                tickUpper: upperTick,
                amount0Desired: amountTokenA,
                amount1Desired: amountTokenB,
                amount0Min: 0, // TODO
                amount1Min: 0, // TODO
                recipient: address(this),
                deadline: block.timestamp
            });

        (tokenId, liquidity, amount0, amount1) = epoch
            .uniswapPositionManager
            .mint(mintParams);

        // Create a deposit
        Position.load(accountId).createDeposit(tokenId);
        epoch.updateDebtPosition(tokenId, amount0, amount1, liquidity);

        // Remove allowance and refund in both assets.
        if (amount0 < amountTokenA) {
            TransferHelper.safeApprove(
                address(epoch.ethToken),
                address(epoch.uniswapPositionManager),
                0
            );
            uint256 refund0 = amountTokenA - amount0;
            TransferHelper.safeTransfer(
                address(epoch.ethToken),
                msg.sender,
                refund0
            );
        }

        if (amount1 < amountTokenB) {
            TransferHelper.safeApprove(
                address(epoch.gasToken),
                address(epoch.uniswapPositionManager),
                0
            );
            uint256 refund1 = amountTokenB - amount1;
            TransferHelper.safeTransfer(
                address(epoch.gasToken),
                msg.sender,
                refund1
            );
        }
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

    // function openLong(uint256 accountId, uint256 collateralAmount) external {
    //     // check within time range
    //     Account.Data storage account = Account.loadValid(accountId);
    //     Epoch.Data storage epoch = Epoch.load();

    //     IERC20(epoch.collateralAsset).transferFrom(
    //         msg.sender,
    //         address(this),
    //         collateralAmount
    //     );

    //     Position.load(accountId).openLong(collateralAmount);
    // }

    // function reduceLong(uint256 accountId, uint256 vGasAmount) external {
    //     Position.Data storage position = Position.loadValid(accountId);

    //     Position.load(accountId).reduceLong(vGasAmount);
    // }

    // function openShort(uint256 accountId, uint256 collateralAmount) external {
    //     // check within time range
    //     Account.Data storage account = Account.loadValid(accountId);
    //     Epoch.Data storage epoch = Epoch.load();

    //     IERC20(epoch.collateralAsset).transferFrom(
    //         msg.sender,
    //         address(this),
    //         collateralAmount
    //     );

    //     Position.load(accountId).openShort(collateralAmount);
    // }

    // function reduceShort(uint256 accountId, uint256 vEthAmount) external {
    //     Position.Data storage position = Position.loadValid(accountId);

    //     Position.load(accountId).reduceShort(vEthAmount);
    // }

    // --- Uniswap V3 Callbacks ---
    // function uniswapV3MintCallback(
    //     uint256 amount0Owed,
    //     uint256 amount1Owed,
    //     bytes calldata data
    // ) external override {
    //     // check sender
    //     address sender = abi.decode(data, (address));

    //     Epoch.Data storage epoch = Epoch.load();

    //     if (amount0Owed > 0) {
    //         address token = IUniswapV3Pool(epoch.pool).token0();
    //         if (token != address(epoch.gasToken)) {
    //             revert Errors.InvalidVirtualToken(token);
    //         }
    //         VirtualToken(token).transfer(address(epoch.pool), amount0Owed);
    //     }
    //     if (amount1Owed > 0) {
    //         address token = IUniswapV3Pool(epoch.pool).token1();
    //         if (token != address(epoch.ethToken)) {
    //             revert Errors.InvalidVirtualToken(token);
    //         }
    //         VirtualToken(token).transfer(address(epoch.pool), amount1Owed);
    //     }
    // }

    // function uniswapV3SwapCallback(
    //     int256 amount0Delta, // vwstEth 1
    //     int256 amount1Delta, // vwstGas -50
    //     bytes calldata data
    // ) external override {
    //     (uint256 accountId, bool shouldMint) = abi.decode(
    //         data,
    //         (uint160, bool)
    //     );
    //     Epoch.Data storage epoch = Epoch.load();

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
