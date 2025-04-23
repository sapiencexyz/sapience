// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../src/market/interfaces/IFoil.sol";
import {IFoilStructs} from "../src/market/interfaces/IFoilStructs.sol";
import {IMintableToken} from "../src/market/external/IMintableToken.sol";
import {TickMath} from "../src/market/external/univ3/TickMath.sol";
import {TestEpoch} from "./helpers/TestEpoch.sol";
import {TestUser} from "./helpers/TestUser.sol";
import {DecimalPrice} from "../src/market/libraries/DecimalPrice.sol";

contract CreateEpochTest is TestEpoch {
    using Cannon for Vm;

    IFoil foil;
    IMintableToken bondCurrency;

    uint256 epochId;
    address owner;
    address optimisticOracleV3;
    uint256 endTime;
    uint256 minPriceD18;
    uint256 maxPriceD18;
    IFoilStructs.MarketParams marketParams;
    uint256 constant MIN_TRADE_SIZE = 10_000; // 10,000 vGas

    uint160 minPriceSqrtX96 = 176318465955203702497835220992;
    uint160 maxPriceSqrtX96 = 351516737644262680948788690944;

    uint160 minPriceSqrtX96MinusOne = 157515395125078639904557105152;
    uint160 maxPriceSqrtX96PlusOne = 363781735724983009021857366016;

    uint160 SQRT_PRICE_10Eth = 250541448375047931186413801569;
    uint160 SQRT_PRICE_11Eth = 262770087889115504578498920448;

    uint256 COMPUTED_11EthPrice = 10999999999999999740;
    uint256 COMPUTED_10EthPrice = 9999999999999999999;

    function setUp() public {
        bondCurrency = IMintableToken(vm.getAddress("BondCurrency.Token"));
        optimisticOracleV3 = vm.getAddress("UMA.OptimisticOracleV3");

    }

    function test_create_epoch_with_claim_statement() public {
        uint160 startingSqrtPriceX96 = SQRT_PRICE_10Eth; // 10

        (foil, ) = createEpoch(
            16000,
            29800,
            startingSqrtPriceX96,
            MIN_TRADE_SIZE,
            "other claim statement"
        );

        (, marketParams) = foil.getLatestEpoch();
        assertEq(marketParams.claimStatement, "other claim statement");
    }

    function test_create_epoch_with_empty_claim_statement() public {
        uint160 startingSqrtPriceX96 = SQRT_PRICE_10Eth; // 10

        (foil, ) = createEpoch(
            16000,
            29800,
            startingSqrtPriceX96,
            MIN_TRADE_SIZE,
            ""
        );

        (, marketParams) = foil.getLatestEpoch();
        assertEq(marketParams.claimStatement, "wstGwei/gas");
    }

}
