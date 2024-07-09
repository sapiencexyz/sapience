// contracts/GasWeiToken.sol
// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract VirtualToken is ERC20Pausable, Ownable {
    constructor(
        address _owner,
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) Ownable(_owner) {}

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }
}
