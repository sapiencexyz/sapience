// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import {TickMath} from "../external/univ3/TickMath.sol";
import "./Position.sol";
import "./Market.sol";
import "../external/univ3/LiquidityAmounts.sol";
import "../libraries/Quote.sol";
import "forge-std/console2.sol";

library FAccount {
    struct Data {
        uint256 tokenId; // nft id
        uint256 collateralAmount; // configured collateral
        uint256 borrowedGwei; // Token A (rename?)
        uint256 borrowedGas; // Token B
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

    function createValid(
        uint256 accountId
    ) internal returns (Data storage account) {
        account = load(accountId);

        if (account.tokenId != 0) {
            revert Errors.AccountAlreadyCreated();
        }

        account.tokenId = accountId;
        return account;
    }

    function updateLoan(
        Data storage self,
        uint256 tokenId,
        uint256 collateralAmount,
        uint256 amount0,
        uint256 amount1
    ) internal {
        self.collateralAmount = collateralAmount;
        self.borrowedGas = amount0;
        self.borrowedGwei = amount1;
        self.tokenId = tokenId;
    }

    /**
     * @notice Loads a position from storage and checks that it is valid
     * @param accountId The ID of the account to load
     */
    function loadValid(
        uint256 accountId
    ) internal view returns (Data storage account) {
        account = load(accountId);

        if (accountId == 0 || account.tokenId == 0) {
            revert Errors.InvalidAccountId(accountId);
        }
    }

    function getAddress(Data storage self) internal view returns (address) {
        return address(uint160(self.tokenId));
    }

    function updateCollateral(
        Data storage self,
        IERC20 collateralAsset,
        uint256 amount
    ) internal {
        if (amount > self.collateralAmount) {
            collateralAsset.transferFrom(
                msg.sender,
                address(this),
                amount - self.collateralAmount
            );
        } else {
            collateralAsset.transfer(
                msg.sender,
                self.collateralAmount - amount
            );
        }

        self.collateralAmount = amount;
    }
}
