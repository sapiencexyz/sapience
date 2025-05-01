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
import {MarketGroupFactory} from "../../src/marketGroupFactory/MarketGroupFactory.sol";
import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";

contract MarketGroupFactoryTest is Test {
    using Cannon for Vm;
    using DecimalMath for uint256;
    using DecimalMath for int256;
    using SafeCastI256 for int256;
    using SafeCastU256 for uint256;

    address lp1;
    address owner;
    IFoil foil;
    IVault vault;
    MarketGroupFactory marketGroupFactory;
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
        marketGroupFactory = MarketGroupFactory(
            vm.getAddress("MarketGroupFactory")
        );
        collateralAsset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );
        owner = makeAddr("owner");
    }

    function test_revertsWhenCloneNonOwner() public {
        vm.expectRevert("Only authorized owner can call this function");
        marketGroupFactory.cloneAndInitializeMarketGroup(
            owner,
            address(collateralAsset),
            new address[](0),
            address(0),
            0,
            IFoilStructs.MarketParams({
                feeRate: 0,
                assertionLiveness: 0,
                bondAmount: 0,
                bondCurrency: address(0),
                uniswapPositionManager: address(0),
                uniswapSwapRouter: address(0),
                uniswapQuoter: address(0),
                optimisticOracleV3: address(0)
            }),
            0
        );
    }

    //                 uint24 feeRate;
    // uint64 assertionLiveness;
    // uint256 bondAmount;
    // address bondCurrency;
    // address uniswapPositionManager;
    // address uniswapSwapRouter;
    // address uniswapQuoter;
    // address optimisticOracleV3;
    function test_revertsWhenInitializeFirstEpochAgain() public {}
}
