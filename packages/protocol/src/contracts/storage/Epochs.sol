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
}
