// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import "./Epoch.sol";
import "./Account.sol";
import "./Debt.sol";
import {SafeCastU256} from "../../synthetix/utils/SafeCast.sol";

library Position {
    using SafeCastU256 for uint256;

    struct Data {
        uint256 accountId;
        uint256 vEthAmount;
        uint256 vGasAmount;
        int256 currentTokenAmount;
    }

    function load(
        uint256 accountId
    ) internal pure returns (Data storage position) {
        bytes32 s = keccak256(abi.encode("foil.gas.position", accountId));

        assembly {
            position.slot := s
        }
    }

    function loadValid(
        uint256 accountId
    ) internal view returns (Data storage position) {
        Account.loadValid(accountId);
        position = load(accountId);
    }

    function updateBalance(
        Data storage self,
        int256 deltaTokenAmount,
        int256 vEthDeltaAmount,
        int256 vGasDeltaAmount
    ) internal {
        self.currentTokenAmount += deltaTokenAmount;
        self.vEthAmount = uint256(self.vEthAmount.toInt() + vEthDeltaAmount);
        self.vGasAmount = uint256(self.vGasAmount.toInt() + vGasDeltaAmount);
    }
}
