// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IParlayStructs
 * @notice Interface containing all parlay-related structs
 */
interface IParlayStructs {
    // ============ Structs ============
    struct Settings {
        address collateralToken; // collateral token
        uint256 maxParlayMarkets; // maximum number of markets for a parlay
        uint256 minCollateral; // minimum collateral amount for a parlay
        uint256 minRequestExpirationTime; // minimum expiration time for a parlay request
        uint256 maxRequestExpirationTime; // maximum expiration time for a parlay request
        address[] approvedTakers; // Global list of approved takers (empty means anyone can fill)
    }

    struct Market {
        address marketGroup;
        uint256 marketId;
    }

    struct PredictedOutcome {
        Market market;
        bool prediction; // true for YES, false for NO
    }

    struct ParlayData {
        // Parlay metadata
        uint256 parlayId;
        address resolver;
        // Parlay ownership data
        uint256 makerNftTokenId; // NFT token id of the maker
        uint256 takerNftTokenId; // NFT token id of the taker
        // Notice: the maker deposited the collateral in the pool, and the taker escrowed the delta to reach the payout amount
        uint256 makerCollateral;
        uint256 takerCollateral;
        // Parlay result data
        bool settled; // true if the parlay has been settled
        bool makerWon; // true if maker won, false if taker won (only set after settlement)
    }

    // Struct to store mint parlay data
    struct MintParlayRequestData {
        // bytes packedPredictedOutcomes;
        IParlayStructs.PredictedOutcome[] predictedOutcomes;
        address resolver;
        uint256 makerCollateral;
        uint256 takerCollateral;
        address maker;
        address taker;
        bytes makerSignature; // Just ERC20 Permit
        bytes takerSignature; // Just ERC20 Permit
        uint256 makerSignatureDeadline;
        uint256 takerSignatureDeadline;
        bytes takerParlaySignature; // Taker is allowing just this parlay 
        bytes32 refCode;
    }
}
