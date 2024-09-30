// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "./PreconditionsBase.sol";

/* solhint-disable numcast/safe-cast */

abstract contract PreconditionsEpochUMASettlementModule is PreconditionsBase {
    struct SubmitSettlementPriceParams {
        uint256 epochId;
        uint256 settlementPriceD18;
    }

    struct MockDisputeAssertionParams {
        bytes32 assertionId;
        address disputer;
    }
    struct MockSettleAssertionParams {
        bytes32 assertionId;
        bool settlementResolution;
    }
    function submitSettlementPricePreconditions(
        uint settlementPriceD18Seed
    ) internal returns (SubmitSettlementPriceParams memory params) {
        params.epochId = getLatestEpoch();

        (, bytes memory returnData) = _getCurrentPriceCall(params.epochId);

        params.settlementPriceD18 = abi.decode(returnData, (uint)); //this is current decimal price;

        uint256 action = settlementPriceD18Seed % 5; // 5 actions

        if (action == 0) {
            // Increase price
            params.settlementPriceD18 =
                params.settlementPriceD18 *
                ((settlementPriceD18Seed % 5) + 1);
        } else if (action == 1) {
            // Decrease price
            if (settlementPriceD18Seed != 0) {
                params.settlementPriceD18 =
                    params.settlementPriceD18 /
                    ((settlementPriceD18Seed % 5) + 1);
            }
        } else if (action == 2) {
            // Set to a specific value
            params.settlementPriceD18 = settlementPriceD18Seed;
        } else if (action == 3) {
            // Exponential ┗(｀O ´)┛
            params.settlementPriceD18 = params.settlementPriceD18 ** 2;
        } else {
            // Price stays same
        }
    }

    function mockDisputeAssertionPreconditions(
        uint seed
    ) internal returns (MockDisputeAssertionParams memory params) {
        uint epochId = getLatestEpoch();

        params.assertionId = userAssertions[epochId][
            fl.clamp(seed, 0, userAssertions[epochId].length - 1)
        ];

        params.disputer = currentActor;
    }

    function mockSettleAssertionPreconditions(
        uint seed
    ) internal returns (MockSettleAssertionParams memory params) {
        uint epochId = getLatestEpoch();

        params.assertionId = userAssertions[epochId][
            fl.clamp(seed, 0, userAssertions[epochId].length - 1)
        ];

        params.settlementResolution = seed % 2 == 0;
    }
}
