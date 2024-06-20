// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import "./Position.sol";
import "../contracts/FoilNFT.sol";
import "../external/univ3/LiquidityAmounts.sol";

import "forge-std/console2.sol";

library Account {
    struct Data {
        uint256 id;
        uint256 collateralAmount; // configured collateral
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
            revert Errors.InvalidAccountId(accountId);
        }
    }

    function getAddress(Data storage self) internal view returns (address) {
        return address(uint160(self.id));
    }

    function validateProvidedLiquidity(
        uint256 addedAmount0,
        uint128 liquidity,
        int24 lowerTick,
        int24 upperTick
    ) internal {
        uint160 sqrtPriceAX96 = TickMath.getSqrtRatioAtTick(lowerTick);
        uint160 sqrtPriceBX96 = TickMath.getSqrtRatioAtTick(upperTick);

        uint160 sqrtPriceX96 = sqrtPriceBX96; // Price at $10
        (uint256 amount0, uint256 amount1) = LiquidityAmounts
            .getAmountsForLiquidity(
                sqrtPriceX96,
                sqrtPriceAX96,
                sqrtPriceBX96,
                liquidity
            );

        console2.log(amount0, amount1);

        // 1. get average entry price

        uint256 averageEntryPrice = calculateAverageEntryPrice(
            addedAmount0,
            amount1
        );
        console2.log(averageEntryPrice);

        // 2. based on provided collateral, check if there's enough to cover max epoch tick value
    }

    function calculateAverageEntryPrice(
        uint256 amount0,
        uint256 amount1
    ) public pure returns (uint256 averageEntryPrice) {
        if (amount0 == 0) {
            return 0;
        }

        averageEntryPrice = FullMath.mulDiv(amount1, 1e18, amount0);
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
