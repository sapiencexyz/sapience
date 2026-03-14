// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IV2Types
 * @notice Shared types for the V2 Prediction Market protocol
 */
interface IV2Types {
    /// @notice Outcome side for a pick
    enum OutcomeSide {
        YES,
        NO
    }

    /// @notice Settlement result for a prediction
    enum SettlementResult {
        UNRESOLVED,
        PREDICTOR_WINS,
        COUNTERPARTY_WINS
    }

    /// @notice Outcome vector returned by condition resolvers
    /// @dev [1,0] = YES, [0,1] = NO, [1,1] = TIE
    struct OutcomeVector {
        uint256 yesWeight;
        uint256 noWeight;
    }

    /// @notice A single pick in a prediction
    struct Pick {
        address conditionResolver; // Contract that resolves this condition
        bytes conditionId; // Opaque identifier, resolver-defined (variable length)
        OutcomeSide predictedOutcome; // What the predictor chose
    }

    /// @notice Full prediction data stored on-chain
    /// @dev Links to a PickConfiguration for fungible token sharing
    struct Prediction {
        bytes32 predictionId; // Unique identifier for this prediction
        bytes32 pickConfigId; // Link to shared pick configuration
        uint256 predictorCollateral; // Amount from predictor
        uint256 counterpartyCollateral; // Amount from counterparty
        address predictor; // Predictor address
        address counterparty; // Counterparty address
        uint256 predictorTokensMinted; // Tokens minted to predictor (= totalCollateral per C-1)
        uint256 counterpartyTokensMinted; // Tokens minted to counterparty (= totalCollateral per C-1)
        bool settled; // Whether this prediction has been settled
    }

    /// @notice Pick configuration for fungible prediction pools
    /// @dev Multiple predictions with same picks share tokens
    struct PickConfiguration {
        bytes32 pickConfigId; // Hash of canonical picks
        uint256 totalPredictorCollateral; // Sum of all predictor collateral
        uint256 totalCounterpartyCollateral; // Sum of all counterparty collateral
        uint256 totalPredictorTokensMinted; // Total tokens minted to predictor side
        uint256 totalCounterpartyTokensMinted; // Total tokens minted to counterparty side
        uint256 claimedPredictorCollateral; // Amount claimed by predictor token holders
        uint256 claimedCounterpartyCollateral; // Amount claimed by counterparty token holders
        bool resolved; // Whether picks have been resolved
        SettlementResult result; // Outcome when resolved
    }

    /// @notice Session key approval data for ZeroDev integration
    /// @dev Used when a party signs via session key instead of EOA/smart account directly
    ///      Includes chainId to prevent cross-chain replay attacks
    struct SessionKeyData {
        address sessionKey; // The session key address that signed
        address owner; // The owner who authorized this session key
        uint256 validUntil; // Expiration timestamp for the session key
        bytes32 permissionsHash; // Hash of permissions granted to this session key
        uint256 chainId; // Chain ID for cross-chain replay protection
        bytes ownerSignature; // Owner's signature authorizing the session key
    }

    /// @notice Mint request data for creating a new prediction
    /// @dev Supports both EOA signatures and session key signatures
    struct MintRequest {
        Pick[] picks; // Canonical ordered picks
        uint256 predictorCollateral; // Amount from predictor
        uint256 counterpartyCollateral; // Amount from counterparty
        address predictor; // Predictor address (smart account if using session key)
        address counterparty; // Counterparty address (smart account if using session key)
        uint256 predictorNonce; // Nonce for predictor signature
        uint256 counterpartyNonce; // Nonce for counterparty signature
        uint256 predictorDeadline; // Deadline for predictor signature
        uint256 counterpartyDeadline; // Deadline for counterparty signature
        bytes predictorSignature; // EIP-712 signature (from EOA or session key)
        bytes counterpartySignature; // EIP-712 signature (from EOA or session key)
        bytes32 refCode; // Referral code
        // Session key support (optional - empty bytes if not using session keys)
        bytes predictorSessionKeyData; // ABI-encoded SessionKeyData for predictor (empty if EOA)
        bytes counterpartySessionKeyData; // ABI-encoded SessionKeyData for counterparty (empty if EOA)
        // Sponsorship support (optional - address(0) = self-funded)
        address predictorSponsor; // Sponsor contract that funds predictor's collateral
        bytes predictorSponsorData; // Opaque data passed through to sponsor's fundMint
    }

    /// @notice Burn request data for bilateral position exit before resolution
    /// @dev Both token holders sign to agree on payout split. Conservation: predictorPayout + counterpartyPayout == predictorTokenAmount + counterpartyTokenAmount
    struct BurnRequest {
        bytes32 pickConfigId; // Pick configuration to burn from
        uint256 predictorTokenAmount; // Predictor tokens to burn
        uint256 counterpartyTokenAmount; // Counterparty tokens to burn
        address predictorHolder; // Who holds/burns predictor tokens
        address counterpartyHolder; // Who holds/burns counterparty tokens
        uint256 predictorPayout; // Collateral to predictor holder
        uint256 counterpartyPayout; // Collateral to counterparty holder
        uint256 predictorNonce; // Nonce for predictor signature
        uint256 counterpartyNonce; // Nonce for counterparty signature
        uint256 predictorDeadline; // Deadline for predictor signature
        uint256 counterpartyDeadline; // Deadline for counterparty signature
        bytes predictorSignature; // EIP-712 signature (from EOA or session key)
        bytes counterpartySignature; // EIP-712 signature (from EOA or session key)
        bytes32 refCode; // Referral code
        bytes predictorSessionKeyData; // ABI-encoded SessionKeyData for predictor (empty if EOA)
        bytes counterpartySessionKeyData; // ABI-encoded SessionKeyData for counterparty (empty if EOA)
    }

    /// @notice Token pair for a prediction
    struct TokenPair {
        address predictorToken;
        address counterpartyToken;
    }

    /// @notice Escrow record for a prediction
    /// @dev Tracks individual prediction for audit trail, linked to shared PickConfiguration
    struct EscrowRecord {
        bytes32 pickConfigId; // Link to shared pick configuration
        uint256 totalCollateral; // predictorCollateral + counterpartyCollateral for this prediction
        uint256 predictorCollateral; // Original predictor collateral
        uint256 counterpartyCollateral; // Original counterparty collateral
        uint256 predictorTokensMinted; // Tokens minted to predictor
        uint256 counterpartyTokensMinted; // Tokens minted to counterparty
        bool settled; // Whether this individual prediction has been settled
    }
}
