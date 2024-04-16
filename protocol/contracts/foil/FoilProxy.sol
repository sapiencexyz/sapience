// contracts/FoilProxy.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract FoilProxy {
    // TODO Do it properly.... this is just some code to make it compile
    address private _implementation;
    bool private simulatingUpgrade;
    address private _owner;
    address private _nominatedOwner;
    error Unauthorized(address addr);
    error ZeroAddress();
    error NotAContract(address contr);
    error NotNominated(address addr);
    error NoChange();
    event OwnerNominated(address newOwner);
    event OwnerChanged(address oldOwner, address newOwner);

    constructor(address firstImplementation, address initialOwner) {
        if (firstImplementation == address(0)) {
            revert ZeroAddress();
        }

        if (!isContract(firstImplementation)) {
            revert NotAContract(firstImplementation);
        }

        _implementation = firstImplementation;
        _owner = initialOwner;
    }

    function upgrade(address newImplementation) public {
        if (msg.sender != _owner) {
            revert Unauthorized(msg.sender);
        }

        if (newImplementation == address(0)) {
            revert ZeroAddress();
        }

        if (!isContract(newImplementation)) {
            revert NotAContract(newImplementation);
        }

        _implementation = newImplementation;
    }

    function getImplementation() internal view virtual returns (address) {
        return _implementation;
    }

    function acceptOwnership() public {
        address currentNominatedOwner = _nominatedOwner;
        if (msg.sender != currentNominatedOwner) {
            revert NotNominated(msg.sender);
        }

        emit OwnerChanged(_owner, currentNominatedOwner);
        _owner = currentNominatedOwner;

        _nominatedOwner = address(0);
    }

    function nominateNewOwner(address newNominatedOwner) public onlyOwner {
        if (newNominatedOwner == address(0)) {
            revert ZeroAddress();
        }

        if (newNominatedOwner == _nominatedOwner) {
            revert NoChange();
        }

        _nominatedOwner = newNominatedOwner;
        emit OwnerNominated(newNominatedOwner);
    }

    function renounceNomination() external {
        if (_nominatedOwner != msg.sender) {
            revert NotNominated(msg.sender);
        }

        _nominatedOwner = address(0);
    }

    function owner() external view returns (address) {
        return _owner;
    }

    function nominatedOwner() external view returns (address) {
        return _nominatedOwner;
    }

    /**
     * @dev Reverts if the caller is not the owner.
     */
    modifier onlyOwner() {
        if (msg.sender != _owner) {
            revert Unauthorized(msg.sender);
        }

        _;
    }

    fallback() external payable {
        _forward();
    }

    receive() external payable {
        _forward();
    }

    function _forward() internal {
        address implementation = _implementation;

        // solhint-disable-next-line no-inline-assembly
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

    function isContract(address account) internal view returns (bool) {
        uint256 size;

        assembly {
            size := extcodesize(account)
        }

        return size > 0;
    }
}
