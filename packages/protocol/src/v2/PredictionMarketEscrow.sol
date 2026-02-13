// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./PredictionMarketToken.sol";
import "./interfaces/IPredictionMarketEscrow.sol";
import "./interfaces/IConditionResolver.sol";
import "./interfaces/IPredictionMarketToken.sol";
import "./interfaces/IV2Types.sol";
import "./interfaces/IV2Events.sol";
import "./utils/SignatureValidator.sol";

/**
 * @title PredictionMarketEscrow
 * @notice Unified prediction market contract with fungible betting pools
 * @dev Same picks share tokens. Token supply = total wagers. Parimutuel model.
 */
contract PredictionMarketEscrow is
    IPredictionMarketEscrow,
    IV2Events,
    ReentrancyGuard,
    SignatureValidator,
    Ownable
{
    using SafeERC20 for IERC20;

    // ============ Immutables ============

    /// @notice The collateral token (WUSDe)
    IERC20 public immutable collateralToken;

    // ============ State: Pick Configurations ============

    /// @notice Mapping from pickConfigId to pick configuration data
    mapping(bytes32 => IV2Types.PickConfiguration) private _pickConfigurations;

    /// @notice Mapping from pickConfigId to picks array
    mapping(bytes32 => IV2Types.Pick[]) private _pickConfigPicks;

    // ============ State: Predictions ============

    /// @notice Mapping from predictionId to prediction data
    mapping(bytes32 => IV2Types.Prediction) private _predictions;

    /// @notice Nonces for replay protection (per account)
    mapping(address => uint256) private _nonces;

    /// @notice Global nonce for unique prediction IDs
    uint256 private _globalNonce;

    // ============ State: Escrow ============

    /// @notice Escrow records by prediction ID
    mapping(bytes32 => IV2Types.EscrowRecord) private _escrowRecords;

    // ============ State: Token Factory ============

    /// @notice Mapping from pickConfigId to token pair
    mapping(bytes32 => IV2Types.TokenPair) private _tokenPairs;

    /// @notice Mapping from token address to pickConfigId
    mapping(address => bytes32) private _tokenToPickConfig;

    /// @notice Mapping from token address to whether it's a predictor token
    mapping(address => bool) private _isPredictorToken;

    /// @notice Set of valid position tokens
    mapping(address => bool) private _isPositionToken;

    // ============ Constructor ============

    /// @notice Create a new prediction market
    /// @param collateralToken_ The collateral token address (WUSDe)
    /// @param owner_ The contract owner (can set account factory)
    constructor(address collateralToken_, address owner_) Ownable(owner_) {
        collateralToken = IERC20(collateralToken_);
    }

    // ============ Admin Functions ============

    /// @notice Set the account factory for session key smart account verification
    /// @param factory_ The account factory address (e.g., ZeroDev Kernel factory)
    /// @dev Only callable by owner. Set to address(0) to disable strict verification
    function setAccountFactory(address factory_) external onlyOwner {
        _setAccountFactory(factory_);
    }

    /// @notice Sweep dust collateral from a fully-redeemed pick configuration
    /// @param pickConfigId The pick configuration to sweep dust from
    /// @param recipient Address to receive the dust
    /// @dev Only callable by owner. Can only sweep after all tokens are redeemed.
    ///      This handles rounding errors from division in payout calculations.
    function sweepDust(bytes32 pickConfigId, address recipient)
        external
        onlyOwner
        nonReentrant
    {
        if (recipient == address(0)) {
            revert InvalidRecipient();
        }

        IV2Types.PickConfiguration storage config =
            _pickConfigurations[pickConfigId];

        if (!config.resolved) {
            revert PickConfigNotResolved();
        }

        IV2Types.TokenPair storage tokenPair = _tokenPairs[pickConfigId];
        if (tokenPair.predictorToken == address(0)) {
            revert InvalidToken();
        }

        // Check that all tokens have been redeemed (total supply is 0)
        uint256 predictorSupply =
            IPredictionMarketToken(tokenPair.predictorToken).totalSupply();
        uint256 counterpartySupply =
            IPredictionMarketToken(tokenPair.counterpartyToken).totalSupply();

        if (predictorSupply > 0 || counterpartySupply > 0) {
            revert TokensStillOutstanding(predictorSupply, counterpartySupply);
        }

        // Calculate remaining dust
        uint256 totalCollateral = config.totalPredictorCollateral
            + config.totalCounterpartyCollateral;
        uint256 totalClaimed = config.claimedPredictorCollateral
            + config.claimedCounterpartyCollateral;
        uint256 dust = totalCollateral - totalClaimed;

        if (dust == 0) {
            revert NoDustToSweep();
        }

        // Mark dust as claimed to prevent double-sweeping
        config.claimedPredictorCollateral += dust;

        // Transfer dust to recipient
        collateralToken.safeTransfer(recipient, dust);

        emit DustSwept(pickConfigId, recipient, dust);
    }

    // ============ External Functions: Market ============

    /// @inheritdoc IPredictionMarketEscrow
    function mint(IV2Types.MintRequest calldata request)
        external
        nonReentrant
        returns (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken
        )
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

        // Compute pickConfigId from canonical picks (shared across same picks)
        bytes32 pickConfigId = _computePickConfigId(request.picks);

        // Compute unique predictionId for this specific bet
        predictionId = keccak256(
            abi.encode(
                pickConfigId,
                request.predictor,
                request.counterparty,
                ++_globalNonce
            )
        );

        // Compute prediction hash for signatures (includes wagers and addresses)
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                request.predictorWager,
                request.counterpartyWager,
                request.predictor,
                request.counterparty
            )
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

        // Create or reuse token pair for this pick configuration
        IV2Types.TokenPair storage tokenPair = _tokenPairs[pickConfigId];
        if (tokenPair.predictorToken == address(0)) {
            // First bet with these picks - create tokens and store picks
            (predictorToken, counterpartyToken) = _createTokenPair(pickConfigId);

            // Store picks for this configuration
            for (uint256 i = 0; i < request.picks.length; i++) {
                _pickConfigPicks[pickConfigId].push(request.picks[i]);
            }

            // Initialize pick configuration
            _pickConfigurations[pickConfigId] = IV2Types.PickConfiguration({
                pickConfigId: pickConfigId,
                totalPredictorCollateral: 0,
                totalCounterpartyCollateral: 0,
                totalPredictorTokensMinted: 0,
                totalCounterpartyTokensMinted: 0,
                claimedPredictorCollateral: 0,
                claimedCounterpartyCollateral: 0,
                resolved: false,
                result: IV2Types.SettlementResult.UNRESOLVED
            });
        } else {
            // Reuse existing tokens
            predictorToken = tokenPair.predictorToken;
            counterpartyToken = tokenPair.counterpartyToken;

            // C-2: Prevent minting after resolution
            if (_pickConfigurations[pickConfigId].resolved) {
                revert PickConfigAlreadyResolved();
            }
        }

        // Transfer collateral from both parties and execute remaining logic
        _executeMint(
            request,
            pickConfigId,
            predictionId,
            predictorToken,
            counterpartyToken
        );
    }

    /// @dev Internal function to execute mint logic and avoid stack too deep
    function _executeMint(
        IV2Types.MintRequest calldata request,
        bytes32 pickConfigId,
        bytes32 predictionId,
        address predictorToken,
        address counterpartyToken
    ) internal {
        // Transfer collateral from both parties
        collateralToken.safeTransferFrom(
            request.predictor, address(this), request.predictorWager
        );
        collateralToken.safeTransferFrom(
            request.counterparty, address(this), request.counterpartyWager
        );

        uint256 totalCollateral =
            request.predictorWager + request.counterpartyWager;

        // C-1: Mint tokens proportional to total collateral on the bet.
        // Each token represents a 1:1 claim on collateral, making fungibility safe
        // regardless of the odds at which any individual bet was placed.
        IPredictionMarketToken(predictorToken)
            .mint(request.predictor, totalCollateral);
        IPredictionMarketToken(counterpartyToken)
            .mint(request.counterparty, totalCollateral);

        // Update pick configuration totals
        IV2Types.PickConfiguration storage config =
            _pickConfigurations[pickConfigId];
        config.totalPredictorCollateral += request.predictorWager;
        config.totalCounterpartyCollateral += request.counterpartyWager;
        config.totalPredictorTokensMinted += totalCollateral;
        config.totalCounterpartyTokensMinted += totalCollateral;

        // Store escrow record for this specific bet (audit trail)
        _escrowRecords[predictionId] = IV2Types.EscrowRecord({
            pickConfigId: pickConfigId,
            totalCollateral: totalCollateral,
            predictorWager: request.predictorWager,
            counterpartyWager: request.counterpartyWager,
            predictorTokensMinted: totalCollateral,
            counterpartyTokensMinted: totalCollateral,
            settled: false
        });

        // Store prediction data
        _predictions[predictionId] = IV2Types.Prediction({
            predictionId: predictionId,
            pickConfigId: pickConfigId,
            predictorWager: request.predictorWager,
            counterpartyWager: request.counterpartyWager,
            predictor: request.predictor,
            counterparty: request.counterparty,
            predictorTokensMinted: totalCollateral,
            counterpartyTokensMinted: totalCollateral,
            settled: false
        });

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

        emit CollateralDeposited(predictionId, totalCollateral);
    }

    /// @inheritdoc IPredictionMarketEscrow
    function burn(IV2Types.BurnRequest calldata request) external nonReentrant {
        // Validate token amounts
        if (
            request.predictorTokenAmount == 0
                || request.counterpartyTokenAmount == 0
        ) {
            revert ZeroWager();
        }

        // Validate conservation: total payout must not exceed the collateral
        // backing the burned tokens. With proportional minting, each token's
        // collateral value = (tokenAmount / totalTokensMinted) * totalCollateral.
        // For a mutual cancel, both parties agree on the split — we just ensure
        // they don't extract more than exists. The collateral backing is computed
        // from the predictor side's proportion (both sides have equal token counts).
        {
            IV2Types.PickConfiguration storage _config =
                _pickConfigurations[request.pickConfigId];
            uint256 predictorCollateralBacking = _config.totalPredictorTokensMinted > 0
                ? (request.predictorTokenAmount * _config.totalPredictorCollateral) / _config.totalPredictorTokensMinted
                : 0;
            uint256 counterpartyCollateralBacking = _config.totalCounterpartyTokensMinted > 0
                ? (request.counterpartyTokenAmount * _config.totalCounterpartyCollateral) / _config.totalCounterpartyTokensMinted
                : 0;
            if (
                request.predictorPayout + request.counterpartyPayout
                    > predictorCollateralBacking + counterpartyCollateralBacking
            ) {
                revert InvalidBurnAmounts();
            }
        }

        // Validate token pair exists
        IV2Types.TokenPair storage tokenPair = _tokenPairs[request.pickConfigId];
        if (tokenPair.predictorToken == address(0)) {
            revert InvalidToken();
        }

        // Validate pick config is not resolved
        IV2Types.PickConfiguration storage config =
            _pickConfigurations[request.pickConfigId];
        if (config.resolved) {
            revert PickConfigAlreadyResolved();
        }

        // Compute burn hash for signatures
        bytes32 burnHash = keccak256(
            abi.encode(
                request.pickConfigId,
                request.predictorTokenAmount,
                request.counterpartyTokenAmount,
                request.predictorHolder,
                request.counterpartyHolder,
                request.predictorPayout,
                request.counterpartyPayout
            )
        );

        // Validate predictor signature
        if (!_validateBurnPartySignature(
                burnHash,
                request.predictorHolder,
                request.predictorTokenAmount,
                request.predictorPayout,
                request.predictorNonce,
                request.predictorDeadline,
                request.predictorSignature,
                request.predictorSessionKeyData
            )) {
            revert InvalidSignature();
        }
        if (request.predictorNonce != _nonces[request.predictorHolder]) {
            revert InvalidNonce();
        }

        // Validate counterparty signature
        if (!_validateBurnPartySignature(
                burnHash,
                request.counterpartyHolder,
                request.counterpartyTokenAmount,
                request.counterpartyPayout,
                request.counterpartyNonce,
                request.counterpartyDeadline,
                request.counterpartySignature,
                request.counterpartySessionKeyData
            )) {
            revert InvalidSignature();
        }
        if (request.counterpartyNonce != _nonces[request.counterpartyHolder]) {
            revert InvalidNonce();
        }

        // Increment nonces
        _nonces[request.predictorHolder]++;
        _nonces[request.counterpartyHolder]++;

        // Execute burn
        _executeBurn(request, tokenPair, config);
    }

    /// @dev Internal function to execute burn logic and avoid stack too deep
    function _executeBurn(
        IV2Types.BurnRequest calldata request,
        IV2Types.TokenPair storage tokenPair,
        IV2Types.PickConfiguration storage config
    ) internal {
        // Burn predictor tokens from holder
        IPredictionMarketToken(tokenPair.predictorToken)
            .burn(request.predictorHolder, request.predictorTokenAmount);

        // Burn counterparty tokens from holder
        IPredictionMarketToken(tokenPair.counterpartyToken)
            .burn(request.counterpartyHolder, request.counterpartyTokenAmount);

        // Update collateral tracking proportionally (compute before decrementing tokens)
        uint256 predictorCollateralReturned = config.totalPredictorTokensMinted > 0
            ? (request.predictorTokenAmount * config.totalPredictorCollateral) / config.totalPredictorTokensMinted
            : 0;
        uint256 counterpartyCollateralReturned = config.totalCounterpartyTokensMinted > 0
            ? (request.counterpartyTokenAmount * config.totalCounterpartyCollateral) / config.totalCounterpartyTokensMinted
            : 0;
        config.totalPredictorCollateral -= predictorCollateralReturned;
        config.totalCounterpartyCollateral -= counterpartyCollateralReturned;

        // Update token tracking
        config.totalPredictorTokensMinted -= request.predictorTokenAmount;
        config.totalCounterpartyTokensMinted -= request.counterpartyTokenAmount;

        // Transfer collateral to holders
        if (request.predictorPayout > 0) {
            collateralToken.safeTransfer(
                request.predictorHolder, request.predictorPayout
            );
        }
        if (request.counterpartyPayout > 0) {
            collateralToken.safeTransfer(
                request.counterpartyHolder, request.counterpartyPayout
            );
        }

        emit PositionsBurned(
            request.pickConfigId,
            request.predictorHolder,
            request.counterpartyHolder,
            request.predictorTokenAmount,
            request.counterpartyTokenAmount,
            request.predictorPayout,
            request.counterpartyPayout,
            request.refCode
        );
    }

    /// @inheritdoc IPredictionMarketEscrow
    function settle(bytes32 predictionId, bytes32 refCode)
        external
        nonReentrant
    {
        IV2Types.Prediction storage prediction = _predictions[predictionId];

        if (prediction.predictionId == bytes32(0)) {
            revert PredictionNotFound();
        }
        if (prediction.settled) {
            revert PredictionAlreadySettled();
        }

        bytes32 pickConfigId = prediction.pickConfigId;
        IV2Types.PickConfiguration storage config =
            _pickConfigurations[pickConfigId];

        // Resolve pick configuration if not already resolved
        if (!config.resolved) {
            (bool canResolve, IV2Types.SettlementResult result) =
                _resolvePrediction(pickConfigId);

            if (!canResolve) {
                revert PredictionNotResolvable();
            }

            config.resolved = true;
            config.result = result;
        }

        // Mark this specific prediction as settled
        prediction.settled = true;
        _escrowRecords[predictionId].settled = true;

        // Calculate claimable amounts for this prediction's contribution
        (uint256 predictorClaimable, uint256 counterpartyClaimable) = _calculateClaimableForPrediction(
            config.result,
            prediction.predictorWager,
            prediction.counterpartyWager
        );

        emit PredictionSettled(
            predictionId,
            config.result,
            predictorClaimable,
            counterpartyClaimable,
            refCode
        );
    }

    /// @inheritdoc IPredictionMarketEscrow
    function redeem(address positionToken, uint256 amount, bytes32 refCode)
        external
        nonReentrant
        returns (uint256 payout)
    {
        if (!_isPositionToken[positionToken]) {
            revert InvalidToken();
        }

        bytes32 pickConfigId = _tokenToPickConfig[positionToken];
        IV2Types.PickConfiguration storage config =
            _pickConfigurations[pickConfigId];

        if (!config.resolved) {
            revert PickConfigNotResolved();
        }

        if (amount == 0) {
            revert ZeroWager();
        }

        // Determine if this is predictor or counterparty token
        bool isPredictor = _isPredictorToken[positionToken];

        // Use ORIGINAL total tokens minted (not current totalSupply or collateral)
        // This ensures consistent payouts even after partial redemptions
        uint256 originalTotalTokens = isPredictor
            ? config.totalPredictorTokensMinted
            : config.totalCounterpartyTokensMinted;

        // Calculate claimable pool based on result
        uint256 claimablePool = _calculateClaimablePool(
            config.result,
            config.totalPredictorCollateral,
            config.totalCounterpartyCollateral,
            isPredictor
        );

        // Proportional payout: (amount / originalTotalTokens) * claimablePool
        payout = (amount * claimablePool) / originalTotalTokens;

        if (payout > 0) {
            // Burn the position tokens
            IPredictionMarketToken(positionToken).burn(msg.sender, amount);

            // Transfer collateral to holder
            collateralToken.safeTransfer(msg.sender, payout);

            // Track claimed collateral for accounting
            if (isPredictor) {
                config.claimedPredictorCollateral += payout;
            } else {
                config.claimedCounterpartyCollateral += payout;
            }

            // Note: We emit with pickConfigId since tokens are shared
            emit TokensRedeemed(
                pickConfigId, msg.sender, positionToken, amount, payout, refCode
            );
        }
    }

    // ============ View Functions ============

    /// @inheritdoc IPredictionMarketEscrow
    function getPrediction(bytes32 predictionId)
        external
        view
        returns (IV2Types.Prediction memory prediction)
    {
        return _predictions[predictionId];
    }

    /// @inheritdoc IPredictionMarketEscrow
    function getPickConfiguration(bytes32 pickConfigId)
        external
        view
        returns (IV2Types.PickConfiguration memory config)
    {
        return _pickConfigurations[pickConfigId];
    }

    /// @inheritdoc IPredictionMarketEscrow
    function getTokenPair(bytes32 pickConfigId)
        external
        view
        returns (IV2Types.TokenPair memory tokenPair)
    {
        return _tokenPairs[pickConfigId];
    }

    /// @inheritdoc IPredictionMarketEscrow
    function getNonce(address account) external view returns (uint256 nonce) {
        return _nonces[account];
    }

    /// @inheritdoc IPredictionMarketEscrow
    function canSettle(bytes32 predictionId) external view returns (bool) {
        IV2Types.Prediction storage prediction = _predictions[predictionId];
        if (prediction.predictionId == bytes32(0) || prediction.settled) {
            return false;
        }

        IV2Types.PickConfiguration storage config =
            _pickConfigurations[prediction.pickConfigId];
        if (config.resolved) {
            return true; // Already resolved, just need to mark this prediction
        }

        (bool canResolve,) = _resolvePrediction(prediction.pickConfigId);
        return canResolve;
    }

    /// @inheritdoc IPredictionMarketEscrow
    function getPicks(bytes32 pickConfigId)
        external
        view
        returns (IV2Types.Pick[] memory picks)
    {
        return _pickConfigPicks[pickConfigId];
    }

    /// @inheritdoc IPredictionMarketEscrow
    function computePickConfigId(IV2Types.Pick[] calldata picks)
        external
        pure
        returns (bytes32 pickConfigId)
    {
        return _computePickConfigId(picks);
    }

    /// @notice Get the escrow record for a prediction
    function getEscrowRecord(bytes32 predictionId)
        external
        view
        returns (IV2Types.EscrowRecord memory record)
    {
        return _escrowRecords[predictionId];
    }

    /// @notice Calculate claimable amount for a given token amount
    function getClaimableAmount(
        bytes32 pickConfigId,
        address positionToken,
        uint256 tokenAmount
    ) external view returns (uint256 claimable) {
        IV2Types.PickConfiguration storage config =
            _pickConfigurations[pickConfigId];
        if (!config.resolved || tokenAmount == 0) {
            return 0;
        }

        bool isPredictor = _isPredictorToken[positionToken];

        // Use ORIGINAL total tokens minted
        uint256 originalTotalTokens = isPredictor
            ? config.totalPredictorTokensMinted
            : config.totalCounterpartyTokensMinted;

        uint256 claimablePool = _calculateClaimablePool(
            config.result,
            config.totalPredictorCollateral,
            config.totalCounterpartyCollateral,
            isPredictor
        );

        return (tokenAmount * claimablePool) / originalTotalTokens;
    }

    /// @notice Check if an address is a valid position token
    function isPositionToken(address token) external view returns (bool) {
        return _isPositionToken[token];
    }

    /// @notice Check if a token is a predictor token
    function isPredictorToken(address token) external view returns (bool) {
        return _isPredictorToken[token];
    }

    /// @notice Get pickConfigId from token address
    function getPickConfigIdFromToken(address token)
        external
        view
        returns (bytes32)
    {
        return _tokenToPickConfig[token];
    }

    // ============ Internal: Token Factory ============

    /// @notice Create a token pair for a pick configuration
    function _createTokenPair(bytes32 pickConfigId)
        internal
        returns (address predictorToken, address counterpartyToken)
    {
        // Create predictor token with CREATE2
        bytes32 predictorSalt = keccak256(abi.encode(pickConfigId, true));
        predictorToken = address(
            new PredictionMarketToken{ salt: predictorSalt }(
                _generateTokenName(pickConfigId, true),
                _generateTokenSymbol(pickConfigId, true),
                pickConfigId,
                true,
                address(this) // market is the minter/burner
            )
        );

        // Create counterparty token with CREATE2
        bytes32 counterpartySalt = keccak256(abi.encode(pickConfigId, false));
        counterpartyToken = address(
            new PredictionMarketToken{ salt: counterpartySalt }(
                _generateTokenName(pickConfigId, false),
                _generateTokenSymbol(pickConfigId, false),
                pickConfigId,
                false,
                address(this) // market is the minter/burner
            )
        );

        // Store mappings
        _tokenPairs[pickConfigId] =
            IV2Types.TokenPair(predictorToken, counterpartyToken);
        _tokenToPickConfig[predictorToken] = pickConfigId;
        _tokenToPickConfig[counterpartyToken] = pickConfigId;
        _isPredictorToken[predictorToken] = true;
        _isPredictorToken[counterpartyToken] = false;
        _isPositionToken[predictorToken] = true;
        _isPositionToken[counterpartyToken] = true;
    }

    /// @notice Generate token name
    function _generateTokenName(bytes32 pickConfigId, bool isPredictor)
        internal
        pure
        returns (string memory)
    {
        string memory prefix = isPredictor ? "Predictor-" : "Counterparty-";
        return string(
            abi.encodePacked(prefix, _bytesToHexString(bytes4(pickConfigId)))
        );
    }

    /// @notice Generate token symbol
    function _generateTokenSymbol(bytes32 pickConfigId, bool isPredictor)
        internal
        pure
        returns (string memory)
    {
        string memory prefix = isPredictor ? "PRD-" : "CTR-";
        return string(
            abi.encodePacked(prefix, _bytesToHexString(bytes4(pickConfigId)))
        );
    }

    /// @notice Convert bytes4 to hex string
    function _bytesToHexString(bytes4 data)
        internal
        pure
        returns (string memory)
    {
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
            // Check condition is valid with try/catch to prevent DoS
            try IConditionResolver(picks[i].conditionResolver)
            .isValidCondition{ gas: RESOLVER_GAS_LIMIT }(
                picks[i].conditionId
            ) returns (
                bool isValid
            ) {
                if (!isValid) {
                    revert InvalidPicks();
                }
            } catch {
                // Resolver call failed - treat as invalid
                revert ResolverCallFailed(
                    picks[i].conditionResolver, picks[i].conditionId
                );
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

    /// @notice Compute pick configuration ID from picks
    function _computePickConfigId(IV2Types.Pick[] calldata picks)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(picks));
    }

    /// @notice Calculate claimable amounts for a prediction based on result
    function _calculateClaimableForPrediction(
        IV2Types.SettlementResult result,
        uint256 predictorWager,
        uint256 counterpartyWager
    )
        internal
        pure
        returns (uint256 predictorClaimable, uint256 counterpartyClaimable)
    {
        uint256 totalCollateral = predictorWager + counterpartyWager;

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
    }

    /// @notice Calculate the claimable pool for a position holder
    /// @param result The settlement result
    /// @param totalPredictorCollateral Total collateral from predictors
    /// @param totalCounterpartyCollateral Total collateral from counterparties
    /// @param isPredictor True if calculating for predictor side
    /// @return claimablePool The total pool claimable by this side
    function _calculateClaimablePool(
        IV2Types.SettlementResult result,
        uint256 totalPredictorCollateral,
        uint256 totalCounterpartyCollateral,
        bool isPredictor
    ) internal pure returns (uint256 claimablePool) {
        uint256 totalCollateral = totalPredictorCollateral
            + totalCounterpartyCollateral;

        if (result == IV2Types.SettlementResult.PREDICTOR_WINS) {
            claimablePool = isPredictor ? totalCollateral : 0;
        } else if (result == IV2Types.SettlementResult.COUNTERPARTY_WINS) {
            claimablePool = isPredictor ? 0 : totalCollateral;
        } else {
            // NON_DECISIVE (tie) - each side gets their original collateral back
            claimablePool = isPredictor
                ? totalPredictorCollateral
                : totalCounterpartyCollateral;
        }
    }

    // ============ Internal: Resolution ============

    /// @notice Resolve a pick configuration using integrated parlay logic
    /// @dev Optimized to use batch resolution when all picks use the same resolver
    function _resolvePrediction(bytes32 pickConfigId)
        internal
        view
        returns (bool canResolve, IV2Types.SettlementResult result)
    {
        IV2Types.Pick[] storage picks = _pickConfigPicks[pickConfigId];
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

    /// @notice Gas limit for resolver calls to prevent griefing
    uint256 internal constant RESOLVER_GAS_LIMIT = 500_000;

    /// @notice Resolve using batch call when all picks use the same resolver
    function _resolveBatch(
        IV2Types.Pick[] storage picks,
        uint256 numPicks,
        address resolver
    )
        internal
        view
        returns (bool canResolve, IV2Types.SettlementResult result)
    {
        // Build array of condition IDs
        bytes32[] memory conditionIds = new bytes32[](numPicks);
        for (uint256 i = 0; i < numPicks; i++) {
            conditionIds[i] = picks[i].conditionId;
        }

        // Single batch call to resolver with try/catch to prevent DoS
        bool[] memory resolved;
        IV2Types.OutcomeVector[] memory outcomes;
        try IConditionResolver(resolver)
        .getResolutions{ gas: RESOLVER_GAS_LIMIT }(
            conditionIds
        ) returns (
            bool[] memory _resolved, IV2Types.OutcomeVector[] memory _outcomes
        ) {
            resolved = _resolved;
            outcomes = _outcomes;
        } catch {
            // Resolver call failed - treat as unresolved
            // This prevents malicious resolvers from permanently blocking settlement
            return (false, IV2Types.SettlementResult.UNRESOLVED);
        }

        // Process results
        bool hasNonDecisive = false;
        for (uint256 i = 0; i < numPicks; i++) {
            if (!resolved[i]) {
                return (false, IV2Types.SettlementResult.UNRESOLVED);
            }

            (bool isLoss, bool isNonDecisive) =
                _evaluatePick(picks[i].predictedOutcome, outcomes[i]);
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

            // Call resolver with try/catch to prevent DoS from malicious resolvers
            bool isResolved;
            IV2Types.OutcomeVector memory outcome;
            try IConditionResolver(pick.conditionResolver)
            .getResolution{ gas: RESOLVER_GAS_LIMIT }(
                pick.conditionId
            ) returns (
                bool _isResolved, IV2Types.OutcomeVector memory _outcome
            ) {
                isResolved = _isResolved;
                outcome = _outcome;
            } catch {
                // Resolver call failed - treat as unresolved
                return (false, IV2Types.SettlementResult.UNRESOLVED);
            }

            if (!isResolved) {
                return (false, IV2Types.SettlementResult.UNRESOLVED);
            }

            (bool isLoss, bool isNonDecisive) =
                _evaluatePick(pick.predictedOutcome, outcome);
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
    function _evaluatePick(
        IV2Types.OutcomeSide predictedOutcome,
        IV2Types.OutcomeVector memory outcome
    ) internal pure returns (bool isLoss, bool isNonDecisive) {
        bool isDecisiveYes = outcome.yesWeight > 0 && outcome.noWeight == 0;
        bool isDecisiveNo = outcome.yesWeight == 0 && outcome.noWeight > 0;

        if (!isDecisiveYes && !isDecisiveNo) {
            return (false, true); // Non-decisive (tie)
        }

        bool pickMatchesYes =
            predictedOutcome == IV2Types.OutcomeSide.YES && isDecisiveYes;
        bool pickMatchesNo =
            predictedOutcome == IV2Types.OutcomeSide.NO && isDecisiveNo;

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
            // EOA or EIP-1271 (smart account) signature
            return _isApprovalValidWithEIP1271Fallback(
                predictionHash, signer, wager, nonce, deadline, signature
            );
        } else {
            // Session key signature - decode and validate
            IV2Types.SessionKeyData memory skData =
                abi.decode(sessionKeyData, (IV2Types.SessionKeyData));

            SessionKeyApproval memory approval = SessionKeyApproval({
                sessionKey: skData.sessionKey,
                owner: skData.owner,
                smartAccount: signer,
                validUntil: skData.validUntil,
                permissionsHash: skData.permissionsHash,
                chainId: skData.chainId,
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

    /// @notice Validate a burn party's signature (supports both EOA and session key)
    function _validateBurnPartySignature(
        bytes32 burnHash,
        address signer,
        uint256 tokenAmount,
        uint256 payout,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature,
        bytes calldata sessionKeyData
    ) internal view returns (bool isValid) {
        if (sessionKeyData.length == 0) {
            // EOA or EIP-1271 (smart account) signature
            return _isBurnApprovalValidWithEIP1271Fallback(
                burnHash,
                signer,
                tokenAmount,
                payout,
                nonce,
                deadline,
                signature
            );
        } else {
            // Session key signature - decode and validate
            IV2Types.SessionKeyData memory skData =
                abi.decode(sessionKeyData, (IV2Types.SessionKeyData));

            SessionKeyApproval memory approval = SessionKeyApproval({
                sessionKey: skData.sessionKey,
                owner: skData.owner,
                smartAccount: signer,
                validUntil: skData.validUntil,
                permissionsHash: skData.permissionsHash,
                chainId: skData.chainId,
                ownerSignature: skData.ownerSignature
            });

            return _isSessionKeyBurnApprovalValid(
                burnHash,
                signer,
                tokenAmount,
                payout,
                nonce,
                deadline,
                signature,
                approval
            );
        }
    }
}
