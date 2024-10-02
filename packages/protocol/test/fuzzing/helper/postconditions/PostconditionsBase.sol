// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "../../properties/Properties.sol";

abstract contract PostconditionsBase is Properties {
    function onSuccessInvariantsGeneral(
        bytes memory returnData,
        address actor
    ) internal {
        invariant_GLOBAL_03();
        invariant_GLOBAL_04();
    }

    function onFailInvariantsGeneral(bytes memory returnData) internal {}
}
