//SPDX-License-Identifier: MIT
pragma solidity >=0.8.11 <0.9.0;

interface IERC165Module {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}
