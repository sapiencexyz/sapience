// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IPredictionStructs
 * @notice Interface containing all prediction-related structs
 */
interface IPredictionStructs {
    // ============ Structs ============
    struct Settings {
        address collateralToken; // collateral token
        uint256 minCollateral; // minimum collateral amount for a prediction
    }

    struct PredictionData {
        // Prediction metadata
        uint256 predictionId;
        address resolver;
        address maker;
        address taker;
        // Prediction data
        bytes encodedPredictedOutcomes; // encoded predicted outcomes for the resolver to validate
        // Prediction ownership data
        uint256 makerNftTokenId; // NFT token id of the maker
        uint256 takerNftTokenId; // NFT token id of the taker
        // Notice: the maker deposited the collateral in the pool, and the taker escrowed the delta to reach the payout amount
        uint256 makerCollateral;
        uint256 takerCollateral;
        // Prediction result data
        bool settled; // true if the prediction has been settled
        bool makerWon; // true if maker won, false if taker won (only set after settlement)
    }

    // Struct to mint prediction data
    struct MintPredictionRequestData {
        bytes encodedPredictedOutcomes; // encoded predicted outcomes for the resolver to validate
        address resolver;
        uint256 makerCollateral;
        uint256 takerCollateral;
        address maker;
        address taker;
        bytes takerSignature; // Taker is allowing just this prediction
        uint256 takerDeadline; // deadline for the taker signature
        bytes32 refCode;
    }

    // Struct to mint prediction data
    struct OrderRequestData {
        bytes encodedPredictedOutcomes; // encoded predicted outcomes for the resolver to validate
        uint256 orderDeadline;
        address resolver;
        uint256 makerCollateral;
        uint256 takerCollateral;
        bytes32 refCode;
    }

    // Struct to mint prediction data
    struct LimitOrderData {
        uint256 orderId; // zero means no order
        bytes encodedPredictedOutcomes; // encoded predicted outcomes for the resolver to validate
        address resolver;
        uint256 makerCollateral;
        uint256 takerCollateral;
        address maker;
        address taker;
        uint256 orderDeadline;
    }
}
