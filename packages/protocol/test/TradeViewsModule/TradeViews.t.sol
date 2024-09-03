// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../../src/contracts/interfaces/IFoil.sol";
import {TestTrade} from "../helpers/TestTrade.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {DecimalPrice} from "../../src/contracts/libraries/DecimalPrice.sol";
import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";
import {SafeCastI256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {Errors} from "../../src/contracts/storage/Errors.sol";
import {Position} from "../../src/contracts/storage/Position.sol";

import "forge-std/console2.sol";

contract TradeViews_Only is TestTrade {
    using Cannon for Vm;
    using DecimalMath for uint256;
    using SafeCastI256 for int256;

    IFoil foil;

    address lp1;
    address trader1;
    uint256 epochId;
    address pool;
    uint256 feeRate;
    uint256 minPriceD18;
    uint256 maxPriceD18;
    int24 EPOCH_LOWER_TICK = 16000; //5 (4.952636224061651)
    int24 EPOCH_UPPER_TICK = 29800; //20 (19.68488357413147)
    int24 LP_LOWER_TICK = 23000; // (9.973035566235849)
    int24 LP_UPPER_TICK = 23200; // (10.174494074987374)
    uint256 COLLATERAL_FOR_ORDERS = 10 ether;
    uint160 INITIAL_PRICE_SQRT = 250541448375047931186413801569; // 10 (9999999999999999999)

    function setUp() public {
        (foil, ) = createEpoch(
            EPOCH_LOWER_TICK,
            EPOCH_UPPER_TICK,
            INITIAL_PRICE_SQRT
        ); // 1.709 to 17.09 (1.6819839204636384 to 16.774485460620674)

        lp1 = TestUser.createUser("LP1", 10_000_000 ether);
        trader1 = TestUser.createUser("Trader1", 10_000_000 ether);

        (epochId, , , pool, , , minPriceD18, maxPriceD18, , , ) = foil
            .getLatestEpoch();

        IUniswapV3Pool uniCastedPool = IUniswapV3Pool(pool);
        feeRate = uint256(uniCastedPool.fee()) * 1e12;

        vm.startPrank(lp1);
        addLiquidity(
            foil,
            pool,
            epochId,
            COLLATERAL_FOR_ORDERS * 100_000,
            LP_LOWER_TICK,
            LP_UPPER_TICK
        ); // enough to keep price stable (no slippage)
        vm.stopPrank();
    }

    function test_getReferencePrice() public view {
        uint256 price = foil.getReferencePrice(epochId);
        assertEq(price, 9999999999999999999);
    }

    function test_longBackAndForth() public view {
        uint256 collateral = 10 ether;
        uint256 price = foil.getReferencePrice(epochId);

        uint256 expectedSize = collateral.divDecimal(
            maxPriceD18.mulDecimal(1e18 + feeRate) -
                price.mulDecimal(1e18 - feeRate)
        );

        uint256 modPositionSize = foil.getLongSizeForCollateral(
            epochId,
            collateral
        );
        assertEq(modPositionSize, expectedSize);

        uint256 requiredCollateral = foil.getCollateralForLongSize(
            epochId,
            modPositionSize
        );
        assertApproxEqAbsDecimal(requiredCollateral, collateral, 100, 18);
    }

    function test_shortBackAndForth() public view {
        uint256 collateral = 10 ether;
        uint256 price = foil.getReferencePrice(epochId);

        uint256 expectedSize = collateral.divDecimal(
            price.mulDecimal(1e18 + feeRate) -
                minPriceD18.mulDecimal(1e18 - feeRate)
        );

        uint256 modPositionSize = foil.getShortSizeForCollateral(
            epochId,
            collateral
        );
        assertEq(modPositionSize, expectedSize);

        uint256 requiredCollateral = foil.getCollateralForShortSize(
            epochId,
            modPositionSize
        );
        assertApproxEqAbsDecimal(requiredCollateral, collateral, 100, 18);
    }

    function test_fuzz_getLongSizeForCollateral(
        uint128 collateralLimited
    ) public view {
        uint256 collateral = collateralLimited;
        // S = C / ( Ph(1+fee) - Pe(1-fee))
        uint256 onePlusFee = 1e18 + feeRate;
        uint256 oneMinusFee = 1e18 - feeRate;
        uint256 price = foil.getReferencePrice(epochId);

        uint256 expectedSize = collateral.divDecimal(
            maxPriceD18.mulDecimal(onePlusFee) - price.mulDecimal(oneMinusFee)
        );
        uint256 modPositionSize = foil.getLongSizeForCollateral(
            epochId,
            collateral
        );

        assertEq(modPositionSize, expectedSize);
    }

    function test_fuzz_getShortSizeForCollateral(
        uint128 collateralLimited
    ) public view {
        uint256 collateral = collateralLimited;
        // S = C / ( Pe(1+fee) - Pl(1-fee))
        uint256 onePlusFee = 1e18 + feeRate;
        uint256 oneMinusFee = 1e18 - feeRate;
        uint256 price = foil.getReferencePrice(epochId);

        uint256 expectedSize = collateral.divDecimal(
            price.mulDecimal(onePlusFee) - minPriceD18.mulDecimal(oneMinusFee)
        );

        uint256 modPositionSize = foil.getShortSizeForCollateral(
            epochId,
            collateral
        );

        assertEq(modPositionSize, expectedSize);
    }

    function test_fuzz_getLongDeltaForCollateral_fromLong(
        uint128 _initialPositionCollateral,
        uint128 _afterCollateral // bool _initialIsLong
    ) public {
        vm.assume(_initialPositionCollateral < 10 ether);
        vm.assume(_initialPositionCollateral > 10000);

        uint256 initialPositionCollateral = _initialPositionCollateral;
        uint256 afterCollateral = _afterCollateral;
        bool initialIsLong = true;

        vm.startPrank(trader1);

        uint256 positionId = initialTrade(
            initialPositionCollateral,
            initialIsLong
        );

        (
            uint256 tokensValueAtMaxPrice,
            uint256 debtValueAtMaxPrice
        ) = getPositionBalancesAtPrice(positionId, maxPriceD18);

        int256 balanceAtMaxPrice = int256(tokensValueAtMaxPrice) -
            int256(debtValueAtMaxPrice);

        int256 adjustedCollateralAtMaxPrice = int256(afterCollateral) +
            balanceAtMaxPrice;

        uint256 onePlusFee = 1e18 + feeRate;
        uint256 oneMinusFee = 1e18 - feeRate;
        uint256 price = foil.getReferencePrice(epochId);

        uint256 expectedSize = uint256(adjustedCollateralAtMaxPrice).divDecimal(
            maxPriceD18.mulDecimal(onePlusFee) - price.mulDecimal(oneMinusFee)
        );

        uint256 modPositionSize = foil.getLongDeltaForCollateral(
            positionId,
            afterCollateral
        );
        vm.stopPrank();

        assertEq(modPositionSize, expectedSize);
    }

    function test_getShortDeltaForCollateral_Onlyy(
        uint128 _initialPositionCollateral,
        uint128 _afterCollateral // bool _initialIsLong
    ) public {
        vm.assume(_initialPositionCollateral < 10 ether);
        vm.assume(_initialPositionCollateral > 10000);

        // TODO
        uint256 initialPositionCollateral = _initialPositionCollateral;
        uint256 afterCollateral = _afterCollateral;
        bool initialIsLong = true;

        vm.startPrank(trader1);

        uint256 positionId = initialTrade(
            initialPositionCollateral,
            initialIsLong
        );

        (
            uint256 debtValueAtMinPrice,
            uint256 tokensValueAtMinPrice
        ) = getPositionBalancesAtPrice(positionId, minPriceD18);

        int256 balanceAtMinPrice = int256(tokensValueAtMinPrice) -
            int256(debtValueAtMinPrice);

        int256 adjustedCollateralAtMinPrice = int256(afterCollateral) +
            balanceAtMinPrice;

        uint256 onePlusFee = 1e18 + feeRate;
        uint256 oneMinusFee = 1e18 - feeRate;
        uint256 price = foil.getReferencePrice(epochId);

        uint256 expectedSize = uint256(adjustedCollateralAtMinPrice).divDecimal(
            price.mulDecimal(onePlusFee) - minPriceD18.mulDecimal(oneMinusFee)
        );

        uint256 modPositionSize = foil.getShortDeltaForCollateral(
            positionId,
            afterCollateral
        );
        vm.stopPrank();

        assertEq(modPositionSize, expectedSize);
    }

    function test_fuzz_getCollateralForLongSize(
        uint128 sizeLimited
    ) public view {
        uint256 modSize = sizeLimited;
        // C = S * ( Pe(1+fee) - Pl(1-fee))

        uint256 onePlusFee = 1e18 + feeRate;
        uint256 oneMinusFee = 1e18 - feeRate;
        uint256 price = foil.getReferencePrice(epochId);

        uint256 expectedCollateral = modSize.mulDecimal(
            maxPriceD18.mulDecimal(onePlusFee) - price.mulDecimal(oneMinusFee)
        );

        uint256 requiredCollateral = foil.getCollateralForLongSize(
            epochId,
            modSize
        );

        assertEq(requiredCollateral, expectedCollateral);
    }

    function test_fuzz_getCollateralForShortSize(
        uint128 sizeLimited
    ) public view {
        uint256 modSize = sizeLimited;
        // C = S * ( Ph(1+fee) - Pe(1-fee))

        uint256 onePlusFee = 1e18 + feeRate;
        uint256 oneMinusFee = 1e18 - feeRate;
        uint256 price = foil.getReferencePrice(epochId);

        uint256 expectedCollateral = modSize.mulDecimal(
            price.mulDecimal(onePlusFee) - minPriceD18.mulDecimal(oneMinusFee)
        );

        uint256 requiredCollateral = foil.getCollateralForShortSize(
            epochId,
            modSize
        );

        assertEq(requiredCollateral, expectedCollateral);
    }

    function initialTrade(
        uint256 collateral,
        bool isLong
    ) internal returns (uint256) {
        console2.log("collateral: ", collateral);
        console2.log("isLong: ", isLong);
        uint256 positionSize = isLong
            ? foil.getLongSizeForCollateral(epochId, collateral)
            : foil.getShortSizeForCollateral(epochId, collateral);

        console2.log("positionSize: ", positionSize);

        uint256 positionId = foil.createTraderPosition(
            epochId,
            collateral,
            isLong ? int256(positionSize) : int256(positionSize) * -1,
            0
        );

        return positionId;
    }

    function getPositionBalancesAtPrice(
        uint256 positionId,
        uint256 price
    ) public returns (uint256 tokensValue, uint256 debtValue) {
        Position.Data memory position = foil.getPosition(positionId);
        uint256 onePlusFee = 1e18 + feeRate;
        uint256 oneMinusFee = 1e18 - feeRate;

        tokensValue =
            position.vEthAmount +
            position.vGasAmount.mulDecimal(price.mulDecimal(oneMinusFee));
        debtValue =
            position.borrowedVEth +
            position.borrowedVGas.mulDecimal(price.mulDecimal(onePlusFee));
    }
}
