// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "./interfaces/ISecondaryMarketEscrow.sol";
import "./utils/ECDSAHelper.sol";

/**
 * @title SecondaryMarketEscrow
 * @notice Permissionless atomic OTC swap for V2 position tokens.
 * @dev No ownership, no funds at rest. Both parties sign off-chain via EIP-712
 *      and anyone can submit the trade. Signatures are accepted from EOAs
 *      (ECDSA) and from smart accounts via ERC-1271 (`isValidSignature`). The
 *      legacy `sessionKeyData` blob path was removed because its factory
 *      CREATE2 derivation could not see Kernel validator rotations; smart
 *      accounts using session keys must now sign through the account itself.
 *      Supplying any non-empty `sessionKeyData` reverts with
 *      `LegacySessionKeyDataDisabled`.
 *
 *      The session-key revocation registry below is preserved as an advisory,
 *      caller-scoped on-chain log for off-chain tooling. The contract no
 *      longer reads it during signature validation.
 */
contract SecondaryMarketEscrow is
    ISecondaryMarketEscrow,
    EIP712("SecondaryMarketEscrow", "1"),
    ReentrancyGuard
{
    using SafeERC20 for IERC20;

    // ============ Constants ============

    /// @notice EIP-712 typehash for trade approval
    bytes32 public constant TRADE_APPROVAL_TYPEHASH = keccak256(
        "TradeApproval(bytes32 tradeHash,address signer,uint256 nonce,uint256 deadline)"
    );

    /// @notice Gas limit for EIP-1271 signature validation calls
    uint256 internal constant EIP1271_GAS_LIMIT = 500_000;

    // ============ State ============

    /// @notice Bitmap nonces for replay protection (Permit2-style)
    mapping(address => mapping(uint256 => uint256)) private _nonceBitmap;

    /// @notice Advisory revocation registry: caller => sessionKey =>
    ///         revokedAt timestamp. Not consulted by signature validation.
    mapping(address => mapping(address => uint256)) private _revokedSessionKeys;

    // ============ Session Key Management ============

    /// @inheritdoc ISecondaryMarketEscrow
    function revokeSessionKey(address sessionKey) external {
        _revokedSessionKeys[msg.sender][sessionKey] = block.timestamp;
        emit SessionKeyRevoked(msg.sender, sessionKey, block.timestamp);
    }

    /// @inheritdoc ISecondaryMarketEscrow
    function isSessionKeyRevoked(address caller, address sessionKey)
        external
        view
        returns (bool revoked)
    {
        return _revokedSessionKeys[caller][sessionKey] > 0;
    }

    // ============ External Functions ============

    /// @inheritdoc ISecondaryMarketEscrow
    function executeTrade(TradeRequest calldata request) external nonReentrant {
        // Validate basic parameters
        if (request.tokenAmount == 0 || request.price == 0) {
            revert ZeroAmount();
        }
        if (request.seller == request.buyer) {
            revert SellerBuyerSame();
        }

        // Compute trade hash
        bytes32 tradeHash = keccak256(
            abi.encode(
                request.token,
                request.collateral,
                request.seller,
                request.buyer,
                request.tokenAmount,
                request.price
            )
        );

        // Validate seller signature
        if (!_validatePartySignature(
                tradeHash,
                request.seller,
                request.sellerNonce,
                request.sellerDeadline,
                request.sellerSignature,
                request.sellerSessionKeyData
            )) {
            revert InvalidSignature();
        }
        // Validate buyer signature
        if (!_validatePartySignature(
                tradeHash,
                request.buyer,
                request.buyerNonce,
                request.buyerDeadline,
                request.buyerSignature,
                request.buyerSessionKeyData
            )) {
            revert InvalidSignature();
        }

        // Use bitmap nonces (reverts if already used)
        _useNonce(request.seller, request.sellerNonce);
        _useNonce(request.buyer, request.buyerNonce);

        // Execute atomic swap
        // 1. Transfer position tokens from seller to buyer
        IERC20(request.token)
            .safeTransferFrom(
                request.seller, request.buyer, request.tokenAmount
            );

        // 2. Transfer collateral from buyer to seller
        IERC20(request.collateral)
            .safeTransferFrom(request.buyer, request.seller, request.price);

        emit TradeExecuted(
            tradeHash,
            request.seller,
            request.buyer,
            request.token,
            request.collateral,
            request.tokenAmount,
            request.price,
            request.refCode
        );
    }

    // ============ View Functions ============

    /// @inheritdoc ISecondaryMarketEscrow
    function isNonceUsed(address account, uint256 nonce)
        external
        view
        returns (bool used)
    {
        uint256 wordPos = nonce >> 8;
        uint256 bitPos = nonce & 0xff;
        return (_nonceBitmap[account][wordPos] & (1 << bitPos)) != 0;
    }

    /// @inheritdoc ISecondaryMarketEscrow
    function nonceBitmap(address account, uint256 wordPos)
        external
        view
        returns (uint256 word)
    {
        return _nonceBitmap[account][wordPos];
    }

    /// @inheritdoc ISecondaryMarketEscrow
    function domainSeparator() external view returns (bytes32 separator) {
        return _domainSeparatorV4();
    }

    /// @inheritdoc ISecondaryMarketEscrow
    function getTradeHash(
        address token,
        address collateral,
        address seller,
        address buyer,
        uint256 tokenAmount,
        uint256 price
    ) public pure returns (bytes32 tradeHash) {
        return keccak256(
            abi.encode(token, collateral, seller, buyer, tokenAmount, price)
        );
    }

    /// @inheritdoc ISecondaryMarketEscrow
    function getTradeApprovalHash(
        bytes32 tradeHash,
        address signer,
        uint256 nonce,
        uint256 deadline
    ) public view returns (bytes32 hash) {
        bytes32 structHash = keccak256(
            abi.encode(
                TRADE_APPROVAL_TYPEHASH, tradeHash, signer, nonce, deadline
            )
        );
        return _hashTypedDataV4(structHash);
    }

    // ============ Internal: Nonce Management ============

    /// @notice Mark a nonce as used (Permit2-style bitmap)
    /// @param account The account whose nonce to use
    /// @param nonce The nonce value to consume
    function _useNonce(address account, uint256 nonce) internal {
        uint256 wordPos = nonce >> 8;
        uint256 bitPos = nonce & 0xff;
        uint256 bit = 1 << bitPos;
        uint256 word = _nonceBitmap[account][wordPos];
        if (word & bit != 0) revert NonceAlreadyUsed();
        _nonceBitmap[account][wordPos] = word | bit;
    }

    // ============ Internal: Signature Validation ============

    /// @notice Validate a party's signature.
    /// @dev Accepts an EOA ECDSA signature or a smart-account ERC-1271
    /// signature. The legacy `sessionKeyData` blob path is no longer supported
    /// — supplying a non-empty blob reverts with `LegacySessionKeyDataDisabled`.
    /// Smart accounts using session keys must have the session key authorized
    /// via the smart account's own validator (e.g. Kernel permission validator)
    /// so `isValidSignature` returns the magic value.
    function _validatePartySignature(
        bytes32 tradeHash,
        address signer,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature,
        bytes calldata sessionKeyData
    ) internal view returns (bool isValid) {
        if (sessionKeyData.length != 0) {
            revert LegacySessionKeyDataDisabled();
        }
        return _isTradeApprovalValidWithEIP1271Fallback(
            tradeHash, signer, nonce, deadline, signature
        );
    }

    /// @notice Validate trade approval via ECDSA
    function _isTradeApprovalValid(
        bytes32 tradeHash,
        address signer,
        uint256 nonce,
        uint256 deadline,
        bytes memory signature
    ) internal view returns (bool isValid) {
        if (block.timestamp > deadline) {
            return false;
        }

        bytes32 hash = getTradeApprovalHash(tradeHash, signer, nonce, deadline);
        return ECDSAHelper.isValidECDSASignature(hash, signature, signer);
    }

    /// @notice Validate trade approval with EIP-1271 fallback for smart contracts
    function _isTradeApprovalValidWithEIP1271Fallback(
        bytes32 tradeHash,
        address signer,
        uint256 nonce,
        uint256 deadline,
        bytes memory signature
    ) internal view returns (bool isValid) {
        if (block.timestamp > deadline) {
            return false;
        }

        // Try ECDSA first (for EOAs)
        if (_isTradeApprovalValid(
                tradeHash, signer, nonce, deadline, signature
            )) {
            return true;
        }

        // Fallback to EIP-1271 for contracts
        if (signer.code.length > 0) {
            bytes32 hash =
                getTradeApprovalHash(tradeHash, signer, nonce, deadline);
            return _isEIP1271SignatureValid(signer, hash, signature);
        }

        return false;
    }

    /// @notice Validate signature using EIP-1271 (for smart contract signers)
    function _isEIP1271SignatureValid(
        address signer,
        bytes32 hash,
        bytes memory signature
    ) internal view returns (bool isValid) {
        if (signer.code.length == 0) {
            return false;
        }
        try IERC1271(signer).isValidSignature{ gas: EIP1271_GAS_LIMIT }(
            hash, signature
        ) returns (
            bytes4 magicValue
        ) {
            return magicValue == IERC1271.isValidSignature.selector;
        } catch {
            return false;
        }
    }
}
