// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import {Epoch} from "./Epoch.sol";

library Trade {
    using Epoch for Epoch.Data;

    function getReferencePrice(
        uint256 epochId
    ) internal view returns (uint256 price18Digits) {
        Epoch.Data storage epoch = Epoch.load(epochId);

        if (epoch.settled) {
            return epoch.settlementPriceD18;
        } else {
            return epoch.getCurrentPoolPrice();
        }
    }
}
