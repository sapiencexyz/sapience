// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IERC20} from "@synthetixio/core-contracts/contracts/interfaces/IERC20.sol";

interface IMintableToken is IERC20 {
    function mint(uint256 amount, address to) external;
}
