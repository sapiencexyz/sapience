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

    /// @notice Mint request data for creating a new prediction
    struct MintRequest {
        Pick[] picks; // Canonical ordered picks
        uint256 predictorWager; // Amount from predictor
        uint256 counterpartyWager; // Amount from counterparty
        address predictor; // Predictor address
        address counterparty; // Counterparty address
        uint256 predictorNonce; // Nonce for predictor signature
        uint256 counterpartyNonce; // Nonce for counterparty signature
        uint256 predictorDeadline; // Deadline for predictor signature
        uint256 counterpartyDeadline; // Deadline for counterparty signature
        bytes predictorSignature; // EIP-712 signature from predictor
        bytes counterpartySignature; // EIP-712 signature from counterparty
        bytes32 refCode; // Referral code
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
