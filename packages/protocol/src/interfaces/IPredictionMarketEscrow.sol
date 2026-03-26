// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IV2Types.sol";

/**
 * @title IPredictionMarketEscrow
 * @notice Interface for the V2 Prediction Market orchestrator
 * @dev Main entry point for mint, settle, and redeem operations.
 *      Uses fungible prediction pools - same picks share tokens.
 */
interface IPredictionMarketEscrow {
    // ============ Errors ============

    error InvalidPredictorSignature();
    error InvalidCounterpartSignature();
    error ExpiredDeadline();
    error NonceAlreadyUsed();
    error PredictionNotFound();
    error PredictionNotSettled();
    error PredictionAlreadySettled();
    error PredictionNotResolvable();
    error PickConfigNotResolved();
    error InvalidPicks();
    error DuplicatePick();
    error PicksNotCanonical();
    error ZeroAmount();
    error InvalidToken();
    error InvalidRecipient();
    error TokensStillOutstanding(
        uint256 predictorSupply, uint256 counterpartySupply
    );
    error NoDustToSweep();
    error ResolverCallFailed(address resolver, bytes conditionId);
    error PickConfigAlreadyResolved();
    error InvalidBurnAmounts();
    error AsymmetricBurn();
    error SponsorUnderfunded();

    // ============ External Functions ============

    /// @notice Revoke a session key so it can no longer be used for signing
    /// @param sessionKey The session key address to revoke
    function revokeSessionKey(address sessionKey) external;

    /// @notice Check if a session key has been revoked by an owner
    /// @param owner The owner who may have revoked the key
    /// @param sessionKey The session key to check
    /// @return revoked True if the session key is revoked
    function isSessionKeyRevoked(address owner, address sessionKey)
        external
        view
        returns (bool revoked);

    /// @notice Create a new prediction with both parties' signatures
    /// @param request The mint request containing picks, collateral amounts, and signatures
    /// @return predictionId The unique prediction identifier
    /// @return predictorToken Address of the predictor position token (may be existing)
    /// @return counterpartyToken Address of the counterparty position token (may be existing)
    function mint(IV2Types.MintRequest calldata request)
        external
        returns (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken
        );

    /// @notice Burn positions bilaterally before resolution
    /// @param request The burn request containing token amounts, payouts, and signatures
    /// @dev Both holders must sign. Conservation: predictorPayout + counterpartyPayout == predictorTokenAmount + counterpartyTokenAmount
    function burn(IV2Types.BurnRequest calldata request) external;

    /// @notice Settle a prediction based on condition resolver outcomes
    /// @param predictionId The prediction to settle
    /// @param refCode Referral code for integrator tracking
    /// @dev Anyone can call this once all picks are resolved
    function settle(bytes32 predictionId, bytes32 refCode) external;

    /// @notice Redeem position tokens for collateral
    /// @param positionToken The position token to redeem
    /// @param amount Amount of tokens to redeem
    /// @param refCode Referral code for integrator tracking
    /// @return payout Amount of collateral received
    function redeem(address positionToken, uint256 amount, bytes32 refCode)
        external
        returns (uint256 payout);

    // ============ View Functions ============

    /// @notice Get prediction data
    /// @param predictionId The prediction identifier
    /// @return prediction The prediction data
    function getPrediction(bytes32 predictionId)
        external
        view
        returns (IV2Types.Prediction memory prediction);

    /// @notice Get the pick configuration for a set of picks
    /// @param pickConfigId The pick configuration identifier
    /// @return config The pick configuration data
    function getPickConfiguration(bytes32 pickConfigId)
        external
        view
        returns (IV2Types.PickConfiguration memory config);

    /// @notice Get the token pair for a pick configuration
    /// @param pickConfigId The pick configuration identifier
    /// @return tokenPair The predictor and counterparty token addresses
    function getTokenPair(bytes32 pickConfigId)
        external
        view
        returns (IV2Types.TokenPair memory tokenPair);

    /// @notice Check if a specific nonce has been used
    /// @param account The account address
    /// @param nonce The nonce to check
    /// @return used True if the nonce has been used
    function isNonceUsed(address account, uint256 nonce)
        external
        view
        returns (bool used);

    /// @notice Get the raw bitmap word for a nonce word position
    /// @param account The account address
    /// @param wordPos The word position (nonce >> 8)
    /// @return word The bitmap word
    function nonceBitmap(address account, uint256 wordPos)
        external
        view
        returns (uint256 word);

    /// @notice Check if a prediction can be settled
    /// @param predictionId The prediction identifier
    /// @return canSettle True if the prediction can be settled
    function canSettle(bytes32 predictionId)
        external
        view
        returns (bool canSettle);

    /// @notice Get the picks for a pick configuration
    /// @param pickConfigId The pick configuration identifier
    /// @return picks The array of picks
    function getPicks(bytes32 pickConfigId)
        external
        view
        returns (IV2Types.Pick[] memory picks);

    /// @notice Calculate the required counterparty token amount for a symmetric
    ///         burn given a predictor token amount, or vice versa.
    /// @param pickConfigId The pick configuration identifier
    /// @param tokenAmount The known token amount (for one side)
    /// @param isPredictor True if tokenAmount is the predictor side amount,
    ///        false if it is the counterparty side amount
    /// @return counterpartAmount The required amount for the other side
    function getSymmetricBurnAmount(
        bytes32 pickConfigId,
        uint256 tokenAmount,
        bool isPredictor
    ) external view returns (uint256 counterpartAmount);

    /// @notice Compute the pick configuration ID for a set of picks
    /// @param picks The array of picks
    /// @return pickConfigId The computed pick configuration identifier
    function computePickConfigId(IV2Types.Pick[] calldata picks)
        external
        pure
        returns (bytes32 pickConfigId);

    /// @notice Validate a party's mint signature off-chain (same logic as on-chain validation)
    /// @param predictionHash Hash of the prediction parameters
    /// @param signer Expected signer address
    /// @param collateral Collateral amount for this signer
    /// @param nonce Nonce for replay protection
    /// @param deadline Signature expiration timestamp
    /// @param signature The EIP-712 signature
    /// @param sessionKeyData ABI-encoded SessionKeyData (empty if EOA)
    /// @return isValid True if the signature is valid
    function verifyMintPartySignature(
        bytes32 predictionHash,
        address signer,
        uint256 collateral,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature,
        bytes calldata sessionKeyData
    ) external view returns (bool isValid);

    /// @notice Validate a party's burn signature off-chain (same logic as on-chain validation)
    /// @param burnHash Hash of the burn parameters
    /// @param signer Expected signer address
    /// @param tokenAmount Token amount for this signer
    /// @param payout Payout amount for this signer
    /// @param nonce Nonce for replay protection
    /// @param deadline Signature expiration timestamp
    /// @param signature The EIP-712 signature
    /// @param sessionKeyData ABI-encoded SessionKeyData (empty if EOA)
    /// @return isValid True if the signature is valid
    function verifyBurnPartySignature(
        bytes32 burnHash,
        address signer,
        uint256 tokenAmount,
        uint256 payout,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature,
        bytes calldata sessionKeyData
    ) external view returns (bool isValid);
}
