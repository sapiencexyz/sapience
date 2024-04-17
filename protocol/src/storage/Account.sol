// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import "./Position.sol";
import "../foil/FoilNFT.sol";

library Account {
    struct Data {
        uint160 id;
    }

    /**
     * @notice Loads an account from storage
     * @param accountId The ID of the account to load
     */
    function load(
        uint160 accountId
    ) internal pure returns (Data storage account) {
        bytes32 s = keccak256(abi.encode("foil.gas.account", accountId));

        assembly {
            account.slot := s
        }
    }

    function createValid(
        uint256 accountId
    ) internal returns (Data storage account) {
        account = load(accountId);

        if (account.id != 0) {
            revert Errors.AccountAlreadyCreated();
        }

        account.id = accountId;
        return account;
    }

    /**
     * @notice Loads a position from storage and checks that it is valid
     * @param accountId The ID of the account to load
     */
    function loadValid(
        uint256 accountId
    ) internal view returns (Data storage account) {
        account = load(accountId);

        if (accountId == 0 || account.id == 0) {
            revert Errors.InvalidId(accountId);
        }
    }

    function getAddress(Data storage self) internal view returns (address) {
        return address(self.id);
    }

    // function isAuthorized(
    //     Data storage self,
    //     FoilNFT foilNFT,
    //     address sender
    // ) internal view {
    //     address accountOwner = foilNFT.ownerOf(self.id);
    //     if (accountOwner == address(0)) {
    //         revert Errors.InvalidId(self.id);
    //     }

    //     if (
    //         accountOwner != sender &&
    //         foilNFT.getApproved(self.id) != sender &&
    //         !foilNFT.isApprovedForAll(accountOwner, sender)
    //     ) {
    //         revert Errors.NotAccountOwnerOrAuthorized(self.id, sender);
    //     }
    // }
}
