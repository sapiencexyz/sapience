// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

// import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
// import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// import {ISwapRouter} from "../interfaces/external/ISwapRouter.sol";
// import {IUniswapV3SwapCallback} from "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol";
// import "../storage/Epoch.sol";
import "../storage/Account.sol";
import "../storage/Position.sol";
import "../storage/ERC721Storage.sol";
import "../storage/ERC721EnumerableStorage.sol";
import "../../synthetix/utils/DecimalMath.sol";

import "forge-std/console2.sol";

contract EpochTradeModule {
    using Epoch for Epoch.Data;
    // using Account for Account.Data;
    // using Position for Position.Data;
    // using ERC721Storage for ERC721Storage.Data;
    using DecimalMath for uint256;

    function swapTokens(
        uint256 amountInVEth,
        uint256 amountInVGas
    ) external returns (uint256 amountOutVEth, uint256 amountOutVGas) {
        if (amountInVEth > 0 && amountInVGas > 0) {
            revert("Only one token can be traded at a time");
        }

        Epoch.Data storage epoch = Epoch.load();
        epoch.validateSettlmentState();

        if (epoch.settled) {
            return _afterSettlementSwap(epoch, amountInVEth, amountInVGas);
        }

        return _preSettlementSwap(epoch, amountInVEth, amountInVGas);
    }

    function _afterSettlementSwap(
        Epoch.Data storage epoch,
        uint256 amountInVEth,
        uint256 amountInVGas
    ) internal returns (uint256 amountOutVEth, uint256 amountOutVGas) {
        console2.log("_afterSettlementSwap");

        if (amountInVEth > 0) {
            amountOutVEth = 0;
            amountOutVGas = amountInVEth.divDecimal(epoch.settlementPrice);
        } else {
            amountOutVEth = amountInVGas.mulDecimal(epoch.settlementPrice);
            amountOutVGas = 0;
        }
    }

    function _preSettlementSwap(
        Epoch.Data storage epoch,
        uint256 amountInVEth,
        uint256 amountInVGas
    ) internal returns (uint256 amountOutVEth, uint256 amountOutVGas) {
        console2.log("_preSettlementSwap");

        address tokenIn;
        address tokenOut;
        uint256 amountIn;

        if (amountInVEth > 0) {
            epoch.ethToken.mint(address(this), amountInVEth);
            epoch.ethToken.approve(
                address(epoch.uniswapSwapRouter),
                amountInVEth
            );
            tokenIn = address(epoch.ethToken);
            tokenOut = address(epoch.gasToken);
            amountIn = amountInVEth;
        } else {
            epoch.gasToken.mint(address(this), amountInVGas);
            epoch.gasToken.approve(
                address(epoch.uniswapSwapRouter),
                amountInVGas
            );
            tokenIn = address(epoch.gasToken);
            tokenOut = address(epoch.ethToken);
            amountIn = amountInVGas;
        }

        // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
        // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: epoch.feeRate,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });
        uint256 amountOut = epoch.uniswapSwapRouter.exactInputSingle(params);

        if (amountInVEth > 0) {
            amountOutVGas = amountOut;
        } else {
            amountOutVEth = amountOut;
        }
    }

    function createTraderPosition(uint collateral, int size) external {
        uint accountId = ERC721EnumerableStorage.totalSupply() + 1;
        Account.createValid(accountId);
        ERC721Storage._mint(msg.sender, accountId);

        // Create empty position
        Position.load(accountId).accountId = accountId;
    }

    function updateTraderPosition(
        uint256 tokenId,
        uint collateral,
        int size
    ) external {
        return;
    }

    /*

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

*/

    // function uniswapV3SwapCallback(
    //     int256 amount0Delta, // vwstEth 1
    //     int256 amount1Delta, // vwstGas -50
    //     bytes calldata data
    // ) external override {
    //     (uint256 accountId, bool shouldMint) = abi.decode(
    //         data,
    //         (uint256, bool)
    //     );

    //     console2.log("swap callback - accountId  :", accountId);
    //     console2.log("swap callback - shouldMint :", shouldMint);

    //     console2.log("swap callback - amount0Delta  :", amount0Delta);
    //     console2.log("swap callback - amount1Delta  :", amount1Delta);
    //     Epoch.Data storage epoch = Epoch.load();
    //     Position.Data storage position = Position.loadValid(accountId);

    //     if (amount0Delta > 0) {
    //         address token = IUniswapV3Pool(epoch.pool).token0();
    //         // Check if the tokens are not swapped
    //         if (token != address(epoch.ethToken)) {
    //             revert Errors.InvalidVirtualToken(token);
    //         }

    //         if (shouldMint) {
    //             epoch.ethToken.mint(address(this), uint(amount0Delta));
    //         }
    //         epoch.ethToken.transfer(address(epoch.pool), uint(amount0Delta));
    //     }

    //     if (amount1Delta > 0) {
    //         address token = IUniswapV3Pool(epoch.pool).token1();
    //         // Check if the tokens are not swapped
    //         if (token != address(epoch.gasToken)) {
    //             revert Errors.InvalidVirtualToken(token);
    //         }

    //         if (shouldMint) {
    //             epoch.gasToken.mint(address(this), uint(amount1Delta));
    //         }
    //         epoch.gasToken.transfer(address(epoch.pool), uint(amount1Delta));
    //     }
    //     Position.load(accountId).updateBalance(amount0Delta, amount1Delta);
    //     //     IUniswapV3Pool pool = IUniswapV3Pool(epoch.pool);

    //     //     (address token, uint256 amountToPay) = amount0Delta > 0
    //     //         ? (pool.token0(), uint256(amount0Delta))
    //     //         : (pool.token1(), uint256(amount1Delta));

    //     //     if (shouldMint) {
    //     //         VirtualToken(token).mint(address(this), amountToPay);
    //     //     }

    //     //     VirtualToken(token).transfer(address(epoch.pool), amountToPay);

    //     //     Position.load(accountId).updateBalance(amount0Delta, amount1Delta);
    //     // }
    // }
}
