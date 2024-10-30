// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../../src/market/interfaces/IFoil.sol";
import {IVault} from "../../src/vault/interfaces/IVault.sol";

import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {TickMath} from "../../src/market/external/univ3/TickMath.sol";
import {TestTrade} from "../helpers/TestTrade.sol";
import {TestEpoch} from "../helpers/TestEpoch.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {DecimalPrice} from "../../src/market/libraries/DecimalPrice.sol";
import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";
import {SafeCastI256, SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {Errors} from "../../src/market/storage/Errors.sol";
import {Position} from "../../src/market/storage/Position.sol";
import {IFoilStructs} from "../../src/market/interfaces/IFoilStructs.sol";
import {MigrationMathUtils} from "../../src/market/external/univ3/MigrationMathUtils.sol";
import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";

contract VaultTest is TestTrade {
    using Cannon for Vm;
    using DecimalMath for uint256;
    using DecimalMath for int256;
    using SafeCastI256 for int256;
    using SafeCastU256 for uint256;

    address owner;
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

    function setUp() public {
        address[] memory feeCollectors = new address[](0);

        lp1 = TestUser.createUser("LP1", INITIAL_LP_BALANCE);

        (foil, vault, collateralAsset, owner) = _initializeVault(feeCollectors);

        initialStartTime = block.timestamp + 60;
    }

    function test_revertsWhenInitializeNonOwner() public {
        vm.expectRevert("Only vaultInitializer can call this function");
        vault.initializeFirstEpoch(initialStartTime, initialSqrtPriceX96);
    }

    function test_revertsWhenInitializeFirstEpochAgain() public {
        initializeFirstEpoch(initialSqrtPriceX96, initialStartTime);

        vm.startPrank(0x70997970C51812dc3A010C7d01b50e0d17dc79C8);

        vm.expectRevert("Already Initialized");
        vault.initializeFirstEpoch(initialStartTime, initialSqrtPriceX96);

        vm.stopPrank();
    }

    function test_revertsWhenResolutionCallbackNonMarket() public {
        initializeFirstEpoch(initialSqrtPriceX96, initialStartTime);

        vm.expectRevert("Only market can call this function");
        vault.resolutionCallback(initialSqrtPriceX96);
    }

    function test_firstEpochInitialized() public {
        // Verify no epochs were created before
        vm.expectRevert(
            abi.encodeWithSelector(Errors.NoEpochsCreated.selector)
        );
        foil.getLatestEpoch();

        initializeFirstEpoch(initialSqrtPriceX96, initialStartTime);

        // New epoch created
        (epochData, ) = foil.getLatestEpoch();
        assertEq(
            epochData.endTime - epochData.startTime,
            DEFAULT_DURATION,
            "Epoch duration"
        );
    }

    function test_settleEpochCreatesNewEpochWithoutLiquidity() public {
        uint256 epochIdBefore;
        uint256 startTimeBefore;
        uint256 endTimeBefore;

        uint256 epochIdAfter;
        uint256 startTimeAfter;
        uint256 endTimeAfter;

        initializeFirstEpoch(initialSqrtPriceX96, initialStartTime);

        // New epoch created
        (epochData, ) = foil.getLatestEpoch();
        epochIdBefore = epochData.epochId;
        startTimeBefore = epochData.startTime;
        endTimeBefore = epochData.endTime;

        // Settle
        vm.warp(epochData.endTime + 1);
        settleEpochFromVault(epochData.epochId, updatedSqrtPriceX96, owner);

        // New epoch created
        (epochData, ) = foil.getLatestEpoch();
        epochIdAfter = epochData.epochId;
        startTimeAfter = epochData.startTime;
        endTimeAfter = epochData.endTime;

        assertEq(epochIdAfter, epochIdBefore + 1);
        assertEq(startTimeAfter, endTimeBefore + DEFAULT_DURATION);
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

        initializeFirstEpoch(initialSqrtPriceX96, initialStartTime);

        // New epoch created
        (epochData, ) = foil.getLatestEpoch();
        epochIdBefore = epochData.epochId;
        startTimeBefore = epochData.startTime;
        endTimeBefore = epochData.endTime;

        // Add liquidity
        vm.prank(lp1);
        vault.requestDeposit(100 ether, lp1, lp1);

        // Settle
        vm.warp(epochData.endTime + 1);
        settleEpochFromVault(epochData.epochId, updatedSqrtPriceX96, owner);

        // New epoch created
        (epochData, ) = foil.getLatestEpoch();
        epochIdAfter = epochData.epochId;
        startTimeAfter = epochData.startTime;
        endTimeAfter = epochData.endTime;

        assertEq(epochIdAfter, epochIdBefore + 1);
        assertEq(startTimeAfter, endTimeBefore + DEFAULT_DURATION);
        assertEq(endTimeAfter, startTimeAfter + DEFAULT_DURATION);

        // check new bounds
        // min price should be 15 / 3 = 5 ether
        // max price should be 15 * 3 = 45 ether

        assertLe(epochData.minPriceD18, 5 ether);
        assertApproxEqRel(epochData.minPriceD18, 5 ether, 0.02 ether);

        assertGe(epochData.maxPriceD18, 45 ether);
        assertApproxEqRel(epochData.maxPriceD18, 45 ether, 0.02 ether);
    }

    /////////////
    // Helpers //
    /////////////
    function _initializeVault(
        address[] memory feeCollectors
    )
        internal
        returns (
            IFoil foilContract,
            IVault vaultContract,
            IMintableToken collateralAssetContract,
            address ownerUser
        )
    {
        ownerUser = createUser("Owner", 10_000_000 ether);
        foilContract = IFoil(vm.getAddress("Foil"));
        vaultContract = IVault(vm.getAddress("Vault"));
        collateralAssetContract = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );

        vm.startPrank(0x70997970C51812dc3A010C7d01b50e0d17dc79C8);
        // Initialize Market (by owner, links fail market with vault)
        foilContract.initializeMarket(
            address(vaultContract),
            address(collateralAssetContract),
            feeCollectors,
            address(vaultContract),
            IFoilStructs.MarketParams({
                feeRate: 10000,
                assertionLiveness: 21600,
                bondCurrency: vm.getAddress("BondCurrency.Token"),
                bondAmount: BOND_AMOUNT,
                claimStatement: "wstGwei/gas",
                uniswapPositionManager: vm.getAddress(
                    "Uniswap.NonfungiblePositionManager"
                ),
                uniswapSwapRouter: vm.getAddress("Uniswap.SwapRouter"),
                uniswapQuoter: vm.getAddress("Uniswap.QuoterV2"),
                optimisticOracleV3: vm.getAddress("UMA.OptimisticOracleV3")
            })
        );
        vm.stopPrank();
    }

    function initializeFirstEpoch(
        uint160 _initialSqrtPriceX96,
        uint256 _initialStartTime
    ) internal {
        vm.startPrank(0x70997970C51812dc3A010C7d01b50e0d17dc79C8);

        // Initialize Epoch (by owner, kicks the ball with the first epoch)
        vault.initializeFirstEpoch(_initialStartTime, _initialSqrtPriceX96);

        vm.stopPrank();
    }

    function settleEpochFromVault(
        uint256 epochId,
        uint160 price,
        address submitter
    ) internal {
        IMintableToken bondCurrency = IMintableToken(
            vm.getAddress("BondCurrency.Token")
        );
        bondCurrency.mint(BOND_AMOUNT * 2, submitter);
        vm.startPrank(submitter);

        bondCurrency.approve(address(vault), BOND_AMOUNT);
        bytes32 assertionId = vault.submitMarketSettlementPrice(epochId, price);
        vm.stopPrank();

        address optimisticOracleV3 = vm.getAddress("UMA.OptimisticOracleV3");
        vm.startPrank(optimisticOracleV3);
        foil.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();
    }
}
