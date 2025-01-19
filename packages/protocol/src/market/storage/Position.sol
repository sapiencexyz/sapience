// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "./Epoch.sol";
import "./Trade.sol";

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCastU256, SafeCastI256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";

import {DecimalMath} from "../libraries/DecimalMath.sol";
import {IFoilStructs} from "../interfaces/IFoilStructs.sol";
import {ERC721Storage} from "./ERC721Storage.sol";
import {Errors} from "./Errors.sol";
import {Market} from "./Market.sol";
import {Pool} from "../libraries/Pool.sol";

library Position {
    using SafeCastU256 for uint256;
    using SafeCastI256 for int256;
    using DecimalMath for uint256;
    using DecimalMath for int256;
    using SafeERC20 for IERC20;
    using Market for Market.Data;

    using Epoch for Epoch.Data;

    struct Data {
        // Unique identifier for the position
        uint256 id;
        // Type of position (e.g., Trade, Liquidity)
        IFoilStructs.PositionKind kind;
        // ID of the epoch this position belongs to
        uint256 epochId;
        // User's collateral amount backing their positions
        uint256 depositedCollateralAmount;
        // Amount of virtual ETH borrowed
        uint256 borrowedVEth;
        // Amount of virtual Gas borrowed
        uint256 borrowedVGas;
        // Amount of accrued/bought virtual ETH
        uint256 vEthAmount;
        // Amount of accrued/bought virtual Gas
        uint256 vGasAmount;
        // ID of the associated Uniswap V3 LP position (not applicable to traders)
        uint256 uniswapPositionId;
        // Flag indicating if the position has been settled
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
        deltaCollateral =
            amount.toInt() -
            self.depositedCollateralAmount.toInt();

        if (deltaCollateral == 0) {
            return 0;
        } else if (deltaCollateral > 0) {
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

        if (self.depositedCollateralAmount < Market.MIN_COLLATERAL) {
            revert Errors.CollateralBelowMin(
                self.depositedCollateralAmount,
                Market.MIN_COLLATERAL
            );
        }
    }

    function preValidateLp(Data storage self) internal view {
        if (self.kind != IFoilStructs.PositionKind.Liquidity) {
            revert Errors.InvalidPositionKind();
        }

        validateLp(self);
    }

    // called from depositCollateral, that way the check for self.kind is not needed as
    // both trader and lps can deposit collateral as long as they are the owner of fee collector NFT
    function validateLp(Data storage self) internal view {
        if (self.isSettled) {
            revert Errors.PositionAlreadySettled(self.id);
        }

        if (ERC721Storage._ownerOf(self.id) != msg.sender) {
            revert Errors.NotAccountOwner(self.id, msg.sender);
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
        bool isFeeCollector;
    }

    function updateValidLp(
        Data storage self,
        Epoch.Data storage epoch,
        UpdateLpParams memory params
    )
        internal
        returns (
            uint256 requiredCollateral,
            uint256 newCollateralAmount,
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

        newCollateralAmount =
            self.depositedCollateralAmount +
            params.additionalCollateral;

        if (
            requiredCollateral > newCollateralAmount && !params.isFeeCollector
        ) {
            revert Errors.InsufficientCollateral(
                requiredCollateral,
                newCollateralAmount
            );
        }
    }

    function settle(
        Data storage self,
        uint256 settlementPriceD18
    ) internal returns (uint256 collateralAmountReturned) {
        self.isSettled = true;

        // 1- reconcile gas tokens
        rebalanceGasTokens(self);

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

        rebalanceEthTokens(self);
        rebalanceCollateral(self);
        // after rebalancing the Eth Tokens and Collateral, all virtual tokens are zeroed and only the deposited collateral is left with the net balance.
        
        return self.depositedCollateralAmount;
    }

    function positionSize(Data storage self) internal view returns (int256) {
        return self.vGasAmount.toInt() - self.borrowedVGas.toInt();
    }

    /**
     * Rebalances the virtual tokens (ETH, GAS) between borrowed and accrued.
     */
    function rebalanceVirtualTokens(Data storage self) internal {
        rebalanceGasTokens(self);
        rebalanceEthTokens(self);
    }

    /**
     * Rebalances the virtual gas tokens between borrowed and accrued.
     */
    function rebalanceGasTokens(Data storage self) internal {
        if (self.vGasAmount > self.borrowedVGas) {
            self.vGasAmount -= self.borrowedVGas;
            self.borrowedVGas = 0;
        } else {
            self.borrowedVGas -= self.vGasAmount;
            self.vGasAmount = 0;
        }
    }

    /**
     * Rebalances the virtual eth tokens between borrowed and accrued.
     */
    function rebalanceEthTokens(Data storage self) private {
        if (self.vEthAmount > self.borrowedVEth) {
            self.vEthAmount -= self.borrowedVEth;
            self.borrowedVEth = 0;
        } else {
            self.borrowedVEth -= self.vEthAmount;
            self.vEthAmount = 0;
        }
    }

    /**
     * If accrued vETH, it's added to the deposited collateral.
     * If borrowed vETH, it's subtracted from the deposited collateral.
     * This function rebalances collateral against the virtual tokens, and resets the virtual tokens to 0.
     */
    function rebalanceCollateral(Data storage self) internal {
        if (self.vEthAmount > 0) {
            self.depositedCollateralAmount += self.vEthAmount;
            self.vEthAmount = 0;
        }

        if (self.borrowedVEth > 0) {
            self.depositedCollateralAmount -= self.borrowedVEth;
            self.borrowedVEth = 0;
        }
    }

    function getPnl(Data storage self) internal view returns (int256) {
        Epoch.Data storage epoch = Epoch.load(self.epochId);

        uint256 gasPriceD18 = epoch.getReferencePrice();

        // Initialize net virtual GAS and ETH positions
        int256 netVGAS;
        int256 netVETH;

        // If the position is a Liquidity Provider (LP) position
        if (self.kind == IFoilStructs.PositionKind.Liquidity) {
            // Get the current amounts and fees owed from the Uniswap position manager
            (
                uint256 amount0,
                uint256 amount1,
                ,
                ,
                ,
                uint256 tokensOwed0,
                uint256 tokensOwed1
            ) = Pool.getCurrentPositionTokenAmounts(epoch, self);

            // Add these amounts to the position's vGasAmount and vEthAmount
            uint256 totalVGAS = self.vGasAmount + amount0 + tokensOwed0;
            uint256 totalVETH = self.vEthAmount + amount1 + tokensOwed1;

            netVGAS = int256(totalVGAS) - int256(self.borrowedVGas);
            netVETH = int256(totalVETH) - int256(self.borrowedVEth);
        } else {
            // For trader positions, use the stored values
            netVGAS = int256(self.vGasAmount) - int256(self.borrowedVGas);
            netVETH = int256(self.vEthAmount) - int256(self.borrowedVEth);
        }

        // Calculate the net value of virtual GAS holdings in ETH terms
        int256 netVGASValue = netVGAS.mulDecimal(int256(gasPriceD18));

        // Total net value in ETH terms (profit or loss)
        return netVETH + netVGASValue;
    }
}
