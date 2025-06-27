// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import {Position} from "../../src/market/storage/Position.sol";
import {ISapienceStructs} from "../../src/market/interfaces/ISapienceStructs.sol";
import {DecimalMath} from "../../src/market/libraries/DecimalMath.sol";

contract PositionSettleZeroTest is Test {
    using Position for Position.Data;
    using DecimalMath for uint256;

    function test_PositionSettle_LongWithZeroPrice() public {
        // Create a long position
        Position.Data storage position = Position.load(1);
        position.id = 1;
        position.kind = ISapienceStructs.PositionKind.Trade;
        position.marketId = 1;
        position.depositedCollateralAmount = 100e18; // 100 collateral
        position.vBaseAmount = 200e18; // Own 200 base tokens
        position.vQuoteAmount = 0;
        position.borrowedVBase = 0;
        position.borrowedVQuote = 100e18; // Borrowed 100 quote to buy base
        
        // Settle at price = 0
        uint256 withdrawable = position.settle(0);
        
        // Long position should get 0 back
        // vBase * 0 = 0, minus borrowed quote = -100
        // deposited 100 - 100 = 0
        assertEq(withdrawable, 0, "Long position should get 0 when price is 0");
        assertTrue(position.isSettled, "Position should be marked as settled");
    }

    function test_PositionSettle_ShortWithZeroPrice() public {
        // Create a short position
        Position.Data storage position = Position.load(2);
        position.id = 2;
        position.kind = ISapienceStructs.PositionKind.Trade;
        position.marketId = 1;
        position.depositedCollateralAmount = 500e18; // 500 collateral
        position.vBaseAmount = 0;
        position.vQuoteAmount = 100e18; // Got 100 quote from selling
        position.borrowedVBase = 100e18; // Borrowed 100 base to sell
        position.borrowedVQuote = 0;
        
        // Settle at price = 0
        uint256 withdrawable = position.settle(0);
        
        // Short position should profit
        // borrowedVBase * 0 = 0 (no cost to buy back)
        // Keep the 100 quote from selling
        // deposited 500 + 100 = 600
        assertEq(withdrawable, 600e18, "Short should profit when price goes to 0");
        assertTrue(position.isSettled, "Position should be marked as settled");
    }

    function test_PositionSettle_LPWithZeroPrice() public {
        // Create an LP position
        Position.Data storage position = Position.load(3);
        position.id = 3;
        position.kind = ISapienceStructs.PositionKind.Liquidity;
        position.marketId = 1;
        position.depositedCollateralAmount = 1000e18;
        position.vBaseAmount = 50e18; // From fees
        position.vQuoteAmount = 200e18; // From fees
        position.borrowedVBase = 100e18;
        position.borrowedVQuote = 500e18;
        
        // Settle at price = 0
        uint256 withdrawable = position.settle(0);
        
        // LP calculation:
        // vBase * 0 = 0
        // borrowedVBase * 0 = 0
        // Net quote: 200 - 500 = -300
        // Collateral: 1000 - 300 = 700
        assertEq(withdrawable, 700e18, "LP should get remaining collateral after losses");
        assertTrue(position.isSettled, "Position should be marked as settled");
    }

    function test_PositionSettle_NoRoundingIssuesWithZero() public {
        // Test that multiplication by 0 doesn't cause any rounding issues
        Position.Data storage position = Position.load(4);
        position.id = 4;
        position.kind = ISapienceStructs.PositionKind.Trade;
        position.marketId = 1;
        position.depositedCollateralAmount = 123456789012345678; // Odd amount
        position.vBaseAmount = 999999999999999999; // Almost 1e18
        position.vQuoteAmount = 0;
        position.borrowedVBase = 0;
        position.borrowedVQuote = 123456789012345678; // Same as collateral
        
        // Settle at price = 0
        uint256 withdrawable = position.settle(0);
        
        // vBase * 0 = 0, borrowed = collateral, so should get 0
        assertEq(withdrawable, 0, "Should get exactly 0, no rounding errors");
    }
}