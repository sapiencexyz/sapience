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
        COUNTERPARTY_WINS,
        NON_DECISIVE // Tie or weighted outcome (future-proof)
    }

    /// @notice Outcome vector returned by condition resolvers
    /// @dev [1,0] = YES, [0,1] = NO, [1,1] = TIE
    struct OutcomeVector {
        uint256 yesWeight;
        uint256 noWeight;
    }

    /// @notice A single pick in a prediction/parlay
    struct Pick {
        address conditionResolver; // Contract that resolves this condition
        bytes32 conditionId; // Opaque identifier, resolver-defined
        OutcomeSide predictedOutcome; // What the predictor bet on
    }

    /// @notice Full prediction data stored on-chain
    struct Prediction {
        bytes32 predictionId; // Unique identifier (hash of canonical picks)
        uint256 predictorWager; // Amount from predictor
        uint256 counterpartyWager; // Amount from counterparty
        address predictor; // Predictor address
        address counterparty; // Counterparty address
        address predictorToken; // ERC20 token for predictor position
        address counterpartyToken; // ERC20 token for counterparty position
        bool settled; // Whether prediction has been settled
        SettlementResult result; // Settlement outcome
    }

    /// @notice Session key approval data for ZeroDev integration
    /// @dev Used when a party signs via session key instead of EOA/smart account directly
    struct SessionKeyData {
        address sessionKey; // The session key address that signed
        address owner; // The owner who authorized this session key
        uint256 validUntil; // Expiration timestamp for the session key
        bytes32 permissionsHash; // Hash of permissions granted to this session key
        bytes ownerSignature; // Owner's signature authorizing the session key
    }

    /// @notice Mint request data for creating a new prediction
    /// @dev Supports both EOA signatures and session key signatures
    struct MintRequest {
        Pick[] picks; // Canonical ordered picks
        uint256 predictorWager; // Amount from predictor
        uint256 counterpartyWager; // Amount from counterparty
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
    }

    /// @notice Token pair for a prediction
    struct TokenPair {
        address predictorToken;
        address counterpartyToken;
    }

    /// @notice Escrow record for a prediction
    struct EscrowRecord {
        uint256 totalCollateral; // predictorWager + counterpartyWager
        uint256 predictorWager; // Original predictor wager
        uint256 counterpartyWager; // Original counterparty wager
        uint256 predictorTokenClaimable; // Total claimable by predictor token holders
        uint256 counterpartyTokenClaimable; // Total claimable by counterparty token holders
        bool settled; // Whether escrow has been settled
    }
}
