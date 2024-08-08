// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import "./Epoch.sol";
import {SafeCastU256} from "../../synthetix/utils/SafeCast.sol";

library Position {
    using SafeCastU256 for uint256;

    struct Data {
        uint256 tokenId; // nft id
        IFoilStructs.PositionKind kind;
        uint256 epochId;
        // Accounting data (debt and deposited collateral)
        uint256 depositedCollateralAmount; // configured collateral
        uint256 borrowedVEth;
        uint256 borrowedVGas;
        // Position data (owned tokens and position size)
        uint256 vEthAmount;
        uint256 vGasAmount;
        int256 currentTokenAmount;
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
        if (positionId == 0 || position.tokenId == 0) {
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

        if (position.tokenId != 0) {
            revert Errors.PositionAlreadyCreated();
        }

        position.tokenId = positionId;
        return position;
    }

    function updateBalance(
        Data storage self,
        int256 deltaTokenAmount,
        int256 vEthDeltaAmount,
        int256 vGasDeltaAmount
    ) internal {
        self.currentTokenAmount += deltaTokenAmount;
        self.vEthAmount = uint256(self.vEthAmount.toInt() + vEthDeltaAmount);
        self.vGasAmount = uint256(self.vGasAmount.toInt() + vGasDeltaAmount);
    }

    function resetBalance(Data storage self) internal {
        self.currentTokenAmount = 0;
        self.vEthAmount = 0;
        self.vGasAmount = 0;
    }

    function updateLoan(
        Data storage self,
        uint256 tokenId,
        uint256 collateralAmount,
        uint256 amount0,
        uint256 amount1
    ) internal {
        self.depositedCollateralAmount = collateralAmount;
        self.borrowedVGas = amount0;
        self.borrowedVEth = amount1;
        self.tokenId = tokenId;
    }

    function updateCollateral(
        Data storage self,
        IERC20 collateralAsset,
        uint256 amount
    ) internal {
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
}
