// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

abstract contract FuzzConstants {
    bool internal constant DEBUG = false;

    address internal constant USER1 = address(0x10000);
    address internal constant USER2 = address(0x20000);
    address internal constant USER3 = address(0x30000);

    address[] internal USERS = [USER1, USER2, USER3];
    uint128[] internal ACCOUNTS = [1, 2, 3];

    uint internal constant INITIAL_BALANCE = 10_000 ether;

    uint internal constant INITIAL_MIN_TICK = 16000;
    uint internal constant INITIAL_MAX_TICK = 29800;
}
