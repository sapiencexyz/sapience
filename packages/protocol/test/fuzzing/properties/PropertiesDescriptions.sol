// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

abstract contract PropertiesDescriptions {
    string constant GLOBAL_01 =
        "The price of vGAS should always be in range of the configured min/max ticks.";
    string constant GLOBAL_02 =
        "The system should never revert with a `InsufficientBalance` error from the collateral token.";
    string constant GLOBAL_03 =
        "There should never be any liquidity outside of the [min, max] range of an epoch.";
    string constant GLOBAL_04 =
        "The amt of vETH in the system, position manager & swap router should equal the max supply.";
    string constant GLOBAL_05 =
        "The amt of vGAS in the system, position manager & swap router should equal the max supply.";

    string constant TRADE_01 =
        "The debt of a trade position should never be > the collateral of the position.";
    string constant TRADE_02 =
        "Long positions have their debt in vETH and own vGAS.";
    string constant TRADE_03 =
        "Short positions have their debt in vGAS and own vETH.";

    string constant LIQUID_01 =
        "The debt of a liquidity position should never be > the collateral of the position.";
    string constant LIQUID_02 =
        "A open LP position should not own any vETH or vGAS.";
    string constant LIQUID_03 =
        "After all LP positions have been closed, for the remaining trader positions: net shorts == net longs.";

    string constant SETTLE_01 =
        "It should always be possible to close all trade positions after the epoch is settled";
}
