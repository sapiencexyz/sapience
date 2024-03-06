// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import "./Position.sol";
import "../foil/FoilNFT.sol";

library Account {
    struct Data {
        uint256 id;
        uint256 credit;
        uint256 freeGweiAmount;
        uint256 freeGasAmount;
        mapping(uint256 => uint256) epochPosition; // position id by epoch id
        mapping(uint256 => uint256) openPositionIndex; // all currently open positions of the account
        mapping(uint256 => uint256) positionIndex; // all (historical and currently open) positions of the account
        Position.Data[] positions; // position data
    }

    /**
     * @notice Loads an account from storage
     * @param accountId The ID of the account to load
     */
    function load(
        uint256 accountId
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
        uint256 accountId
    ) internal view returns (Data storage account) {
        account = load(accountId);

        if (accountId == 0 || account.id == 0) {
            revert Errors.InvalidId(accountId);
        }
    }

    function isAuthorized(
        Data storage self,
        FoilNFT foilNFT,
        address sender
    ) internal view {
        address accountOwner = foilNFT.ownerOf(self.id);
        if (accountOwner == address(0)) {
            revert Errors.InvalidId(self.id);
        }

        if (
            accountOwner != sender &&
            foilNFT.getApproved(self.id) != sender &&
            !foilNFT.isApprovedForAll(accountOwner, sender)
        ) {
            revert Errors.NotAccountOwnerOrAuthorized(self.id, sender);
        }
    }

    function deposit(Data storage self, uint256 amount) internal {
        self.credit += amount;
    }

    function withdraw(Data storage self, uint256 amount) internal {
        if (self.credit < amount) {
            revert Errors.NotEnoughCredit(amount, self.credit);
        }

        // TODO check locked credit and revert accordingly
        self.credit -= amount;
    }
}
