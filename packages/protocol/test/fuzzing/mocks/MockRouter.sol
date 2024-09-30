// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

contract MockRouter {
    event AddedFunctionAndImplementation(
        bytes4 selector,
        address implementation
    );

    error UnknownSelector(bytes4 sel);

    // selector => implementation address
    mapping(bytes4 => address) implementations;

    function addFunctionAndImplementation(
        bytes4 selector,
        address implementation
    ) external {
        implementations[selector] = implementation;
        emit AddedFunctionAndImplementation(selector, implementation);
        if (implementation == address(0)) {
            revert();
        }
    }

    fallback() external payable {
        // Lookup table: Function selector => implementation contract
        bytes4 selector = msg.sig;
        address implementation = implementations[selector];

        if (implementation == address(0)) {
            revert UnknownSelector(selector);
        }

        // Delegatecall to the implementation contract
        assembly {
            calldatacopy(0, 0, calldatasize())

            let result := delegatecall(
                gas(),
                implementation,
                0,
                calldatasize(),
                0,
                0
            )
            returndatacopy(0, 0, returndatasize())

            switch result
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }
}
