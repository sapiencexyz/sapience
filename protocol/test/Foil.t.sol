// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";

import {Foil} from "../src/contracts/Foil.sol";

contract FoilTest is Test {
    Foil foil;

    function setUp() public {
        // deploy Foil contract
        foil = new Foil(
            1720051200, // endtime
            0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1, // uniswap
            0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266, // resolver
            0x101b9758583F47C63236D831db79247B6eEAdb57, // mintable asset
            5 ether, // base asset min price
            200 ether, // base asset max price
            10000 // fee rate
        );

        foil.createAccount(1);
    }

    function test_addLiquidity() public {
        foil.addLiquidity(1, 10 ether, 10 ether, 10 ether, -442020, -433910);
    }
}
