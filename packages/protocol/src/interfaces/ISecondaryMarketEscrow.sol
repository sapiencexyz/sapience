// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ISecondaryMarketEscrow
 * @notice Interface for atomic OTC trades of V2 position tokens
 * @dev Permissionless, ownerless atomic swap: seller sends position tokens,
 *      buyer sends collateral, both sign off-chain via EIP-712.
 */
interface ISecondaryMarketEscrow {
    // ============ Structs ============

    /// @notice Trade request data for an atomic OTC swap
    /// @dev Both seller and buyer sign off-chain; anyone can submit the trade.
    ///      Signatures may be ECDSA (EOA) or ERC-1271 payloads validated by
    ///      the signer's smart account. The legacy `sessionKeyData` blob path
    ///      (factory CREATE2 derivation as proof of authority) was removed —
    ///      both `*SessionKeyData` fields must be empty (`"0x"`); any
    ///      non-empty value causes `executeTrade` to revert with
    ///      `LegacySessionKeyDataDisabled`.
    struct TradeRequest {
        address token; // Position token being sold
        address collateral; // Collateral token (payment)
        address seller; // Seller of position tokens
        address buyer; // Buyer of position tokens
        uint256 tokenAmount; // Amount of position tokens to transfer
        uint256 price; // Amount of collateral to transfer
        uint256 sellerNonce; // Nonce for seller signature
        uint256 buyerNonce; // Nonce for buyer signature
        uint256 sellerDeadline; // Deadline for seller signature
        uint256 buyerDeadline; // Deadline for buyer signature
        bytes sellerSignature; // ECDSA (EOA) or ERC-1271 (smart account) sig
        bytes buyerSignature; // ECDSA (EOA) or ERC-1271 (smart account) sig
        bytes32 refCode; // Referral code
        bytes sellerSessionKeyData; // Must be "0x" (legacy path disabled)
        bytes buyerSessionKeyData; // Must be "0x" (legacy path disabled)
    }

    // ============ Events ============

    /// @notice Emitted when a trade is executed
    /// @param tradeHash Hash of the trade parameters (indexed)
    /// @param seller The seller address (indexed)
    /// @param buyer The buyer address (indexed)
    /// @param token The position token traded
    /// @param collateral The collateral token used for payment
    /// @param tokenAmount Amount of position tokens transferred
    /// @param price Amount of collateral transferred
    /// @param refCode Referral code
    event TradeExecuted(
        bytes32 indexed tradeHash,
        address indexed seller,
        address indexed buyer,
        address token,
        address collateral,
        uint256 tokenAmount,
        uint256 price,
        bytes32 refCode
    );

    /// @notice Emitted when a session key is recorded as revoked in the
    ///         on-chain advisory registry. The contract no longer enforces
    ///         this mapping during signature validation.
    event SessionKeyRevoked(
        address indexed caller, address indexed sessionKey, uint256 revokedAt
    );

    // ============ Errors ============

    error InvalidSignature();
    error NonceAlreadyUsed();
    error ZeroAmount();
    error SellerBuyerSame();
    /// @notice Reverts when an `executeTrade` request supplies the legacy
    /// session-key data blob. The path validated authority via factory CREATE2
    /// derivation, which cannot reflect a smart account's current Kernel
    /// validator/owner. Smart-account session keys must now sign through the
    /// account itself so ERC-1271 (`isValidSignature`) returns the magic value.
    error LegacySessionKeyDataDisabled();

    // ============ Functions ============

    /// @notice Record a session-key revocation in the advisory on-chain
    ///         registry. The contract no longer enforces this mapping during
    ///         signature validation; this call exists for off-chain
    ///         observability only.
    /// @param sessionKey The session key address being recorded as revoked
    function revokeSessionKey(address sessionKey) external;

    /// @notice Read from the advisory revocation registry, indexed by the
    ///         caller of `revokeSessionKey`.
    /// @dev Not consulted by on-chain signature validation.
    /// @param caller The address that may have called `revokeSessionKey`
    /// @param sessionKey The session key to check
    /// @return revoked True if a non-zero revocation timestamp is recorded
    function isSessionKeyRevoked(address caller, address sessionKey)
        external
        view
        returns (bool revoked);

    /// @notice Execute an atomic OTC trade
    /// @param request The trade request containing token/collateral addresses, amounts, and signatures
    function executeTrade(TradeRequest calldata request) external;

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

    /// @notice Get the EIP-712 domain separator
    /// @return separator The domain separator
    function domainSeparator() external view returns (bytes32 separator);

    /// @notice Get the trade hash from its input parameters for verification
    /// @param token Position token address
    /// @param collateral Collateral token address
    /// @param seller Seller address
    /// @param buyer Buyer address
    /// @param tokenAmount Amount of position tokens
    /// @param price Amount of collateral
    /// @return tradeHash The computed trade hash
    function getTradeHash(
        address token,
        address collateral,
        address seller,
        address buyer,
        uint256 tokenAmount,
        uint256 price
    ) external pure returns (bytes32 tradeHash);

    /// @notice Get the hash that should be signed for trade approval
    /// @param tradeHash Hash of the trade parameters
    /// @param signer Signer address
    /// @param nonce Nonce
    /// @param deadline Deadline timestamp
    /// @return hash The EIP-712 typed data hash to sign
    function getTradeApprovalHash(
        bytes32 tradeHash,
        address signer,
        uint256 nonce,
        uint256 deadline
    ) external view returns (bytes32 hash);
}
