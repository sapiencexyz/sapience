// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "./IResolutionCallback.sol";

interface IVault is IERC165, IResolutionCallback {}
