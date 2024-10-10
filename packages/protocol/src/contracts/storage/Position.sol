// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import "./Epoch.sol";
import "./Trade.sol";

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCastU256, SafeCastI256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {DecimalMath} from "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";
import {IFoilStructs} from "../interfaces/IFoilStructs.sol";
import {ERC721Storage} from "./ERC721Storage.sol";
import {Errors} from "./Errors.sol";

library Position {
    using SafeCastU256 for uint256;
    using SafeCastI256 for int256;
    using DecimalMath for uint256;
    using SafeERC20 for IERC20;

    using Epoch for Epoch.Data;

    struct Data {
        uint256 id;
        IFoilStructs.PositionKind kind;
        uint256 epochId;
        // Accounting data (debt and deposited collateral)
        uint256 depositedCollateralAmount; // configured collateral
        uint256 borrowedVEth;
        uint256 borrowedVGas;
        // Position data (owned tokens)
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

    function updateCollateral(
        Data storage self,
        uint256 amount
    ) internal returns (int256 deltaCollateral) {
        IERC20 collateralAsset = Market.load().collateralAsset;
        console2.log(" AT UPDATECOLLATERAL");
        console2.log(
            "    >> self.depositedCollateralAmount ",
            self.depositedCollateralAmount
        );
        console2.log("    >> amount                         ", amount);

        deltaCollateral =
            amount.toInt() -
            self.depositedCollateralAmount.toInt();
        console2.log("    >> deltaCollateral                ", deltaCollateral);

        if (deltaCollateral > 0) {
            collateralAsset.safeTransferFrom(
                msg.sender,
                address(this),
                deltaCollateral.toUint()
            );
        } else if (deltaCollateral < 0) {
            collateralAsset.safeTransfer(
                msg.sender,
                (deltaCollateral * -1).toUint()
            );
        }
        // do nothing if deltaCollateral == 0

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
    )
        internal
        returns (
            uint256 requiredCollateral,
            uint256 loanAmount0,
            uint256 loanAmount1
        )
    {
        self.kind = IFoilStructs.PositionKind.Liquidity;
        self.epochId = epoch.id;
        self.uniswapPositionId = params.uniswapNftId;
        self.borrowedVGas += params.additionalLoanAmount0;
        self.borrowedVEth += params.additionalLoanAmount1;

        loanAmount0 = self.borrowedVGas;
        loanAmount1 = self.borrowedVEth;

        requiredCollateral = epoch.requiredCollateralForLiquidity(
            params.liquidity,
            loanAmount0,
            loanAmount1,
            params.tokensOwed0,
            params.tokensOwed1,
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
        self.isSettled = true;

        // 1- reconcile gas tokens
        _reconcileGasTokens(self);

        // 2- convert everything to ETH
        if (self.vGasAmount > 0) {
            self.vEthAmount += self.vGasAmount.mulDecimal(settlementPriceD18);
            self.vGasAmount = 0;
        }
        if (self.borrowedVGas > 0) {
            self.borrowedVEth += self.borrowedVGas.mulDecimal(
                settlementPriceD18
            );
            // round up
            self.borrowedVEth += mulmod(
                self.borrowedVGas,
                settlementPriceD18,
                1e18
            ) > 0
                ? 1
                : 0;

            self.borrowedVGas = 0;
        }

        // 3- reconcile eth tokens
        _reconcileEthTokens(self);

        // 4- reconcile collateral
        reconcileCollateral(self);

        return self.depositedCollateralAmount;
    }

    function positionSize(Data storage self) internal view returns (int256) {
        return self.vGasAmount.toInt() - self.borrowedVGas.toInt();
    }

    function reconcileTokens(Data storage self) internal {
        _reconcileGasTokens(self);
        _reconcileEthTokens(self);
    }

    function _reconcileGasTokens(Data storage self) private {
        if (self.vGasAmount > self.borrowedVGas) {
            self.vGasAmount -= self.borrowedVGas;
            self.borrowedVGas = 0;
        } else {
            self.borrowedVGas -= self.vGasAmount;
            self.vGasAmount = 0;
        }
    }

    function _reconcileEthTokens(Data storage self) private {
        if (self.vEthAmount > self.borrowedVEth) {
            self.vEthAmount -= self.borrowedVEth;
            self.borrowedVEth = 0;
        } else {
            self.borrowedVEth -= self.vEthAmount;
            self.vEthAmount = 0;
        }
    }

    function reconcileCollateral(Data storage self) internal {
        if (self.vEthAmount > 0) {
            self.depositedCollateralAmount += self.vEthAmount;
            self.vEthAmount = 0;
        }

        if (self.borrowedVEth > 0) {
            self.depositedCollateralAmount -= self.borrowedVEth;
            self.borrowedVEth = 0;
        }
    }

    function getRequiredCollateral(
        Data storage self
    ) internal view returns (uint256 requiredCollateral) {
        Epoch.Data storage epoch = Epoch.load(self.epochId);

        requiredCollateral = epoch.getCollateralRequirementsForTrade(
            self.vGasAmount,
            self.vEthAmount,
            self.borrowedVGas,
            self.borrowedVEth
        );
    }
}
