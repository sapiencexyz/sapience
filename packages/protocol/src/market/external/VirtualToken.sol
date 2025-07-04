// contracts/VirtualToken.sol
// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract VirtualToken is ERC20, Ownable {
    constructor(address _owner, string memory name, string memory symbol) ERC20(name, symbol) Ownable(_owner) {}

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}
