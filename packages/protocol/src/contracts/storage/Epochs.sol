// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "./Epoch.sol";

import "forge-std/console2.sol";

library Epochs {
    struct Data {
        uint256[] epochIds; // use startTime as id
        mapping(uint256 => Epoch.Data) epochs;
        uint256 latestStartTime;
    }

    function load() internal pure returns (Epochs.Data storage epochs) {
        bytes32 s = keccak256(abi.encode("foil.gas.epochs"));

        assembly {
            epochs.slot := s
        }
    }

    function getLatestEpoch() internal view returns (Epoch.Data storage epoch) {
        Data storage self = load();
        return self.epochs[self.latestStartTime];
    }
}
