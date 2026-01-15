// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./PositionToken.sol";
import "./interfaces/IPredictionMarketV2.sol";
import "./interfaces/IConditionResolver.sol";
import "./interfaces/IPositionToken.sol";
import "./interfaces/IV2Types.sol";
import "./interfaces/IV2Events.sol";
import "./utils/SignatureValidator.sol";

/**
 * @title PredictionMarketV2
 * @notice Unified prediction market contract combining market, escrow, and token factory
 * @dev Handles mint, settle, redeem with integrated collateral management and token creation
 */
contract PredictionMarketV2 is IPredictionMarketV2, IV2Events, ReentrancyGuard, SignatureValidator {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    /// @notice Fixed supply for position tokens
    uint256 public constant POSITION_TOKEN_SUPPLY = 1e18;

    // ============ Immutables ============

    /// @notice The collateral token (WUSDe)
    IERC20 public immutable collateralToken;

    // ============ State: Predictions ============

    /// @notice Mapping from predictionId to prediction data
    mapping(bytes32 => IV2Types.Prediction) private _predictions;

    /// @notice Mapping from predictionId to picks array
    mapping(bytes32 => IV2Types.Pick[]) private _predictionPicks;

    /// @notice Nonces for replay protection (per account)
    mapping(address => uint256) private _nonces;

    // ============ State: Escrow ============

    /// @notice Escrow records by prediction ID
    mapping(bytes32 => IV2Types.EscrowRecord) private _escrowRecords;

    // ============ State: Token Factory ============

    /// @notice Mapping from predictionId to token pair
    mapping(bytes32 => IV2Types.TokenPair) private _tokenPairs;

    /// @notice Mapping from token address to predictionId
    mapping(address => bytes32) private _tokenToPrediction;

    /// @notice Mapping from token address to whether it's a predictor token
    mapping(address => bool) private _isPredictorToken;

    /// @notice Set of valid position tokens
    mapping(address => bool) private _isPositionToken;

    // ============ Constructor ============

    /// @notice Create a new prediction market
    /// @param collateralToken_ The collateral token address (WUSDe)
    constructor(address collateralToken_) {
        collateralToken = IERC20(collateralToken_);
    }

    // ============ External Functions: Market ============

    /// @inheritdoc IPredictionMarketV2
    function mint(IV2Types.MintRequest calldata request)
        external
        nonReentrant
        returns (bytes32 predictionId, address predictorToken, address counterpartyToken)
    {
        // Validate basic parameters
        if (request.picks.length == 0) {
            revert InvalidPicks();
        }
        if (request.predictorWager == 0 || request.counterpartyWager == 0) {
            revert ZeroWager();
        }

        // Validate picks (canonical order, no duplicates, valid conditions)
        _validatePicks(request.picks);

        // Compute prediction ID from canonical picks
        predictionId = _computePredictionId(request.picks);

        // Check prediction doesn't already exist
        if (_predictions[predictionId].predictorToken != address(0)) {
            revert PredictionAlreadyExists();
        }

        // Compute prediction hash for signatures (includes wagers and addresses)
        bytes32 predictionHash = keccak256(
            abi.encode(predictionId, request.predictorWager, request.counterpartyWager, request.predictor, request.counterparty)
        );

        // Validate predictor signature (EOA or session key)
        if (!_validatePartySignature(
            predictionHash,
            request.predictor,
            request.predictorWager,
            request.predictorNonce,
            request.predictorDeadline,
            request.predictorSignature,
            request.predictorSessionKeyData
        )) {
            revert InvalidSignature();
        }
        if (request.predictorNonce != _nonces[request.predictor]) {
            revert InvalidNonce();
        }

        // Validate counterparty signature (EOA or session key)
        if (!_validatePartySignature(
            predictionHash,
            request.counterparty,
            request.counterpartyWager,
            request.counterpartyNonce,
            request.counterpartyDeadline,
            request.counterpartySignature,
            request.counterpartySessionKeyData
        )) {
            revert InvalidSignature();
        }
        if (request.counterpartyNonce != _nonces[request.counterparty]) {
            revert InvalidNonce();
        }

        // Increment nonces
        _nonces[request.predictor]++;
        _nonces[request.counterparty]++;

        // Deposit collateral (internal)
        _depositCollateral(
            predictionId,
            request.predictorWager,
            request.counterpartyWager,
            request.predictor,
            request.counterparty
        );

        // Create position tokens (internal)
        (predictorToken, counterpartyToken) = _createTokenPair(
            predictionId,
            request.predictor,
            request.counterparty
        );

        // Store prediction data
        _predictions[predictionId] = IV2Types.Prediction({
            predictionId: predictionId,
            predictorWager: request.predictorWager,
            counterpartyWager: request.counterpartyWager,
            predictor: request.predictor,
            counterparty: request.counterparty,
            predictorToken: predictorToken,
            counterpartyToken: counterpartyToken,
            settled: false,
            result: IV2Types.SettlementResult.UNRESOLVED
        });

        // Store picks
        for (uint256 i = 0; i < request.picks.length; i++) {
            _predictionPicks[predictionId].push(request.picks[i]);
        }

        emit PredictionCreated(
            predictionId,
            request.predictor,
            request.counterparty,
            predictorToken,
            counterpartyToken,
            request.predictorWager,
            request.counterpartyWager,
            request.refCode
        );
    }

    /// @inheritdoc IPredictionMarketV2
    function settle(bytes32 predictionId, bytes32 refCode) external nonReentrant {
        IV2Types.Prediction storage prediction = _predictions[predictionId];

        if (prediction.predictorToken == address(0)) {
            revert PredictionNotFound();
        }
        if (prediction.settled) {
            revert PredictionAlreadySettled();
        }

        // Resolve the prediction using integrated parlay logic
        (bool canResolve, IV2Types.SettlementResult result) = _resolvePrediction(predictionId);

        if (!canResolve) {
            revert PredictionNotResolvable();
        }

        // Record settlement (internal)
        (uint256 predictorClaimable, uint256 counterpartyClaimable) = _recordSettlement(
            predictionId,
            result,
            prediction.predictorWager,
            prediction.counterpartyWager
        );

        // Update prediction state
        prediction.settled = true;
        prediction.result = result;

        emit PredictionSettled(predictionId, result, predictorClaimable, counterpartyClaimable, refCode);
    }

    /// @inheritdoc IPredictionMarketV2
    function redeem(address positionToken, uint256 amount, bytes32 refCode) external nonReentrant returns (uint256 payout) {
        if (!_isPositionToken[positionToken]) {
            revert InvalidToken();
        }

        bytes32 predictionId = _tokenToPrediction[positionToken];
        IV2Types.Prediction storage prediction = _predictions[predictionId];

        if (!prediction.settled) {
            revert PredictionNotSettled();
        }

        // Calculate and transfer payout (internal)
        payout = _redeemTokens(predictionId, positionToken, msg.sender, amount, refCode);
    }

    // ============ View Functions ============

    /// @inheritdoc IPredictionMarketV2
    function getPrediction(bytes32 predictionId) external view returns (IV2Types.Prediction memory prediction) {
        return _predictions[predictionId];
    }

    /// @inheritdoc IPredictionMarketV2
    function getTokenPair(bytes32 predictionId) external view returns (IV2Types.TokenPair memory tokenPair) {
        return _tokenPairs[predictionId];
    }

    /// @inheritdoc IPredictionMarketV2
    function getNonce(address account) external view returns (uint256 nonce) {
        return _nonces[account];
    }

    /// @inheritdoc IPredictionMarketV2
    function canSettle(bytes32 predictionId) external view returns (bool) {
        IV2Types.Prediction storage prediction = _predictions[predictionId];
        if (prediction.predictorToken == address(0) || prediction.settled) {
            return false;
        }
        (bool canResolve,) = _resolvePrediction(predictionId);
        return canResolve;
    }

    /// @inheritdoc IPredictionMarketV2
    function getPicks(bytes32 predictionId) external view returns (IV2Types.Pick[] memory picks) {
        return _predictionPicks[predictionId];
    }

    /// @notice Get the escrow record for a prediction
    function getEscrowRecord(bytes32 predictionId) external view returns (IV2Types.EscrowRecord memory record) {
        return _escrowRecords[predictionId];
    }

    /// @notice Calculate claimable amount for a given token amount
    function getClaimableAmount(bytes32 predictionId, address positionToken, uint256 tokenAmount)
        external
        view
        returns (uint256 claimable)
    {
        IV2Types.EscrowRecord storage record = _escrowRecords[predictionId];
        if (!record.settled || tokenAmount == 0) {
            return 0;
        }

        bool isPredictor = _isPredictorToken[positionToken];
        uint256 claimablePool = isPredictor ? record.predictorTokenClaimable : record.counterpartyTokenClaimable;

        return (tokenAmount * claimablePool) / POSITION_TOKEN_SUPPLY;
    }

    /// @notice Check if an address is a valid position token
    function isPositionToken(address token) external view returns (bool) {
        return _isPositionToken[token];
    }

    /// @notice Check if a token is a predictor token
    function isPredictorToken(address token) external view returns (bool) {
        return _isPredictorToken[token];
    }

    /// @notice Get prediction ID from token address
    function getPredictionIdFromToken(address token) external view returns (bytes32) {
        return _tokenToPrediction[token];
    }

    // ============ Internal: Escrow ============

    /// @notice Deposit collateral from both parties
    function _depositCollateral(
        bytes32 predictionId,
        uint256 predictorWager,
        uint256 counterpartyWager,
        address predictor,
        address counterparty
    ) internal {
        uint256 totalCollateral = predictorWager + counterpartyWager;

        // Transfer collateral from both parties
        collateralToken.safeTransferFrom(predictor, address(this), predictorWager);
        collateralToken.safeTransferFrom(counterparty, address(this), counterpartyWager);

        // Store escrow record
        _escrowRecords[predictionId] = IV2Types.EscrowRecord({
            totalCollateral: totalCollateral,
            predictorWager: predictorWager,
            counterpartyWager: counterpartyWager,
            predictorTokenClaimable: 0,
            counterpartyTokenClaimable: 0,
            settled: false
        });

        emit CollateralDeposited(predictionId, totalCollateral);
    }

    /// @notice Record settlement and assign claimable amounts
    function _recordSettlement(
        bytes32 predictionId,
        IV2Types.SettlementResult result,
        uint256 predictorWager,
        uint256 counterpartyWager
    ) internal returns (uint256 predictorClaimable, uint256 counterpartyClaimable) {
        IV2Types.EscrowRecord storage record = _escrowRecords[predictionId];
        uint256 totalCollateral = record.totalCollateral;

        if (result == IV2Types.SettlementResult.PREDICTOR_WINS) {
            predictorClaimable = totalCollateral;
            counterpartyClaimable = 0;
        } else if (result == IV2Types.SettlementResult.COUNTERPARTY_WINS) {
            predictorClaimable = 0;
            counterpartyClaimable = totalCollateral;
        } else if (result == IV2Types.SettlementResult.NON_DECISIVE) {
            predictorClaimable = predictorWager;
            counterpartyClaimable = counterpartyWager;
        }

        record.predictorTokenClaimable = predictorClaimable;
        record.counterpartyTokenClaimable = counterpartyClaimable;
        record.settled = true;

        emit CollateralDistributed(predictionId, predictorClaimable, counterpartyClaimable);
    }

    /// @notice Redeem tokens for collateral
    function _redeemTokens(
        bytes32 predictionId,
        address positionToken,
        address holder,
        uint256 tokenAmount,
        bytes32 refCode
    ) internal returns (uint256 payout) {
        if (tokenAmount == 0) {
            revert ZeroWager(); // Reusing error for zero amount
        }

        IV2Types.EscrowRecord storage record = _escrowRecords[predictionId];

        // Calculate payout based on token type
        bool isPredictor = _isPredictorToken[positionToken];
        uint256 claimablePool = isPredictor ? record.predictorTokenClaimable : record.counterpartyTokenClaimable;

        // Proportional payout: (tokenAmount / TOTAL_SUPPLY) * claimablePool
        payout = (tokenAmount * claimablePool) / POSITION_TOKEN_SUPPLY;

        if (payout > 0) {
            // Burn the position tokens
            IPositionToken(positionToken).burn(holder, tokenAmount);

            // Transfer collateral to holder
            collateralToken.safeTransfer(holder, payout);

            emit TokensRedeemed(predictionId, holder, positionToken, tokenAmount, payout, refCode);
        }
    }

    // ============ Internal: Token Factory ============

    /// @notice Create a token pair for a prediction
    function _createTokenPair(
        bytes32 predictionId,
        address predictor,
        address counterparty
    ) internal returns (address predictorToken, address counterpartyToken) {
        // Create predictor token with CREATE2
        bytes32 predictorSalt = keccak256(abi.encode(predictionId, true));
        predictorToken = address(
            new PositionToken{salt: predictorSalt}(
                _generateTokenName(predictionId, true),
                _generateTokenSymbol(predictionId, true),
                predictionId,
                true,
                predictor,
                address(this) // market is the burner
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
                address(this) // market is the burner
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

    /// @notice Generate token name
    function _generateTokenName(bytes32 predictionId, bool isPredictor) internal pure returns (string memory) {
        string memory prefix = isPredictor ? "Predictor-" : "Counterparty-";
        return string(abi.encodePacked(prefix, _bytes32ToHexString(predictionId)));
    }

    /// @notice Generate token symbol
    function _generateTokenSymbol(bytes32 predictionId, bool isPredictor) internal pure returns (string memory) {
        string memory prefix = isPredictor ? "PRD-" : "CTR-";
        bytes4 short = bytes4(predictionId);
        return string(abi.encodePacked(prefix, _bytes4ToHexString(short)));
    }

    /// @notice Convert bytes32 to hex string (first 4 bytes)
    function _bytes32ToHexString(bytes32 data) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(8);
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

    // ============ Internal: Validation ============

    /// @notice Validate picks array (canonical order, no duplicates, valid conditions)
    function _validatePicks(IV2Types.Pick[] calldata picks) internal view {
        for (uint256 i = 0; i < picks.length; i++) {
            // Check condition is valid
            if (!IConditionResolver(picks[i].conditionResolver).isValidCondition(picks[i].conditionId)) {
                revert InvalidPicks();
            }

            // Check for duplicates and canonical ordering
            if (i > 0) {
                IV2Types.Pick calldata prev = picks[i - 1];
                IV2Types.Pick calldata curr = picks[i];

                // Compare (resolver, conditionId) - must be strictly increasing
                if (prev.conditionResolver > curr.conditionResolver) {
                    revert PicksNotCanonical();
                }
                if (prev.conditionResolver == curr.conditionResolver) {
                    if (prev.conditionId >= curr.conditionId) {
                        if (prev.conditionId == curr.conditionId) {
                            revert DuplicatePick();
                        }
                        revert PicksNotCanonical();
                    }
                }
            }
        }
    }

    /// @notice Compute prediction ID from picks
    function _computePredictionId(IV2Types.Pick[] calldata picks) internal pure returns (bytes32) {
        return keccak256(abi.encode(picks));
    }

    // ============ Internal: Resolution ============

    /// @notice Resolve a prediction using integrated parlay logic
    /// @dev Optimized to use batch resolution when all picks use the same resolver
    function _resolvePrediction(bytes32 predictionId)
        internal
        view
        returns (bool canResolve, IV2Types.SettlementResult result)
    {
        IV2Types.Pick[] storage picks = _predictionPicks[predictionId];
        uint256 numPicks = picks.length;

        // Check if all picks use the same resolver (common case for 2-4 picks)
        bool allSameResolver = true;
        address firstResolver = picks[0].conditionResolver;
        for (uint256 i = 1; i < numPicks; i++) {
            if (picks[i].conditionResolver != firstResolver) {
                allSameResolver = false;
                break;
            }
        }

        if (allSameResolver) {
            return _resolveBatch(picks, numPicks, firstResolver);
        } else {
            return _resolveIndividual(picks, numPicks);
        }
    }

    /// @notice Resolve using batch call when all picks use the same resolver
    function _resolveBatch(
        IV2Types.Pick[] storage picks,
        uint256 numPicks,
        address resolver
    ) internal view returns (bool canResolve, IV2Types.SettlementResult result) {
        // Build array of condition IDs
        bytes32[] memory conditionIds = new bytes32[](numPicks);
        for (uint256 i = 0; i < numPicks; i++) {
            conditionIds[i] = picks[i].conditionId;
        }

        // Single batch call to resolver
        (bool[] memory resolved, IV2Types.OutcomeVector[] memory outcomes) =
            IConditionResolver(resolver).getResolutions(conditionIds);

        // Process results
        bool hasNonDecisive = false;
        for (uint256 i = 0; i < numPicks; i++) {
            if (!resolved[i]) {
                return (false, IV2Types.SettlementResult.UNRESOLVED);
            }

            (bool isLoss, bool isNonDecisive) = _evaluatePick(picks[i].predictedOutcome, outcomes[i]);
            if (isLoss) {
                return (true, IV2Types.SettlementResult.COUNTERPARTY_WINS);
            }
            if (isNonDecisive) {
                hasNonDecisive = true;
            }
        }

        if (hasNonDecisive) {
            return (true, IV2Types.SettlementResult.NON_DECISIVE);
        }
        return (true, IV2Types.SettlementResult.PREDICTOR_WINS);
    }

    /// @notice Resolve using individual calls when picks use different resolvers
    function _resolveIndividual(IV2Types.Pick[] storage picks, uint256 numPicks)
        internal
        view
        returns (bool canResolve, IV2Types.SettlementResult result)
    {
        bool hasNonDecisive = false;

        for (uint256 i = 0; i < numPicks; i++) {
            IV2Types.Pick storage pick = picks[i];

            (bool isResolved, IV2Types.OutcomeVector memory outcome) =
                IConditionResolver(pick.conditionResolver).getResolution(pick.conditionId);

            if (!isResolved) {
                return (false, IV2Types.SettlementResult.UNRESOLVED);
            }

            (bool isLoss, bool isNonDecisive) = _evaluatePick(pick.predictedOutcome, outcome);
            if (isLoss) {
                return (true, IV2Types.SettlementResult.COUNTERPARTY_WINS);
            }
            if (isNonDecisive) {
                hasNonDecisive = true;
            }
        }

        if (hasNonDecisive) {
            return (true, IV2Types.SettlementResult.NON_DECISIVE);
        }
        return (true, IV2Types.SettlementResult.PREDICTOR_WINS);
    }

    /// @notice Evaluate a single pick against its outcome
    /// @return isLoss True if predictor decisively lost this pick
    /// @return isNonDecisive True if outcome is a tie
    function _evaluatePick(IV2Types.OutcomeSide predictedOutcome, IV2Types.OutcomeVector memory outcome)
        internal
        pure
        returns (bool isLoss, bool isNonDecisive)
    {
        bool isDecisiveYes = outcome.yesWeight > 0 && outcome.noWeight == 0;
        bool isDecisiveNo = outcome.yesWeight == 0 && outcome.noWeight > 0;

        if (!isDecisiveYes && !isDecisiveNo) {
            return (false, true); // Non-decisive (tie)
        }

        bool pickMatchesYes = predictedOutcome == IV2Types.OutcomeSide.YES && isDecisiveYes;
        bool pickMatchesNo = predictedOutcome == IV2Types.OutcomeSide.NO && isDecisiveNo;

        if (!pickMatchesYes && !pickMatchesNo) {
            return (true, false); // Decisive loss
        }

        return (false, false); // Decisive win
    }

    // ============ Internal: Signature Validation ============

    /// @notice Validate a party's signature (supports both EOA and session key)
    function _validatePartySignature(
        bytes32 predictionHash,
        address signer,
        uint256 wager,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature,
        bytes calldata sessionKeyData
    ) internal view returns (bool isValid) {
        if (sessionKeyData.length == 0) {
            // EOA signature - use standard validation
            return _isApprovalValid(predictionHash, signer, wager, nonce, deadline, signature);
        } else {
            // Session key signature - decode and validate
            IV2Types.SessionKeyData memory skData = abi.decode(sessionKeyData, (IV2Types.SessionKeyData));

            SessionKeyApproval memory approval = SessionKeyApproval({
                sessionKey: skData.sessionKey,
                owner: skData.owner,
                smartAccount: signer,
                validUntil: skData.validUntil,
                permissionsHash: skData.permissionsHash,
                ownerSignature: skData.ownerSignature
            });

            return _isSessionKeyApprovalValid(
                predictionHash,
                signer,
                wager,
                nonce,
                deadline,
                signature,
                approval
            );
        }
    }
}
