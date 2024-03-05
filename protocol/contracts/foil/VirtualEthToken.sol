// contracts/GasWeiToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract VirtualEthToken is ERC20Pausable, Ownable {
    constructor(
        address _owner,
        string memory epochId
    )
        ERC20(
            string.concat("virtual ETH Token - ", epochId),
            string.concat("vETH", epochId)
        )
        Ownable(_owner)
    {}

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
