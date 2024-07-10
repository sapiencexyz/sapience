// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {INonfungiblePositionManager} from "../interfaces/external/INonfungiblePositionManager.sol";
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import {IUniswapV3MintCallback} from "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3MintCallback.sol";
import {IUniswapV3SwapCallback} from "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol";
import {TickMath} from "../external/univ3/TickMath.sol";
import "../external/VirtualToken.sol";
import "../../synthetix/interfaces/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../storage/Epoch.sol";
import "../storage/Account.sol";
import "../storage/Position.sol";
import {LiquidityAmounts} from "../external/univ3/LiquidityAmounts.sol";
import {IFoilStructs} from "../interfaces/IFoilStructs.sol";
// import "../storage/ERC721Storage.sol";
import "../storage/ERC721EnumerableStorage.sol";

import "forge-std/console2.sol";

contract EpochLiquidityModule is
    ReentrancyGuard,
    IERC721Receiver
    // IUniswapV3MintCallback
    // IUniswapV3SwapCallback
{
    using Epoch for Epoch.Data;
    using Account for Account.Data;
    using Position for Position.Data;

    // using ERC721Storage for ERC721Storage.Data;

    function createLiquidityPositionTwo(
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
        console2.log("HELLO");
        Epoch.Data storage epoch = Epoch.load();
        console2.log(
            "BEFORE MINTING TOKENS",
            params.amountTokenA,
            params.amountTokenB
        );
        console2.logAddress(address(this));
        console2.logAddress(address(epoch.ethToken));

        epoch.ethToken.mint(address(this), params.amountTokenA);
        console2.log("MIDDLE");
        epoch.gasToken.mint(address(this), params.amountTokenB);

        console2.log("AFTER MINTING TOKENS");

        epoch.ethToken.approve(
            address(epoch.uniswapPositionManager),
            params.amountTokenA
        );
        epoch.gasToken.approve(
            address(epoch.uniswapPositionManager),
            params.amountTokenB
        );

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

    /*
        1. LP providers call this function to add liquidity to uniswap pool
        2. Specify the range of liquidity to add (i.e from 10 - 50 GWEI)

    */

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
        console2.log("OLD FUNC");
        uint accountId = ERC721EnumerableStorage.totalSupply() + 1;
        Account.createValid(accountId);
        // ERC721Storage._mint(msg.sender, accountId);

        // TODO: check collateral asset and receive collateral

        Account.Data storage account = Account.loadValid(accountId);
        // check within configured range

        Epoch.Data storage epoch = Epoch.load();

        UniV3Abstraction.RuntimeLiquidityPositionParams
            memory uniV3HelperLiquidityPositionParams = UniV3Abstraction
                .RuntimeLiquidityPositionParams({
                    accountId: accountId,
                    recipient: address(this),
                    pool: address(epoch.pool),
                    lowerTick: params.lowerTick,
                    upperTick: params.upperTick,
                    amountTokenA: params.amountTokenA,
                    amountTokenB: params.amountTokenB
                });

        (addedAmount0, addedAmount1, liquidity) = UniV3Abstraction.addLiquidity(
            uniV3HelperLiquidityPositionParams
        );
        console2.log(addedAmount0, addedAmount1);

        // todo: transfer collateral
        // account.updateLoan(params.collateralAmount, addedAmount0, addedAmount1);

        // account.validateProvidedLiquidity(
        //     epoch,
        //     liquidity,
        //     params.lowerTick,
        //     params.upperTick
        // );
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

        Position.load(accountId).vEthAmount += addedAmount0;
        Position.load(accountId).vGasAmount += addedAmount1;
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

    function updateLiquidityPosition(
        uint256 tokenId,
        uint256 collateral,
        uint256 liquidityRatio
    )
        external
        payable
        returns (uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        liquidity = 1;
        amount0 = 2;
        amount1 = 3;
    }

    // --- Uniswap V3 Callbacks ---
    // function uniswapV3MintCallback(
    //     uint256 amount0Owed,
    //     uint256 amount1Owed,
    //     bytes calldata data
    // ) external override {
    //     // TODO: check sender is uniswap
    //     uint256 accountId = abi.decode(data, (uint256));

    //     Epoch.Data storage epoch = Epoch.load();
    //     Position.Data storage position = Position.loadValid(accountId);

    //     // VirtualToken(epoch.gasToken).mint(address(this), amountTokenB);

    //     // TransferHelper.safeApprove(
    //     //     address(epoch.ethToken),
    //     //     address(epoch.uniswapPositionManager),
    //     //     type(uint256).max
    //     // );
    //     // TransferHelper.safeApprove(
    //     //     address(epoch.gasToken),
    //     //     address(epoch.uniswapPositionManager),
    //     //     type(uint256).max
    //     // );

    //     if (amount0Owed > 0) {
    //         address token = IUniswapV3Pool(epoch.pool).token0();
    //         // Check if the tokens are not swapped
    //         if (token != address(epoch.ethToken)) {
    //             revert Errors.InvalidVirtualToken(token);
    //         }

    //         epoch.ethToken.mint(address(this), amount0Owed);
    //         epoch.ethToken.transfer(address(epoch.pool), amount0Owed);

    //         position.vEthAmount += amount0Owed;
    //     }

    //     if (amount1Owed > 0) {
    //         address token = IUniswapV3Pool(epoch.pool).token1();
    //         // Check if the tokens are not swapped
    //         if (token != address(epoch.gasToken)) {
    //             revert Errors.InvalidVirtualToken(token);
    //         }

    //         epoch.gasToken.mint(address(this), amount1Owed);
    //         epoch.gasToken.transfer(address(epoch.pool), amount1Owed);

    //         position.vGasAmount += amount1Owed;
    //     }
    // }
}
