// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import {TickMath} from "../external/univ3/TickMath.sol";
import "./Position.sol";
import "./Market.sol";
import "../external/univ3/LiquidityAmounts.sol";
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

    struct RuntimeValidateParams {
        uint160 sqrtPriceAX96;
        uint160 sqrtPriceBX96;
    }

    function validateProvidedLiquidity(
        Data storage self,
        Market.MarketParams memory marketParams,
        uint128 liquidity,
        int24 lowerTick,
        int24 upperTick
    ) internal {
        RuntimeValidateParams memory params;
        params.sqrtPriceAX96 = TickMath.getSqrtRatioAtTick(lowerTick);
        params.sqrtPriceBX96 = TickMath.getSqrtRatioAtTick(upperTick);

        uint128 scaleFactor = 1e3;

        uint256 amountGasAtLowerTick = LiquidityAmounts.getAmount0ForLiquidity(
            params.sqrtPriceAX96,
            params.sqrtPriceBX96,
            liquidity / scaleFactor
        ) * uint256(scaleFactor);
        console2.log("AMOUNT GAS AT LOWER TICK", amountGasAtLowerTick);

        uint256 amountGweiAtUpperTick = LiquidityAmounts.getAmount1ForLiquidity(
            params.sqrtPriceAX96,
            params.sqrtPriceBX96,
            liquidity / scaleFactor
        ) * uint256(scaleFactor);

        console2.log(
            "AMOUNT GWEI AT UPPER TICK",
            amountGweiAtUpperTick,
            self.borrowedGwei
        );
        console2.log("BORROWED GWEI", self.borrowedGwei);
        console2.log("amountGasAtLowerTic", amountGasAtLowerTick);

        uint256 leftoverGweiAmountAtLowerTick;
        if (amountGasAtLowerTick > self.borrowedGas) {
            console2.log("INIF", amountGasAtLowerTick, self.borrowedGas);
            leftoverGweiAmountAtLowerTick = quoteGasToGwei(
                amountGasAtLowerTick - self.borrowedGas,
                marketParams.baseAssetMinPriceTick
            );
        }

        console2.log("LEFTOVER GAS AMOUNT", leftoverGweiAmountAtLowerTick);
        console2.log(
            "LEFTOVER GWEI AMOUNT LOWER",
            leftoverGweiAmountAtLowerTick,
            leftoverGweiAmountAtLowerTick + self.collateralAmount
        );

        if (
            leftoverGweiAmountAtLowerTick + self.collateralAmount <
            self.borrowedGwei
        ) {
            revert Errors.InsufficientCollateral();
        }

        uint256 availableGweiFromPosition = amountGweiAtUpperTick >
            self.borrowedGwei
            ? amountGweiAtUpperTick - self.borrowedGwei
            : 0;
        console2.log("AVAILABLE GWEI FROM POSITION", availableGweiFromPosition);
        uint256 maxAvailableGasToPayLoan = quoteGweiToGas(
            availableGweiFromPosition + self.collateralAmount,
            marketParams.baseAssetMaxPriceTick
        );

        console2.log(
            "MAX AVAILABLE GAS TO PAY LOAN",
            maxAvailableGasToPayLoan,
            self.borrowedGas
        );

        if (maxAvailableGasToPayLoan < self.borrowedGas) {
            revert Errors.InsufficientCollateral();
        }
    }

    // MOVE TO LIB
    function quoteGweiToGas(
        uint256 gweiAmount,
        int24 priceTick
    ) internal returns (uint256) {
        uint160 sqrtRatioX96 = TickMath.getSqrtRatioAtTick(priceTick);
        console2.log("GWEITOGAS", sqrtRatioX96ToPrice(sqrtRatioX96));
        return
            FullMath.mulDiv(
                gweiAmount,
                1e18,
                sqrtRatioX96ToPrice(sqrtRatioX96)
            );
    }

    function quoteGasToGwei(
        uint256 gasAmount,
        int24 priceTick
    ) internal returns (uint256) {
        uint160 sqrtRatioX96 = TickMath.getSqrtRatioAtTick(priceTick);
        console2.log("GASTOGWEI", sqrtRatioX96ToPrice(sqrtRatioX96));
        return
            FullMath.mulDiv(gasAmount, sqrtRatioX96ToPrice(sqrtRatioX96), 1e18);
    }
    // should move to lib

    // Function to convert sqrtRatioX96 to price
    function sqrtRatioX96ToPrice(
        uint160 sqrtRatioX96
    ) internal pure returns (uint256 price) {
        // Calculate the price as (sqrtRatioX96^2) / (2^192)
        uint256 sqrtRatioX96Squared = uint256(sqrtRatioX96) *
            uint256(sqrtRatioX96);
        price = sqrtRatioX96Squared >> 96;
        // Scale price to have 18 decimal places
        price = (price * 10 ** 18) / (2 ** 96);
    }
}
