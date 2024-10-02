// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "./PreconditionsBase.sol";

/* solhint-disable numcast/safe-cast */

abstract contract PreconditionsEpochSettlementModule is PreconditionsBase {
    function settleLiquidityPositionPreconditions(
        uint seed
    ) internal returns (uint) {
        return
            getRandomPositionId(
                currentActor,
                seed,
                true //liquidity
            );
    }

    function settleTradePositionPreconditions(
        uint seed
    ) internal returns (uint) {
        return
            getRandomPositionId(
                currentActor,
                seed,
                false //trade
            );
    }
}
