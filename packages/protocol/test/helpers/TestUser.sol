// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IMintableToken} from "../../src/contracts/external/IMintableToken.sol";

contract TestUser is Test {
    using Cannon for Vm;

    function createUser(
        string memory name,
        uint256 amount
    ) public returns (address) {
        address user = makeAddr(name);
        IMintableToken asset = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );

        asset.mint(amount, user);

        vm.prank(user);
        asset.approve(vm.getAddress("Foil"), amount);

        return user;
    }
}
