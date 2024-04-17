// contracts/FoilImplementation.sol
// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IUniswapV3MintCallback} from "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3MintCallback.sol";
import {IUniswapV3SwapCallback} from "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol";
import "./VirtualToken.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../storage/Epoch.sol";
import "../storage/Account.sol";
import "../storage/Position.sol";

contract Foil is
    IUniswapV3MintCallback,
    IUniswapV3SwapCallback,
    ReentrancyGuard
{
    using Epoch for Epoch.Data;
    using Account for Account.Data;
    using Position for Position.Data;

    constructor(
        uint endTime,
        address uniswap,
        address resolver,
        address collateralAsset,
        uint baseAssetMinPrice,
        uint baseAssetMaxPrice,
        uint24 feeRate
    ) {
        Epoch.Data storage epoch = Epoch.createValid(
            endTime,
            uniswap,
            resolver,
            collateralAsset,
            baseAssetMinPrice,
            baseAssetMaxPrice
        );

        epoch.createPool(feeRate);
    }

    function createAccount(uint256 accountId) external {
        // create NFT
        Account.createValid(accountId);
    }

    /*
        1. LP providers call this function to add liquidity to uniswap pool
        2. Specify the range of liquidity to add (i.e from 10 - 50 GWEI)

    */
    function addLiquidity(
        uint256 accountId,
        uint256 amount,
        int24 lowerTick,
        int24 upperTick
    ) external {
        Account.Data storage account = Account.loadValid(accountId);
        // check within configured range

        Epoch.Data storage epoch = Epoch.load();
        epoch.validateInRange(lowerTick, upperTick);

        UniV3Abstraction.addLiquidity(
            account.getAddress(),
            address(epoch.pool),
            lowerTick,
            upperTick,
            amount,
            Epoch.load()
        );
    }

    function removeLiquidity(
        uint256 accountId,
        uint128 liquidity,
        int24 lowerTick,
        int24 upperTick
    ) external {
        Epoch.Data storage epoch = Epoch.load();

        (
            ,
            ,
            uint128 amount0Received,
            uint128 amount1Received
        ) = UniV3Abstraction.removeLiquidity(
                Account.loadValid(accountId).getAddress(),
                address(epoch.pool),
                lowerTick,
                upperTick,
                liquidity
            );

        Position.load(accountId).updateBalance(
            int256(uint256(amount0Received)),
            int256(uint256(amount1Received))
        );
    }

    function openLong(uint256 accountId, uint256 collateralAmount) external {
        // check within time range
        Account.Data storage account = Account.loadValid(accountId);
        Epoch.Data storage epoch = Epoch.load();

        IERC20(epoch.collateralAsset).transferFrom(
            msg.sender,
            address(this),
            collateralAmount
        );

        Position.load(accountId).openLong(collateralAmount);
    }

    function reduceLong(uint256 accountId, uint256 vGasAmount) external {
        Position.Data storage position = Position.loadValid(accountId);

        Position.load(accountId).reduceLong(vGasAmount);
    }

    function openShort(uint256 accountId, uint256 collateralAmount) external {
        // check within time range
        Account.Data storage account = Account.loadValid(accountId);
        Epoch.Data storage epoch = Epoch.load();

        IERC20(epoch.collateralAsset).transferFrom(
            msg.sender,
            address(this),
            collateralAmount
        );

        Position.load(accountId).openShort(collateralAmount);
    }

    function reduceShort(uint256 accountId, uint256 vEthAmount) external {
        Position.Data storage position = Position.loadValid(accountId);

        Position.load(accountId).reduceShort(vEthAmount);
    }

    // --- Uniswap V3 Callbacks ---
    function uniswapV3MintCallback(
        uint256 amount0Owed,
        uint256 amount1Owed,
        bytes calldata data
    ) external override {
        // check sender
        address sender = abi.decode(data, (address));

        Epoch.Data storage epoch = Epoch.load();

        if (amount0Owed > 0) {
            address token = IUniswapV3Pool(epoch.pool).token0();
            if (token != address(epoch.vGas)) {
                revert Errors.InvalidVirtualToken(token);
            }
            VirtualToken(token).transfer(address(epoch.pool), amount0Owed);
        }
        if (amount1Owed > 0) {
            address token = IUniswapV3Pool(epoch.pool).token1();
            if (token != address(epoch.vEth)) {
                revert Errors.InvalidVirtualToken(token);
            }
            VirtualToken(token).transfer(address(epoch.pool), amount1Owed);
        }
    }

    function uniswapV3SwapCallback(
        int256 amount0Delta, // vwstEth 1
        int256 amount1Delta, // vwstGas -50
        bytes calldata data
    ) external override {
        (uint256 accountId, bool shouldMint) = abi.decode(
            data,
            (uint160, bool)
        );
        Epoch.Data storage epoch = Epoch.load();

        IUniswapV3Pool pool = IUniswapV3Pool(epoch.pool);

        (address token, uint256 amountToPay) = amount0Delta > 0
            ? (pool.token0(), uint256(amount0Delta))
            : (pool.token1(), uint256(amount1Delta));

        if (shouldMint) {
            VirtualToken(token).mint(address(this), amountToPay);
        }

        VirtualToken(token).transfer(address(epoch.pool), amountToPay);

        Position.load(accountId).updateBalance(amount0Delta, amount1Delta);
    }
}
