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
        uint256 predictionId;        // slot 0
        uint256 makerNftTokenId;     // slot 1
        uint256 takerNftTokenId;     // slot 2
        uint256 makerCollateral;     // slot 3
        uint256 takerCollateral;     // slot 4
        // Prediction data
        bytes encodedPredictedOutcomes; // slot 5 (dynamic)
        // Packed fields in slot 6
        address resolver;            // slot 6 (packed with addresses and bools)
        address maker;               // slot 6 (packed)
        address taker;               // slot 6 (packed)
        bool settled;                // slot 6 (packed)
        bool makerWon;               // slot 6 (packed)
    }

    // Struct to mint prediction data
    struct MintPredictionRequestData {
        bytes encodedPredictedOutcomes; // encoded predicted outcomes for the resolver to validate
        address resolver;
        uint256 makerCollateral;
        uint256 takerCollateral;
        address maker;
        address taker;
        uint256 makerNonce; // nonce to prevent signature replay per maker
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
        uint256 orderId;             // slot 0
        uint256 makerCollateral;     // slot 1
        uint256 takerCollateral;     // slot 2
        uint256 orderDeadline;       // slot 3
        bytes encodedPredictedOutcomes; // slot 4 (dynamic)
        address resolver;            // slot 5 (packed with addresses)
        address maker;               // slot 5 (packed)
        address taker;               // slot 5 (packed)
    }
}
