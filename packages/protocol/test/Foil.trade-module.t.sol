// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";

import {IFoil} from "../src/contracts/interfaces/IFoil.sol";
import {IFoilStructs} from "../src/contracts/interfaces/IFoilStructs.sol";
import {VirtualToken} from "../src/contracts/external/VirtualToken.sol";
import {TickMath} from "../src/contracts/external/univ3/TickMath.sol";
import "../src/contracts/interfaces/external/INonfungiblePositionManager.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "../src/contracts/storage/Position.sol";
import "../src/contracts/storage/Account.sol";

import "forge-std/console2.sol";

contract FoilTest is Test {
    using Cannon for Vm;

    IFoil foil;
    address pool;
    address tokenA;
    address tokenB;

    function setUp() public {
        foil = IFoil(vm.getAddress("Foil"));

        (pool, tokenA, tokenB) = foil.getEpoch();
    }

    function test_trade() public {
        IFoilStructs.LiquidityPositionParams memory params = IFoilStructs
            .LiquidityPositionParams({
                amountTokenA: 50 ether,
                amountTokenB: 50 ether,
                collateralAmount: 10 ether,
                lowerTick: 16000, // 5
                upperTick: 30000 // 20
            });
        (
            uint256 positionId,
            uint128 liquidity,
            uint256 addedAmount0,
            uint256 addedAmount1
        ) = foil.createLiquidityPosition(params);
        console2.log("LIQUIDITY POSITION CREATED", positionId, liquidity);
        console2.log("ADDED LIQUIDITY", addedAmount0, addedAmount1);
        params.amountTokenA = 100 ether;
        params.amountTokenB = 100 ether;
        (uint256 positionId2, , , ) = foil.createLiquidityPosition(params);

        // (uint256 tradedAmoun0, uint256 tradedAmount2) = foil.swapTokens(
        //     0,
        //     1 ether
        // );

        // console2.log("TRADED", tradedAmoun0, tradedAmount2);

        // foil.fakeSettle(5 ether);
        // (tradedAmoun0, tradedAmount2) = foil.swapTokens(0, 1 ether);

        // console2.log("TRADED after settle 1", tradedAmoun0, tradedAmount2);
        // (tradedAmoun0, tradedAmount2) = foil.swapTokens(1 ether, 0);

        // console2.log("TRADED after settle 2", tradedAmoun0, tradedAmount2);
    }

    // function logPositionAndAccount(uint256 accountId) public {
    //     Position.data memory position = foil.getPositionData(accountId);
    //     // (
    //     //     uint256 initialEthDeposit,
    //     //     uint256 accountId,
    //     //     uint256 vEthAmount,
    //     //     uint256 vGasAmount
    //     // ) = foil.getPositionData(accountId);

    //     (
    //         uint256 id, // nft id
    //         uint256 collateralAmount, // configured collateral
    //         uint256 borrowedGwei, // Token A
    //         uint256 borrowedGas, // Token B

    //     ) = foil.getAccountData(accountId);

    //     console2.log(" >>> Position", accountId);
    //     console2.log("      >> vEthAmount        : ", vEthAmount);
    //     console2.log("      >> vGasAmount        : ", vGasAmount);
    //     console2.log("      >> initialEthDeposit : ", initialEthDeposit);
    //     console2.log("      >> accountId         : ", accountId);
    //     console2.log(" >>> Account", accountId);
    //     console2.log("      >> id                : ", id);
    //     console2.log("      >> collateralAmount  : ", collateralAmount);
    //     console2.log("      >> borrowedGwei      : ", borrowedGwei);
    //     console2.log("      >> borrowedGas       : ", borrowedGas);
    // }
}
