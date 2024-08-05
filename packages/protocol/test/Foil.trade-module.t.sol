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
import "../src/contracts/storage/FAccount.sol";

import "forge-std/console2.sol";

contract FoilTradeModuleTest is Test {
    using Cannon for Vm;

    IFoil foil;
    address pool;
    address tokenA;
    address tokenB;
    uint256 constant EPOCH_START_TIME = 1722270000;

    function setUp() public {
        console2.log("setUp");
        foil = IFoil(vm.getAddress("Foil"));

        console2.log("getEpoch");

        (, , pool, tokenA, tokenB) = foil.getEpoch(EPOCH_START_TIME);

        console2.log("pool", pool);
        console2.log("tokenA", tokenA);
        console2.log("tokenB", tokenB);
    }

    function test_trade_long_Only() public {
        uint256 priceReference;
        uint256 accountId_1;
        priceReference = foil.getReferencePrice(EPOCH_START_TIME);

        console2.log("priceReference", priceReference);
        IFoilStructs.LiquidityPositionParams memory params = IFoilStructs
            .LiquidityPositionParams({
                epochId: EPOCH_START_TIME,
                amountTokenB: 20000 ether,
                amountTokenA: 1000 ether,
                collateralAmount: 10000000 ether,
                lowerTick: 12200,
                upperTick: 12400,
                minAmountTokenA: 0,
                minAmountTokenB: 0
            });

        foil.createLiquidityPosition(params);
        params.amountTokenB = 40000 ether;
        params.amountTokenA = 2000 ether;
        foil.createLiquidityPosition(params);

        priceReference = foil.getReferencePrice(EPOCH_START_TIME);
        console2.log("priceReference", priceReference);

        // Create Long position
        console2.log("Create Long position");
        priceReference = foil.getReferencePrice(EPOCH_START_TIME);
        console2.log("priceReference", priceReference);
        accountId_1 = foil.createTraderPosition(
            EPOCH_START_TIME,
            10 ether,
            .1 ether,
            0
        );
        logPositionAndAccount(accountId_1);

        // Modify Long position (increase it)
        console2.log("Modify Long position (increase it)");
        priceReference = foil.getReferencePrice(EPOCH_START_TIME);
        console2.log("priceReference", priceReference);
        foil.modifyTraderPosition(
            EPOCH_START_TIME,
            accountId_1,
            10 ether,
            .2 ether,
            0
        );
        logPositionAndAccount(accountId_1);

        // Modify Long position (decrease it)
        console2.log("Modify Long position (decrease it)");
        priceReference = foil.getReferencePrice(EPOCH_START_TIME);
        console2.log("priceReference", priceReference);
        foil.modifyTraderPosition(
            EPOCH_START_TIME,
            accountId_1,
            0 ether,
            .1 ether,
            0
        );
        logPositionAndAccount(accountId_1);

        // Modify Long position (close it)
        console2.log("Modify Long position (close it)");
        priceReference = foil.getReferencePrice(EPOCH_START_TIME);
        console2.log("priceReference", priceReference);
        foil.modifyTraderPosition(EPOCH_START_TIME, accountId_1, 0 ether, 0, 0);
        logPositionAndAccount(accountId_1);
    }

    function test_trade_long_cross_sides() public {
        uint256 priceReference;
        uint256 accountId_3;
        priceReference = foil.getReferencePrice(EPOCH_START_TIME);

        console2.log("priceReference", priceReference);
        IFoilStructs.LiquidityPositionParams memory params = IFoilStructs
            .LiquidityPositionParams({
                epochId: EPOCH_START_TIME,
                amountTokenB: 20000 ether,
                amountTokenA: 1000 ether,
                collateralAmount: 10000000 ether,
                lowerTick: 12200,
                upperTick: 12400,
                minAmountTokenA: 0,
                minAmountTokenB: 0
            });

        foil.createLiquidityPosition(params);
        params.amountTokenB = 40000 ether;
        params.amountTokenA = 2000 ether;
        foil.createLiquidityPosition(params);

        priceReference = foil.getReferencePrice(EPOCH_START_TIME);
        console2.log("priceReference", priceReference);

        // Create Long position (another one)
        console2.log("Create Long position (another one)");
        priceReference = foil.getReferencePrice(EPOCH_START_TIME);
        console2.log("priceReference", priceReference);
        accountId_3 = foil.createTraderPosition(
            EPOCH_START_TIME,
            10 ether,
            .1 ether,
            0
        );
        logPositionAndAccount(accountId_3);

        // Modify Long position (change side)
        console2.log("Modify Long position (change side)");
        priceReference = foil.getReferencePrice(EPOCH_START_TIME);
        console2.log("priceReference", priceReference);
        foil.modifyTraderPosition(
            EPOCH_START_TIME,
            accountId_3,
            0 ether,
            -.05 ether,
            -.01 ether
        );
        logPositionAndAccount(accountId_3);
    }

    function test_trade_short() public {
        uint256 priceReference;
        uint256 accountId_2;
        priceReference = foil.getReferencePrice(EPOCH_START_TIME);

        console2.log("priceReference", priceReference);
        IFoilStructs.LiquidityPositionParams memory params = IFoilStructs
            .LiquidityPositionParams({
                epochId: EPOCH_START_TIME,
                amountTokenB: 20000 ether,
                amountTokenA: 1000 ether,
                collateralAmount: 10000000 ether,
                lowerTick: 12200,
                upperTick: 12400,
                minAmountTokenA: 0,
                minAmountTokenB: 0
            });

        foil.createLiquidityPosition(params);
        params.amountTokenB = 40000 ether;
        params.amountTokenA = 2000 ether;
        foil.createLiquidityPosition(params);

        priceReference = foil.getReferencePrice(EPOCH_START_TIME);
        console2.log("priceReference", priceReference);

        // Create Short position
        console2.log("Create Short position");
        accountId_2 = foil.createTraderPosition(
            EPOCH_START_TIME,
            10 ether,
            -.1 ether,
            0
        );
        logPositionAndAccount(accountId_2);

        // Modify Short position (increase it)
        console2.log("Modify Short position (increase it)");
        foil.modifyTraderPosition(
            EPOCH_START_TIME,
            accountId_2,
            10 ether,
            -.2 ether,
            -.1 ether
        );
        logPositionAndAccount(accountId_2);

        // Modify Short position (decrease it)
        console2.log("Modify Short position (decrease it)");
        foil.modifyTraderPosition(
            EPOCH_START_TIME,
            accountId_2,
            0,
            -.05 ether,
            -.01 ether
        );
        logPositionAndAccount(accountId_2);

        // Modify Short position (close it)
        console2.log("Modify Short position (close it)");
        foil.modifyTraderPosition(EPOCH_START_TIME, accountId_2, 0, 0, 0);
        logPositionAndAccount(accountId_2);
    }

    function test_trade_short_cross_sides() public {
        uint256 priceReference;
        uint256 accountId_4;
        priceReference = foil.getReferencePrice(EPOCH_START_TIME);

        console2.log("priceReference", priceReference);
        IFoilStructs.LiquidityPositionParams memory params = IFoilStructs
            .LiquidityPositionParams({
                epochId: EPOCH_START_TIME,
                amountTokenB: 20000 ether,
                amountTokenA: 1000 ether,
                collateralAmount: 10000000 ether,
                lowerTick: 12200,
                upperTick: 12400,
                minAmountTokenA: 0,
                minAmountTokenB: 0
            });

        foil.createLiquidityPosition(params);
        params.amountTokenB = 40000 ether;
        params.amountTokenA = 2000 ether;
        foil.createLiquidityPosition(params);

        priceReference = foil.getReferencePrice(EPOCH_START_TIME);
        console2.log("priceReference", priceReference);

        // Create Short position (another one)
        console2.log("Create Short position (another one)");
        accountId_4 = foil.createTraderPosition(
            EPOCH_START_TIME,
            10 ether,
            -.1 ether,
            0
        );
        logPositionAndAccount(accountId_4);

        // Modify Short position (change side)
        console2.log("Modify Short position (change side)");
        foil.modifyTraderPosition(
            EPOCH_START_TIME,
            accountId_4,
            0,
            .05 ether,
            0
        );
        logPositionAndAccount(accountId_4);
    }

    function logPositionAndAccount(uint256 accountId) public {
        Position.Data memory position = foil.getPositionData(accountId);
        console2.log(" >>> Position", accountId);
        console2.log("      >> accountId         : ", position.accountId);
        console2.log("      >> vEthAmount        : ", position.vEthAmount);
        console2.log("      >> vGasAmount        : ", position.vGasAmount);
        console2.log(
            "      >> currentTokenAmount: ",
            position.currentTokenAmount
        );

        FAccount.Data memory account = foil.getAccountData(accountId);
        console2.log(" >>> FAccount", accountId);
        console2.log("      >> id                : ", account.tokenId);
        console2.log("      >> collateralAmount  : ", account.collateralAmount);
        console2.log("      >> borrowedGwei      : ", account.borrowedGwei);
        console2.log("      >> borrowedGas       : ", account.borrowedGas);
    }
}
