// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../../src/market/interfaces/IFoil.sol";
import {IVault} from "../../src/vault/interfaces/IVault.sol";

import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {TickMath} from "../../src/market/external/univ3/TickMath.sol";
import {TestVault} from "../helpers/TestVault.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {DecimalPrice} from "../../src/market/libraries/DecimalPrice.sol";
import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";
import {SafeCastI256, SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {Errors} from "../../src/market/storage/Errors.sol";
import {Position} from "../../src/market/storage/Position.sol";
import {IFoilStructs} from "../../src/market/interfaces/IFoilStructs.sol";
import {IResolutionCallback} from "../../src/vault/interfaces/IResolutionCallback.sol";
import {IUMASettlementModule} from "../../src/market/interfaces/IUMASettlementModule.sol";
import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";

contract VaultTest is TestVault {
    using Cannon for Vm;
    using DecimalMath for uint256;
    using DecimalMath for int256;
    using SafeCastI256 for int256;
    using SafeCastU256 for uint256;

    address lp1;
    IFoil foil;
    IVault vault;
    IMintableToken collateralAsset;

    uint160 initialSqrtPriceX96 = 250541448375047946302209916928; // 10
    uint160 updatedSqrtPriceX96 = 306849353968360536420395253760; // 15
    uint256 initialStartTime;

    uint256 DEFAULT_DURATION = 2419200; // 28 days in seconds
    uint256 INITIAL_LP_BALANCE = 100_000 ether;
    IFoilStructs.EpochData epochData;

    uint256 constant MIN_TRADE_SIZE = 10_000; // 10,000 vGas
    uint256 constant BOND_AMOUNT = 100 ether;

    function setUp() public {
        address[] memory feeCollectors = new address[](0);

        lp1 = TestUser.createUser("LP1", INITIAL_LP_BALANCE);

        (foil, vault, collateralAsset) = initializeVault(
            feeCollectors,
            BOND_AMOUNT,
            MIN_TRADE_SIZE
        );

        initialStartTime = block.timestamp + 60;
    }

    function test_revertsWhenInitializeNonOwner() public {
        vm.expectRevert("Only vaultInitializer can call this function");
        vault.initializeFirstEpoch(initialSqrtPriceX96, block.timestamp);
    }

    function test_revertsWhenInitializeFirstEpochAgain() public {
        initializeFirstEpoch(initialSqrtPriceX96);

        vm.startPrank(vaultOwner);

        vm.expectRevert("Already Initialized");
        vault.initializeFirstEpoch(initialSqrtPriceX96, block.timestamp);

        vm.stopPrank();
    }

    function test_revertsWhenResolutionCallbackNonMarket() public {
        initializeFirstEpoch(initialSqrtPriceX96);

        vm.expectRevert("Only market can call this function");
        vault.resolutionCallback(initialSqrtPriceX96);
    }

    function test_firstEpochInitialized() public {
        // Verify no epochs were created before
        vm.expectRevert(
            abi.encodeWithSelector(Errors.NoEpochsCreated.selector)
        );
        foil.getLatestEpoch();

        initializeFirstEpoch(initialSqrtPriceX96);

        // New epoch created
        (epochData, ) = foil.getLatestEpoch();
        assertEq(
            epochData.endTime - epochData.startTime,
            DEFAULT_DURATION,
            "Epoch duration"
        );
    }

    function test_resolutionCallbackFails() public {
        initializeFirstEpoch(initialSqrtPriceX96);

        (epochData, ) = foil.getLatestEpoch();

        vm.warp(epochData.endTime + 1);

        /* manual orchestration of settle for mocking purposes */
        (, , , , IFoilStructs.MarketParams memory marketParams) = foil
            .getMarket();

        IMintableToken bondCurrency = IMintableToken(
            vm.getAddress("BondCurrency.Token")
        );
        bondCurrency.mint(marketParams.bondAmount * 2, vaultOwner);
        vm.startPrank(vaultOwner);

        bondCurrency.approve(address(vault), marketParams.bondAmount);
        bytes32 assertionId = vault.submitMarketSettlementPrice(
            epochData.epochId,
            updatedSqrtPriceX96
        );
        vm.stopPrank();

        address optimisticOracleV3 = vm.getAddress("UMA.OptimisticOracleV3");
        vm.startPrank(optimisticOracleV3);

        vm.mockCallRevert(
            vm.getAddress("Vault"),
            abi.encodeWithSelector(
                IResolutionCallback.resolutionCallback.selector,
                updatedSqrtPriceX96
            ),
            "Resolution callback failed"
        );

        vm.expectEmit(true, true, true, true);
        emit IUMASettlementModule.ResolutionCallbackFailure(
            bytes("Resolution callback failed"),
            updatedSqrtPriceX96
        );

        foil.assertionResolvedCallback(assertionId, true);
    }

    function test_settleEpochCreatesNewEpochWithoutLiquidity() public {
        uint256 epochIdBefore;
        uint256 startTimeBefore;
        uint256 endTimeBefore;

        uint256 epochIdAfter;
        uint256 startTimeAfter;
        uint256 endTimeAfter;

        initializeFirstEpoch(initialSqrtPriceX96);

        // New epoch created
        (epochData, ) = foil.getLatestEpoch();
        epochIdBefore = epochData.epochId;
        startTimeBefore = epochData.startTime;
        endTimeBefore = epochData.endTime;

        // Settle
        vm.warp(epochData.endTime + 1);
        settleEpochFromVault(
            epochData.epochId,
            updatedSqrtPriceX96,
            vaultOwner
        );

        // New epoch created
        (epochData, ) = foil.getLatestEpoch();
        epochIdAfter = epochData.epochId;
        startTimeAfter = epochData.startTime;
        endTimeAfter = epochData.endTime;

        assertEq(epochIdAfter, epochIdBefore + 1);
        assertEq(startTimeAfter, endTimeBefore + 1);
        assertEq(endTimeAfter, startTimeAfter + DEFAULT_DURATION);

        // check new bounds
        // min price should be 15 / 3 = 5 ether
        // max price should be 15 * 3 = 45 ether

        assertLe(epochData.minPriceD18, 5 ether);
        assertApproxEqRel(epochData.minPriceD18, 5 ether, 0.02 ether);

        assertGe(epochData.maxPriceD18, 45 ether);
        assertApproxEqRel(epochData.maxPriceD18, 45 ether, 0.02 ether);
    }

    function test_settleEpochCreatesNewEpochWithLiquidity() public {
        uint256 epochIdBefore;
        uint256 startTimeBefore;
        uint256 endTimeBefore;

        uint256 epochIdAfter;
        uint256 startTimeAfter;
        uint256 endTimeAfter;

        initializeFirstEpoch(initialSqrtPriceX96);

        // New epoch created
        (epochData, ) = foil.getLatestEpoch();
        epochIdBefore = epochData.epochId;
        startTimeBefore = epochData.startTime;
        endTimeBefore = epochData.endTime;

        // Add liquidity
        vm.prank(lp1);
        vault.requestDeposit(100 ether);

        // Settle
        vm.warp(epochData.endTime + 1);
        settleEpochFromVault(
            epochData.epochId,
            updatedSqrtPriceX96,
            vaultOwner
        );

        // New epoch created
        (epochData, ) = foil.getLatestEpoch();
        epochIdAfter = epochData.epochId;
        startTimeAfter = epochData.startTime;
        endTimeAfter = epochData.endTime;

        assertEq(epochIdAfter, epochIdBefore + 1);
        assertEq(startTimeAfter, endTimeBefore + 1);
        assertEq(endTimeAfter, startTimeAfter + DEFAULT_DURATION);

        // check new bounds
        // min price should be 15 / 3 = 5 ether
        // max price should be 15 * 3 = 45 ether

        assertLe(epochData.minPriceD18, 5 ether);
        assertApproxEqRel(epochData.minPriceD18, 5 ether, 0.02 ether);

        assertGe(epochData.maxPriceD18, 45 ether);
        assertApproxEqRel(epochData.maxPriceD18, 45 ether, 0.02 ether);

        // Check that the vault's position in the market has the correct collateral amount
        uint256 positionId = vault.getPositionId();
        Position.Data memory position = foil.getPosition(positionId);
        assertEq(
            position.depositedCollateralAmount,
            100 ether,
            "Position collateral should match deposit amount"
        );
    }
}
