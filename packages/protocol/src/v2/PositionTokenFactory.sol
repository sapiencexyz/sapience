// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./PositionToken.sol";
import "./interfaces/IPositionTokenFactory.sol";
import "./interfaces/IV2Types.sol";

/**
 * @title PositionTokenFactory
 * @notice Factory for creating position token pairs using CREATE2
 * @dev Uses deterministic addresses to enable same address on multiple chains
 */
contract PositionTokenFactory is IPositionTokenFactory {
    /// @notice The prediction market contract authorized to create tokens
    address public immutable market;

    /// @notice The escrow contract that can burn tokens
    address public immutable escrow;

    /// @notice Mapping from predictionId to token pair
    mapping(bytes32 => IV2Types.TokenPair) private _tokenPairs;

    /// @notice Mapping from token address to predictionId
    mapping(address => bytes32) private _tokenToPrediction;

    /// @notice Mapping from token address to whether it's a predictor token
    mapping(address => bool) private _isPredictorToken;

    /// @notice Set of valid position tokens
    mapping(address => bool) private _isPositionToken;

    error Unauthorized();
    error TokenPairAlreadyExists();
    error TokenNotFound();

    /// @notice Create a new factory
    /// @param market_ The prediction market contract
    /// @param escrow_ The escrow contract
    constructor(address market_, address escrow_) {
        market = market_;
        escrow = escrow_;
    }

    /// @inheritdoc IPositionTokenFactory
    function createTokenPair(bytes32 predictionId, address predictor, address counterparty)
        external
        returns (address predictorToken, address counterpartyToken)
    {
        if (msg.sender != market) {
            revert Unauthorized();
        }
        if (_tokenPairs[predictionId].predictorToken != address(0)) {
            revert TokenPairAlreadyExists();
        }

        // Create predictor token with CREATE2
        bytes32 predictorSalt = keccak256(abi.encode(predictionId, true));
        predictorToken = address(
            new PositionToken{salt: predictorSalt}(
                _generateTokenName(predictionId, true),
                _generateTokenSymbol(predictionId, true),
                predictionId,
                true,
                predictor,
                escrow
            )
        );

        // Create counterparty token with CREATE2
        bytes32 counterpartySalt = keccak256(abi.encode(predictionId, false));
        counterpartyToken = address(
            new PositionToken{salt: counterpartySalt}(
                _generateTokenName(predictionId, false),
                _generateTokenSymbol(predictionId, false),
                predictionId,
                false,
                counterparty,
                escrow
            )
        );

        // Store mappings
        _tokenPairs[predictionId] = IV2Types.TokenPair(predictorToken, counterpartyToken);
        _tokenToPrediction[predictorToken] = predictionId;
        _tokenToPrediction[counterpartyToken] = predictionId;
        _isPredictorToken[predictorToken] = true;
        _isPredictorToken[counterpartyToken] = false;
        _isPositionToken[predictorToken] = true;
        _isPositionToken[counterpartyToken] = true;
    }

    /// @inheritdoc IPositionTokenFactory
    function getTokenPair(bytes32 predictionId) external view returns (IV2Types.TokenPair memory tokenPair) {
        return _tokenPairs[predictionId];
    }

    /// @inheritdoc IPositionTokenFactory
    function computeTokenAddresses(bytes32 predictionId)
        external
        view
        returns (address predictorToken, address counterpartyToken)
    {
        bytes32 predictorSalt = keccak256(abi.encode(predictionId, true));
        bytes32 counterpartySalt = keccak256(abi.encode(predictionId, false));

        predictorToken = _computeAddress(
            predictorSalt,
            _generateTokenName(predictionId, true),
            _generateTokenSymbol(predictionId, true),
            predictionId,
            true,
            address(0) // predictor address unknown at compute time
        );

        counterpartyToken = _computeAddress(
            counterpartySalt,
            _generateTokenName(predictionId, false),
            _generateTokenSymbol(predictionId, false),
            predictionId,
            false,
            address(0) // counterparty address unknown at compute time
        );
    }

    /// @inheritdoc IPositionTokenFactory
    function getPredictionId(address token) external view returns (bytes32 predictionId) {
        predictionId = _tokenToPrediction[token];
        if (predictionId == bytes32(0) && !_isPositionToken[token]) {
            revert TokenNotFound();
        }
    }

    /// @inheritdoc IPositionTokenFactory
    function isPositionToken(address token) external view returns (bool isValid) {
        return _isPositionToken[token];
    }

    /// @inheritdoc IPositionTokenFactory
    function isPredictorToken(address token) external view returns (bool isPredictor) {
        if (!_isPositionToken[token]) {
            revert TokenNotFound();
        }
        return _isPredictorToken[token];
    }

    /// @notice Generate token name
    function _generateTokenName(bytes32 predictionId, bool isPredictor) internal pure returns (string memory) {
        string memory prefix = isPredictor ? "Predictor-" : "Counterparty-";
        return string(abi.encodePacked(prefix, _bytes32ToHexString(predictionId)));
    }

    /// @notice Generate token symbol
    function _generateTokenSymbol(bytes32 predictionId, bool isPredictor) internal pure returns (string memory) {
        string memory prefix = isPredictor ? "PRD-" : "CTR-";
        // Use first 4 bytes of predictionId for symbol
        bytes4 short = bytes4(predictionId);
        return string(abi.encodePacked(prefix, _bytes4ToHexString(short)));
    }

    /// @notice Convert bytes32 to hex string
    function _bytes32ToHexString(bytes32 data) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(8); // Only first 4 bytes (8 hex chars)
        for (uint256 i = 0; i < 4; i++) {
            str[i * 2] = alphabet[uint8(data[i] >> 4)];
            str[i * 2 + 1] = alphabet[uint8(data[i] & 0x0f)];
        }
        return string(str);
    }

    /// @notice Convert bytes4 to hex string
    function _bytes4ToHexString(bytes4 data) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(8);
        for (uint256 i = 0; i < 4; i++) {
            str[i * 2] = alphabet[uint8(data[i] >> 4)];
            str[i * 2 + 1] = alphabet[uint8(data[i] & 0x0f)];
        }
        return string(str);
    }

    /// @notice Compute CREATE2 address (simplified - actual deployment may differ)
    function _computeAddress(
        bytes32 salt,
        string memory name,
        string memory symbol,
        bytes32 predictionId,
        bool isPredictor,
        address recipient
    ) internal view returns (address) {
        bytes memory bytecode = abi.encodePacked(
            type(PositionToken).creationCode,
            abi.encode(name, symbol, predictionId, isPredictor, recipient, escrow)
        );
        bytes32 hash = keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(bytecode)));
        return address(uint160(uint256(hash)));
    }
}
