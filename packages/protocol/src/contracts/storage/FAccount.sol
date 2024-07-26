// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import "./Position.sol";
import "./Epoch.sol";
import "../external/univ3/LiquidityAmounts.sol";
import "forge-std/console2.sol";

library FAccount {
    using Epoch for Epoch.Data;

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
        self.borrowedGwei = amount0;
        self.borrowedGas = amount1;
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

    /*
    function updateLoan(
        Data storage self,
        uint256 collateralAmount,
        uint256 amount0,
        uint256 amount1
    ) internal {
        self.collateralAmount += collateralAmount;
        self.borrowedGwei += amount0;
        self.borrowedGas += amount1;
    }
*/
    function validateProvidedLiquidity(
        Data storage self,
        Epoch.Data storage epoch,
        uint128 liquidity,
        int24 lowerTick,
        int24 upperTick
    ) internal {
        // checks that if price were at its min or max, the account has provided enough collateral
        // to cover the loan amount
        validateLoanAmount(
            self,
            epoch,
            liquidity,
            epoch.marketParams.baseAssetMinPriceTick,
            lowerTick,
            upperTick
        );
        validateLoanAmount(
            self,
            epoch,
            liquidity,
            epoch.marketParams.baseAssetMaxPriceTick,
            lowerTick,
            upperTick
        );
    }

    struct RuntimeValidateParams {
        uint160 sqrtPriceX96;
        uint160 sqrtPriceAX96;
        uint160 sqrtPriceBX96;
        uint256 gweiAmount;
        uint256 gasAmount;
        uint256 gweiFromGas;
        uint256 totalGweiAmount;
        uint256 leftoverGwei;
        uint256 leftoverGas;
    }

    function validateLoanAmount(
        Data storage self,
        Epoch.Data storage epoch,
        uint128 liquidity,
        int24 priceTick, // 100 gwei
        int24 lowerTick, // 5 gwei
        int24 upperTick // 20 gwei
    ) internal {
        console2.log(
            "sqrtRatioBX96:",
            TickMath.getTickAtSqrtRatio(177159557114295710296101716160)
        );
        RuntimeValidateParams memory params;
        params.sqrtPriceAX96 = TickMath.getSqrtRatioAtTick(lowerTick);
        params.sqrtPriceBX96 = TickMath.getSqrtRatioAtTick(upperTick);

        params.sqrtPriceX96 = TickMath.getSqrtRatioAtTick(priceTick);

        console2.log(
            "BEFORE",
            params.sqrtPriceAX96,
            params.sqrtPriceBX96,
            liquidity
        );

        (params.gweiAmount, params.gasAmount) = LiquidityAmounts
            .getAmountsForLiquidity(
                params.sqrtPriceBX96,
                params.sqrtPriceBX96,
                params.sqrtPriceAX96,
                liquidity
            );
        console2.log("AFTER", params.gweiAmount, params.gasAmount);

        params.gweiFromGas = epoch.quoteGasToGwei(params.gasAmount, priceTick);

        params.totalGweiAmount =
            params.gweiAmount +
            params.gweiFromGas +
            self.collateralAmount; // divide by 1e9

        if (self.borrowedGwei > params.totalGweiAmount) {
            revert Errors.InsufficientCollateral();
        }

        params.leftoverGwei = params.totalGweiAmount - self.borrowedGwei;
        params.leftoverGas = epoch.quoteGweiToGas(
            params.leftoverGwei,
            priceTick
        );

        if (self.borrowedGas > params.leftoverGas) {
            revert Errors.InsufficientCollateral();
        }
    }
}
