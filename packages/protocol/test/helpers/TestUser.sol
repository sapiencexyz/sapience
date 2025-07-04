// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";

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

        vm.startPrank(user); // notice, prank will work only for a single call, getting the address inside approve is that call, that's why we need to use start/stop prank here
        asset.approve(vm.getAddress("Sapience"), type(uint256).max); // Max approval to avoid issues
        vm.stopPrank();

        return user;
    }
}
