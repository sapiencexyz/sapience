// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

// import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
// import {INonfungiblePositionManager} from "../interfaces/external/INonfungiblePositionManager.sol";
// import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
// import {IUniswapV3MintCallback} from "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3MintCallback.sol";
// import {IUniswapV3SwapCallback} from "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol";
// import {TickMath} from "../external/univ3/TickMath.sol";
// import "../external/VirtualToken.sol";
import "../../synthetix/interfaces/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
// import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// import "../storage/Epoch.sol";
import "../storage/Account.sol";
// import "../storage/Position.sol";
// import {LiquidityAmounts} from "../external/univ3/LiquidityAmounts.sol";
import {IFoilStructs} from "../interfaces/IFoilStructs.sol";
// import "../storage/ERC721Storage.sol";
import "../storage/ERC721EnumerableStorage.sol";
import "../utils/UniV3Abstraction.sol";
import "forge-std/console2.sol";

contract EpochLiquidityModule is
    ReentrancyGuard,
    IERC721Receiver
    // IUniswapV3MintCallback
    // IUniswapV3SwapCallback
{
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
