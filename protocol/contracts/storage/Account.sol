// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import "./Position.sol";

library Account {
    struct Data {
        uint256 id;
        uint256 credit;
        uint256 lockedCredit;
        uint256 freeGweiAmount;
        uint256 freeGasAmount;
        Position.Data[] positions;
    }

    /**
     * @notice Loads an account from storage
     * @param accountId The ID of the account to load
     */
    function load(
        uint128 accountId
    ) internal pure returns (Data storage account) {
        bytes32 s = keccak256(abi.encode("foil.gas.account", accountId));

        assembly {
            account.slot := s
        }
    }

    /**
     * @notice Loads a position from storage and checks that it is valid
     * @param accountId The ID of the account to load
     */
    function loadValid(
        uint128 accountId
    ) internal view returns (Data storage account) {
        account = load(accountId);

        if (accountId == 0 || account.id == 0) {
            revert CommonErrors.InvalidId(accountId);
        }
    }
}
