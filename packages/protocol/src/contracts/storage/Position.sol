// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import "./Epoch.sol";
import "./Trade.sol";

import {SafeCastU256, SafeCastI256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {DecimalMath} from "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";
import {IFoilStructs} from "../interfaces/IFoilStructs.sol";
import {PositionKey} from "../libraries/PositionKey.sol";
import {ERC721Storage} from "./ERC721Storage.sol";
import {Errors} from "./Errors.sol";

library Position {
    using SafeCastU256 for uint256;
    using SafeCastI256 for int256;
    using DecimalMath for uint256;

    using Epoch for Epoch.Data;

    struct Data {
        uint256 id;
        IFoilStructs.PositionKind kind;
        uint256 epochId;
        // Accounting data (debt and deposited collateral)
        uint256 depositedCollateralAmount; // configured collateral
        uint256 borrowedVEth;
        uint256 borrowedVGas;
        // Position data (owned tokens and position size)
        uint256 vEthAmount;
        uint256 vGasAmount;
        uint256 uniswapPositionId; // uniswap nft id
        bool isSettled;
    }

    function load(
        uint256 positionId
    ) internal pure returns (Data storage position) {
        bytes32 s = keccak256(abi.encode("foil.gas.position", positionId));

        assembly {
            position.slot := s
        }
    }

    function loadValid(
        uint256 positionId
    ) internal view returns (Data storage position) {
        position = load(positionId);
        if (positionId == 0 || position.id == 0) {
            revert Errors.InvalidPositionId(positionId);
        }
    }

    function createValid(
        uint256 positionId
    ) internal returns (Data storage position) {
        if (positionId == 0) {
            revert Errors.InvalidPositionId(positionId);
        }

        position = load(positionId);

        if (position.id != 0) {
            revert Errors.PositionAlreadyCreated();
        }

        position.id = positionId;
        return position;
    }

    function updateBalance(
        Data storage self,
        int256 vEthDeltaAmount,
        int256 vGasDeltaAmount
    ) internal {
        self.vEthAmount = uint256(self.vEthAmount.toInt() + vEthDeltaAmount);
        self.vGasAmount = uint256(self.vGasAmount.toInt() + vGasDeltaAmount);
    }

    function resetBalance(Data storage self) internal {
        self.vEthAmount = 0;
        self.vGasAmount = 0;
    }

    function updateCollateral(Data storage self, uint256 amount) internal {
        IERC20 collateralAsset = Market.load().collateralAsset;
        if (amount > self.depositedCollateralAmount) {
            collateralAsset.transferFrom(
                msg.sender,
                address(this),
                amount - self.depositedCollateralAmount
            );
        } else {
            collateralAsset.transfer(
                msg.sender,
                self.depositedCollateralAmount - amount
            );
        }

        self.depositedCollateralAmount = amount;
    }

    function afterTradeCheck(Data storage self) internal view {
        Epoch.load(self.epochId).validateCollateralRequirementsForTrade(
            self.depositedCollateralAmount,
            self.vGasAmount,
            self.vEthAmount,
            self.borrowedVGas,
            self.borrowedVEth
        );
    }

    function preValidateLp(Data storage self) internal view {
        if (self.kind != IFoilStructs.PositionKind.Liquidity) {
            revert Errors.InvalidPositionKind();
        }

        if (self.isSettled) {
            revert Errors.PositionAlreadySettled(self.id);
        }

        if (ERC721Storage._ownerOf(self.id) != msg.sender) {
            revert Errors.NotAccountOwnerOrAuthorized(self.id, msg.sender);
        }
    }

    struct UpdateLpParams {
        uint256 uniswapNftId;
        uint128 liquidity;
        uint256 additionalCollateral;
        uint256 additionalLoanAmount0;
        uint256 additionalLoanAmount1;
        int24 lowerTick;
        int24 upperTick;
        uint256 tokensOwed0;
        uint256 tokensOwed1;
    }

    function updateValidLp(
        Data storage self,
        Epoch.Data storage epoch,
        UpdateLpParams memory params
    ) internal returns (uint256 requiredCollateral) {
        self.kind = IFoilStructs.PositionKind.Liquidity;
        self.epochId = epoch.id;
        self.uniswapPositionId = params.uniswapNftId;
        self.borrowedVGas += params.additionalLoanAmount0;
        self.borrowedVEth += params.additionalLoanAmount1;

        (uint256 loanAmount0, uint256 loanAmount1) = (
            self.borrowedVGas > params.tokensOwed0
                ? self.borrowedVGas - params.tokensOwed0
                : 0,
            self.borrowedVEth > params.tokensOwed1
                ? self.borrowedVEth - params.tokensOwed1
                : 0
        );

        requiredCollateral = epoch.requiredCollateralForLiquidity(
            params.liquidity,
            loanAmount0,
            loanAmount1,
            TickMath.getSqrtRatioAtTick(params.lowerTick),
            TickMath.getSqrtRatioAtTick(params.upperTick)
        );

        uint256 newCollateral = self.depositedCollateralAmount +
            params.additionalCollateral;

        if (newCollateral < requiredCollateral) {
            revert Errors.InsufficientCollateral(
                requiredCollateral,
                newCollateral
            );
        }

        updateCollateral(self, requiredCollateral);
    }

    function settle(
        Data storage self,
        uint256 settlementPriceD18
    ) internal returns (uint256 collateralAmountReturned) {
        // convert everything to ETH
        if (self.vGasAmount > 0) {
            self.vEthAmount += (self.vGasAmount * settlementPriceD18) / 1e18;
        }
        if (self.borrowedVGas > 0) {
            self.borrowedVEth +=
                (self.borrowedVGas * settlementPriceD18) /
                1e18;
        }
        console2.log("self.vGasAmount", self.vGasAmount);
        console2.log("self.borrowedVGas", self.borrowedVGas);
        console2.log("self.vEthAmount", self.vEthAmount);
        console2.log("self.borrowedVEth", self.borrowedVEth);

        self.isSettled = true;

        self.depositedCollateralAmount =
            (self.depositedCollateralAmount + self.vEthAmount) -
            self.borrowedVEth;

        console2.log(
            "self.depositedCollateralAmount",
            self.depositedCollateralAmount
        );

        return self.depositedCollateralAmount;
    }

    function positionSize(Data storage self) internal view returns (int256) {
        return self.vGasAmount.toInt() - self.borrowedVGas.toInt();
    }

    function reconcileTokens(Data storage self) internal {
        reconcileGasTokens(self);
        reconcileEthTokens(self);
    }

    function reconcileGasTokens(Data storage self) internal {
        if (self.vGasAmount > self.borrowedVGas) {
            self.vGasAmount -= self.borrowedVGas;
            self.borrowedVGas = 0;
        } else {
            self.borrowedVGas -= self.vGasAmount;
            self.vGasAmount = 0;
        }
    }

    function reconcileEthTokens(Data storage self) internal {
        if (self.vEthAmount > self.borrowedVEth) {
            self.vEthAmount -= self.borrowedVEth;
            self.borrowedVEth = 0;
        } else {
            self.borrowedVEth -= self.vEthAmount;
            self.vEthAmount = 0;
        }
    }

    function getCollateralForTargetSize(
        Data storage self,
        int256 targetSize
    ) internal returns (uint256) {
        reconcileGasTokens(self);

        int256 deltaPositionSize = targetSize - positionSize(self);
        uint256 modDeltaPositionSize = deltaPositionSize > 0
            ? deltaPositionSize.toUint()
            : (-1 * deltaPositionSize).toUint();

        uint256 minPriceCollateralRequirement = getCollateralForMinPriceDelta(
            self,
            modDeltaPositionSize
        );
        uint256 maxPriceCollateralRequirement = getCollateralForMaxPriceDelta(
            self,
            modDeltaPositionSize
        );

        return
            minPriceCollateralRequirement > maxPriceCollateralRequirement
                ? minPriceCollateralRequirement
                : maxPriceCollateralRequirement;
    }

    function getCollateralForMinPriceDelta(
        Data storage self,
        uint256 modDeltaPositionSize
    ) internal view returns (uint256 collateral) {
        uint256 price = Trade.getReferencePrice(self.epochId);
        uint256 lowestPrice = Epoch.load(self.epochId).minPriceD18;
        uint256 fee = Epoch.load(self.epochId).feeRateD18;

        (uint256 totalTokens, uint256 totalDebt) = getPositionBalancesAtPrice(
            self,
            lowestPrice,
            fee
        );
        int256 currentPositionStaticBalance = totalTokens.toInt() -
            totalDebt.toInt();
        uint256 unadjustedCollateral = modDeltaPositionSize.mulDecimal(
            Trade.deltaPriceMultiplier(price, lowestPrice, fee)
        );

        if (
            currentPositionStaticBalance > 0 &&
            currentPositionStaticBalance.toUint() > unadjustedCollateral
        ) {
            // Balance at lowest price is greater than the debt, so there's no need to adjust the collateral
            return 0;
        }
        return
            (unadjustedCollateral.toInt() - currentPositionStaticBalance)
                .toUint();
    }

    function getCollateralForMaxPriceDelta(
        Data storage self,
        uint256 modDeltaPositionSize
    ) internal view returns (uint256 collateral) {
        uint256 price = Trade.getReferencePrice(self.epochId);
        uint256 highestPrice = Epoch.load(self.epochId).minPriceD18;
        uint256 fee = Epoch.load(self.epochId).feeRateD18;

        (uint256 totalTokens, uint256 totalDebt) = getPositionBalancesAtPrice(
            self,
            highestPrice,
            fee
        );
        int256 currentPositionStaticBalance = totalTokens.toInt() -
            totalDebt.toInt();
        uint256 unadjustedCollateral = modDeltaPositionSize.mulDecimal(
            Trade.deltaPriceMultiplier(highestPrice, price, fee)
        );

        if (
            currentPositionStaticBalance > 0 &&
            currentPositionStaticBalance.toUint() > unadjustedCollateral
        ) {
            // Balance at lowest price is greater than the debt, so there's no need to adjust the collateral
            return 0;
        }

        return
            (unadjustedCollateral.toInt() - currentPositionStaticBalance)
                .toUint();
    }

    function getLongDeltaForCollateral(
        Data storage self,
        uint256 newCollateral
    ) internal view returns (uint256 modPositionSize) {
        uint256 price = Trade.getReferencePrice(self.epochId);
        uint256 lowestPrice = Epoch.load(self.epochId).minPriceD18;
        uint256 fee = Epoch.load(self.epochId).feeRateD18;

        (uint256 totalTokens, uint256 totalDebt) = getPositionBalancesAtPrice(
            self,
            lowestPrice,
            fee
        );

        int256 currentPositionStaticBalance = totalTokens.toInt() -
            totalDebt.toInt();

        if (
            currentPositionStaticBalance < 0 &&
            (-1 * currentPositionStaticBalance).toUint() > newCollateral
        ) {
            // not enough collateral to go on that direction
            return 0;
        }

        uint256 adjustedCollateral = (newCollateral.toInt() +
            currentPositionStaticBalance).toUint();

        modPositionSize = adjustedCollateral.divDecimal(
            Trade.deltaPriceMultiplier(price, lowestPrice, fee)
        );
    }

    function getShortDeltaForCollateral(
        Data storage self,
        uint256 newCollateral
    ) internal view returns (uint256 modPositionSize) {
        uint256 price = Trade.getReferencePrice(self.epochId);
        uint256 highestPrice = Epoch.load(self.epochId).maxPriceD18;
        uint256 fee = Epoch.load(self.epochId).feeRateD18; // scaled to 1e18 fee

        (uint256 totalTokens, uint256 totalDebt) = getPositionBalancesAtPrice(
            self,
            highestPrice,
            fee
        );

        int256 currentPositionStaticBalance = totalTokens.toInt() -
            totalDebt.toInt();

        if (
            currentPositionStaticBalance < 0 &&
            (-1 * currentPositionStaticBalance).toUint() > newCollateral
        ) {
            // not enough collateral to go on that direction
            return 0;
        }

        uint256 adjustedCollateral = (newCollateral.toInt() +
            currentPositionStaticBalance).toUint();

        modPositionSize = adjustedCollateral.divDecimal(
            Trade.deltaPriceMultiplier(highestPrice, price, fee)
        );
    }

    function getPositionBalancesAtPrice(
        Data storage self,
        uint256 priceD18,
        uint256 feeD18
    ) internal view returns (uint256 totalTokens, uint256 totalDebt) {
        totalTokens =
            self.vEthAmount +
            self.vGasAmount.mulDecimal(
                priceD18.mulDecimal(DecimalMath.UNIT - feeD18)
            );
        totalDebt =
            self.borrowedVEth +
            self.borrowedVGas.mulDecimal(
                priceD18.mulDecimal(DecimalMath.UNIT + feeD18)
            );
    }
}
