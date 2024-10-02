// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "./Properties_CONF.sol";
import "./Properties_LIQ.sol";
import "./Properties_SET.sol";
import "./Properties_TRD.sol";
import "./Properties_UMA.sol";

abstract contract Properties is
    Properties_CONF,
    Properties_LIQ,
    Properties_SET,
    Properties_TRD,
    Properties_UMA
{
    function invariant_GLOBAL_02(bytes memory returnData) internal {
        console.logBytes(returnData);
        if (returnData.length < 4) {} else if (returnData.length >= 4) {
            // Extract error selector
            bytes4 errorSelector;
            assembly {
                errorSelector := mload(add(returnData, 32))
            }
            if (errorSelector == bytes4(keccak256("Error(string)"))) {
                string memory errorMessage;
                assembly {
                    errorMessage := add(returnData, 68) // 4 bytes for selector + 32 bytes for string offset + 32 bytes for string length
                }
                if (
                    keccak256(bytes(errorMessage)) ==
                    keccak256(bytes("ERC20: transfer amount exceeds balance"))
                ) {
                    fl.t(false, GLOBAL_02);
                }
            }
        }
    }

    function invariant_GLOBAL_03() internal {
        fl.eq(states[0].secondsInsideLower, 0, GLOBAL_03);
        fl.eq(states[1].secondsInsideLower, 0, GLOBAL_03);

        fl.eq(states[0].secondsInsideUpper, 0, GLOBAL_03);
        fl.eq(states[1].secondsInsideUpper, 0, GLOBAL_03);
    }

    function invariant_GLOBAL_04() internal {
        fl.eq(states[0].sumVEth, states[0].sumVEthMax, GLOBAL_04);
        fl.eq(states[1].sumVEth, states[1].sumVEthMax, GLOBAL_04);

        fl.eq(states[0].sumVGas, states[0].sumVEthMax, GLOBAL_05);
        fl.eq(states[1].sumVGas, states[1].sumVEthMax, GLOBAL_05);
    }
}
