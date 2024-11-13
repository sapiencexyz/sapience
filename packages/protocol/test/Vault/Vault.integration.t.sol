// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IFoil} from "../../src/market/interfaces/IFoil.sol";
import {IVault} from "../../src/vault/interfaces/IVault.sol";
import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
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
import {MigrationMathUtils} from "../../src/market/external/univ3/MigrationMathUtils.sol";
import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";

contract VaultIntegrationTest is TestVault {
    using Cannon for Vm;
    using DecimalMath for uint256;
    using DecimalMath for int256;
    using SafeCastI256 for int256;
    using SafeCastU256 for uint256;

    uint256 public constant INITIAL_MINT = 1000000 ether;
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

    address lp1;
    address lp2;
    address lp3;
    address lp4;
    address lp5;

    function setUp() public {
        address[] memory feeCollectors = new address[](0);

        lp1 = TestUser.createUser("LP1", INITIAL_LP_BALANCE);
        lp2 = TestUser.createUser("LP2", INITIAL_LP_BALANCE);
        lp3 = TestUser.createUser("LP3", INITIAL_LP_BALANCE);
        lp4 = TestUser.createUser("LP4", INITIAL_LP_BALANCE);
        lp5 = TestUser.createUser("LP5", INITIAL_LP_BALANCE);

        (foil, vault, collateralAsset) = initializeVault(
            feeCollectors,
            BOND_AMOUNT,
            MIN_TRADE_SIZE
        );

        initialStartTime = block.timestamp + 60;
    }
}
