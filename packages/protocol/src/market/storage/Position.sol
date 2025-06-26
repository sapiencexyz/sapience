// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "./Market.sol";
import "./MarketGroup.sol";
import "./Trade.sol";

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCastU256, SafeCastI256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";

import {DecimalMath} from "../libraries/DecimalMath.sol";
import {ISapienceStructs} from "../interfaces/ISapienceStructs.sol";
import {ERC721Storage} from "./ERC721Storage.sol";
import {Errors} from "./Errors.sol";
import {Pool} from "../libraries/Pool.sol";
import {TickMath} from "../external/univ3/TickMath.sol";

library Position {
    using SafeCastU256 for uint256;
    using SafeCastI256 for int256;
    using DecimalMath for uint256;
    using DecimalMath for int256;
    using SafeERC20 for IERC20;
    using Market for Market.Data;
    using MarketGroup for MarketGroup.Data;

    struct Data {
        // Unique identifier for the position
        uint256 id;
        // Type of position (e.g., Trade, Liquidity)
        ISapienceStructs.PositionKind kind;
        // ID of the market this position belongs to
        uint256 marketId;
        // User's collateral amount backing their positions
        uint256 depositedCollateralAmount;
        // Amount of virtual quote token borrowed
        uint256 borrowedVQuote;
        // Amount of virtual base token borrowed
        uint256 borrowedVBase;
        // Amount of accrued/bought virtual quote token
        uint256 vQuoteAmount;
        // Amount of accrued/bought virtual base token
        uint256 vBaseAmount;
        // ID of the associated Uniswap V3 LP position (not applicable to traders)
        uint256 uniswapPositionId;
        // Flag indicating if the position has been settled
        bool isSettled;
    }

    function load(
        uint256 positionId
    ) internal pure returns (Data storage position) {
        bytes32 s = keccak256(abi.encode("sapience.position", positionId));

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
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        IERC20 collateralAsset = marketGroup.collateralAsset;
        
        // Calculate delta in 18 decimals
        deltaCollateral =
            amount.toInt() -
            self.depositedCollateralAmount.toInt();

        if (deltaCollateral == 0) {
            return 0;
        } else if (deltaCollateral > 0) {
            // Convert to token decimals for transfer (round up to ensure protocol receives full amount)
            uint256 transferAmount = marketGroup.denormalizeCollateralAmountUp(deltaCollateral.toUint());
            collateralAsset.safeTransferFrom(
                msg.sender,
                address(this),
                transferAmount
            );
        } else if (deltaCollateral < 0) {
            // Convert to token decimals for transfer (round down to protect protocol)
            uint256 transferAmount = marketGroup.denormalizeCollateralAmount((deltaCollateral * -1).toUint());
            collateralAsset.safeTransfer(
                msg.sender,
                transferAmount
            );
        }

        self.depositedCollateralAmount = amount;
    }

    function afterTradeCheck(Data storage self) internal view {
        Market.load(self.marketId).validateCollateralRequirementsForTrade(
            self.depositedCollateralAmount,
            self.vBaseAmount,
            self.vQuoteAmount,
            self.borrowedVBase,
            self.borrowedVQuote
        );

        MarketGroup.Data storage marketGroup = MarketGroup.load();
        // Use minTradeSize as the minimum collateral requirement (already in 18 decimals)
        if (self.depositedCollateralAmount < marketGroup.minTradeSize) {
            revert Errors.CollateralBelowMin(
                self.depositedCollateralAmount,
                marketGroup.minTradeSize
            );
        }
    }

    function preValidateLp(Data storage self) internal view {
        if (self.kind != ISapienceStructs.PositionKind.Liquidity) {
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
        Market.Data storage market,
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
        self.kind = ISapienceStructs.PositionKind.Liquidity;
        self.marketId = market.id;
        self.uniswapPositionId = params.uniswapNftId;
        self.borrowedVBase += params.additionalLoanAmount0;
        self.borrowedVQuote += params.additionalLoanAmount1;

        loanAmount0 = self.borrowedVBase;
        loanAmount1 = self.borrowedVQuote;

        requiredCollateral = market.requiredCollateralForLiquidity(
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

        // 1- reconcile base tokens
        rebalanceBaseTokens(self);

        // 2- convert everything to quote tokens
        if (self.vBaseAmount > 0) {
            self.vQuoteAmount += self.vBaseAmount.mulDecimal(settlementPriceD18);
            self.vBaseAmount = 0;
        }
        if (self.borrowedVBase > 0) {
            self.borrowedVQuote += self.borrowedVBase.mulDecimal(
                settlementPriceD18
            );
            // round up
            self.borrowedVQuote += mulmod(
                self.borrowedVBase,
                settlementPriceD18,
                1e18
            ) > 0
                ? 1
                : 0;

            self.borrowedVBase = 0;
        }

        rebalanceQuoteTokens(self);
        rebalanceCollateral(self);
        // after rebalancing the Quote Tokens and Collateral, all virtual tokens are zeroed and only the deposited collateral is left with the net balance.

        return self.depositedCollateralAmount;
    }

    function positionSize(Data storage self) internal view returns (int256) {
        return self.vBaseAmount.toInt() - self.borrowedVBase.toInt();
    }

    /**
     * Rebalances the virtual tokens (base, quote) between borrowed and accrued.
     */
    function rebalanceVirtualTokens(Data storage self) internal {
        rebalanceBaseTokens(self);
        rebalanceQuoteTokens(self);
    }

    /**
     * Rebalances the virtual base tokens between borrowed and accrued.
     */
    function rebalanceBaseTokens(Data storage self) internal {
        if (self.vBaseAmount > self.borrowedVBase) {
            self.vBaseAmount -= self.borrowedVBase;
            self.borrowedVBase = 0;
        } else {
            self.borrowedVBase -= self.vBaseAmount;
            self.vBaseAmount = 0;
        }
    }

    /**
     * Rebalances the virtual quote tokens between borrowed and accrued.
     */
    function rebalanceQuoteTokens(Data storage self) private {
        if (self.vQuoteAmount > self.borrowedVQuote) {
            self.vQuoteAmount -= self.borrowedVQuote;
            self.borrowedVQuote = 0;
        } else {
            self.borrowedVQuote -= self.vQuoteAmount;
            self.vQuoteAmount = 0;
        }
    }

    /**
     * If accrued vQuote, it's added to the deposited collateral.
     * If borrowed vQuote, it's subtracted from the deposited collateral.
     * This function rebalances collateral against the virtual tokens, and resets the virtual tokens to 0.
     */
    function rebalanceCollateral(Data storage self) internal {
        if (self.vQuoteAmount > 0) {
            self.depositedCollateralAmount += self.vQuoteAmount;
            self.vQuoteAmount = 0;
        }

        if (self.borrowedVQuote > 0) {
            self.depositedCollateralAmount -= self.borrowedVQuote;
            self.borrowedVQuote = 0;
        }
    }

    function getPnl(Data storage self) internal view returns (int256) {
        Market.Data storage market = Market.load(self.marketId);

        uint256 basePriceD18 = market.getReferencePrice();

        // Initialize net virtual base and quote positions
        int256 netVBase;
        int256 netVQuote;

        // If the position is a Liquidity Provider (LP) position
        if (self.kind == ISapienceStructs.PositionKind.Liquidity) {
            // Get the current amounts and fees owed from the Uniswap position manager
            (
                uint256 amount0,
                uint256 amount1,
                ,
                ,
                ,
                uint256 tokensOwed0,
                uint256 tokensOwed1
            ) = Pool.getCurrentPositionTokenAmounts(market, self);

            // Add these amounts to the position's vBaseAmount and vQuoteAmount
            uint256 totalVBase = self.vBaseAmount + amount0 + tokensOwed0;
            uint256 totalVQuote = self.vQuoteAmount + amount1 + tokensOwed1;

            netVBase = int256(totalVBase) - int256(self.borrowedVBase);
            netVQuote = int256(totalVQuote) - int256(self.borrowedVQuote);
        } else {
            // For trader positions, use the stored values
            netVBase = int256(self.vBaseAmount) - int256(self.borrowedVBase);
            netVQuote = int256(self.vQuoteAmount) - int256(self.borrowedVQuote);
        }

        // Calculate the net value of virtual base holdings in quote terms
        int256 netVBaseValue = netVBase.mulDecimal(int256(basePriceD18));

        // Total net value in quote terms (profit or loss)
        return netVQuote + netVBaseValue;
    }

    function updateWithNewPosition(
        Data storage self,
        Data memory newPosition
    ) internal {
        self.vBaseAmount = newPosition.vBaseAmount;
        self.vQuoteAmount = newPosition.vQuoteAmount;
        self.borrowedVBase = newPosition.borrowedVBase;
        self.borrowedVQuote = newPosition.borrowedVQuote;
        self.depositedCollateralAmount = newPosition.depositedCollateralAmount;
    }
}
