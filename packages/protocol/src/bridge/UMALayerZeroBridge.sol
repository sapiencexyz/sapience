// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import { OApp, Origin, MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { ILayerZeroBridge } from "./interfaces/ILayerZeroBridge.sol";
import { OptimisticOracleV3Interface } from "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";
import { IUMALayerZeroBridge } from "./interfaces/ILayerZeroBridge.sol";

/**
 * @title UMALayerZeroBridge
 * @notice Bridge contract deployed on the UMA network
 * @dev This contract:
 * 1. Receives settlement requests from Converge
 * 2. Interacts with UMA's OptimisticOracleV3
 * 3. Manages bond tokens and gas fees
 * 4. Sends verification results back to Converge
 */
contract UMALayerZeroBridge is OApp, ReentrancyGuard, IUMALayerZeroBridge {
    using SafeERC20 for IERC20;

    // State variables
    BridgeConfig private  bridgeConfig;
    mapping(address => mapping(uint256 => bytes32)) private marketEpochToAssertionId;  // marketAddress => epochId => assertionId
    mapping(bytes32 => address) private assertionIdToMarket;                           // assertionId => marketAddress
    mapping(bytes32 => uint256) private assertionIdToEpoch;                           // assertionId => epochId
    mapping(address => mapping(address => uint256)) private submitterBondBalances;    // submitter => bondToken => balance
    mapping(address => mapping(address => WithdrawalIntent)) private withdrawalIntents; // submitter => bondToken => intent
    
    // Constants for gas monitoring
    uint256 public constant WARNING_GAS_THRESHOLD = 0.1 ether;
    uint256 public constant CRITICAL_GAS_THRESHOLD = 0.05 ether;
    
    // Constructor and initialization
    constructor(address _endpoint, address _owner) OApp(_endpoint, _owner) Ownable(_owner) {}

    // Bond Management Functions
    function depositBond(address bondToken, uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        IERC20(bondToken).safeTransferFrom(msg.sender, address(this), amount);
        submitterBondBalances[msg.sender][bondToken] += amount;
        emit BondDeposited(msg.sender, bondToken, amount);
        // _sendBalanceUpdate(msg.sender, bondToken, submitterBondBalances[msg.sender][bondToken], BalanceUpdateType.DEPOSIT);
    }

    function intentToWithdrawBond(address bondToken, uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(submitterBondBalances[msg.sender][bondToken] >= amount, "Insufficient balance");
        require(withdrawalIntents[msg.sender][bondToken].amount == 0, "Withdrawal intent already exists");

        withdrawalIntents[msg.sender][bondToken] = WithdrawalIntent({
            amount: amount,
            timestamp: block.timestamp,
            executed: false
        });

        // emit WithdrawalIntentCreated(msg.sender, bondToken, amount);
    }

    function executeWithdrawal(address bondToken) external nonReentrant {
        WithdrawalIntent storage intent = withdrawalIntents[msg.sender][bondToken];
        require(intent.amount > 0, "No withdrawal intent");
        require(!intent.executed, "Withdrawal already executed");
        // require(block.timestamp >= intent.timestamp + bridgeConfig.withdrawalDelay, "Waiting period not over");

        uint256 amount = intent.amount;
        intent.executed = true;
        submitterBondBalances[msg.sender][bondToken] -= amount;
        
        IERC20(bondToken).safeTransfer(msg.sender, amount);
        emit WithdrawalExecuted(msg.sender, bondToken, amount);
        // _sendBalanceUpdate(msg.sender, bondToken, submitterBondBalances[msg.sender][bondToken], BalanceUpdateType.WITHDRAWAL);
    }

    function getBondBalance(address submitter, address bondToken) external view returns (uint256) {
        return submitterBondBalances[submitter][bondToken];
    }

    function getPendingWithdrawal(address submitter, address bondToken) external view returns (uint256, uint256) {
        WithdrawalIntent storage intent = withdrawalIntents[submitter][bondToken];
        return (intent.amount, intent.timestamp);
    }

    // Settlement Functions
    // function submitSettlement(
    //     address market,
    //     uint256 epochId,
    //     uint256 settlementPrice,
    //     address bondToken,
    //     uint256 bondAmount
    // ) external payable nonReentrant returns (bytes32) {
    //     require(msg.sender == bridgeConfig.remoteBridge, "Only remote bridge can submit");
    //     require(submitterBondBalances[market][bondToken] >= bondAmount, "Insufficient bond balance");

    //     // Submit to UMA's OptimisticOracleV3
    //     bytes32 assertionId = OptimisticOracleV3Interface(bridgeConfig.optimisticOracleV3).assertTruth(
    //         abi.encodePacked(settlementPrice),
    //         market,
    //         address(this),
    //         address(0),
    //         uint64(bridgeConfig.assertionLiveness),
    //         IERC20(bondToken),
    //         bondAmount,
    //         OptimisticOracleV3Interface(bridgeConfig.optimisticOracleV3).defaultIdentifier(),
    //         bytes32(0)
    //     );

    //     // Update mappings
    //     marketEpochToAssertionId[market][epochId] = assertionId;
    //     assertionIdToMarket[assertionId] = market;
    //     assertionIdToEpoch[assertionId] = epochId;

    //     // Update bond balance
    //     submitterBondBalances[market][bondToken] -= bondAmount;
    //     // _sendBalanceUpdate(market, bondToken, submitterBondBalances[market][bondToken], BalanceUpdateType.ASSERTION_USED);

    //     emit SettlementSubmitted(market, epochId, assertionId);
    //     return assertionId;
    // }

    function verifySettlement(
        address market,
        uint256 epochId,
        bytes32 assertionId,
        bool verified
    ) external payable nonReentrant {
        require(msg.sender == bridgeConfig.remoteBridge, "Only remote bridge can verify");
        require(marketEpochToAssertionId[market][epochId] == assertionId, "Invalid assertion ID");

        // Send verification back to Converge
        bytes memory payload = abi.encode(market, epochId, assertionId, verified);
        _lzSend(
            bridgeConfig.remoteChainId,
            payload,
            bytes(""), // No options
            MessagingFee(msg.value, 0),
            payable(msg.sender)
        );

        // emit SettlementVerified(market, epochId, verified);
    }

    // UMA callback functions
    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external {
        // require(msg.sender == bridgeConfig.optimisticOracleV3, "Only UMA can call");
        address market = assertionIdToMarket[assertionId];
        uint256 epochId = assertionIdToEpoch[assertionId];
        require(market != address(0), "Invalid assertion ID");

        // Send resolution to Converge
        bytes memory payload = abi.encode(market, epochId, assertionId, assertedTruthfully);
        _lzSend(
            bridgeConfig.remoteChainId,
            payload,
            bytes(""), // No options
            MessagingFee(0, 0),
            payable(address(this))
        );

        // emit DisputeResolved(market, epochId, assertedTruthfully);
    }

    function assertionDisputedCallback(bytes32 assertionId) external {
        // require(msg.sender == bridgeConfig.optimisticOracleV3, "Only UMA can call");
        address market = assertionIdToMarket[assertionId];
        uint256 epochId = assertionIdToEpoch[assertionId];
        require(market != address(0), "Invalid assertion ID");

        // Send dispute notification to Converge
        bytes memory payload = abi.encode(market, epochId, assertionId);
        _lzSend(
            bridgeConfig.remoteChainId,
            payload,
            bytes(""), // No options
            MessagingFee(0, 0),
            payable(address(this))
        );

        // emit SettlementDisputed(market, epochId);
    }

    // LayerZero message handling
    function _lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata payload,
        address _executor,
        bytes calldata _extraData
    ) internal override {
        require(_origin.srcEid == bridgeConfig.remoteChainId, "Invalid source chain");
        require(address(uint160(uint256(_origin.sender))) == bridgeConfig.remoteBridge, "Invalid sender");

        // Process the message based on its type
        // Implementation depends on the message structure
    }

    // Internal functions
    // function _sendBalanceUpdate(
    //     address submitter,
    //     address bondToken,
    //     uint256 newBalance,
    //     BalanceUpdateType updateType
    // ) internal {
    //     BalanceUpdate memory update = BalanceUpdate({
    //         submitter: submitter,
    //         bondToken: bondToken,
    //         newBalance: newBalance,
    //         updateType: updateType
    //     });

    //     bytes memory payload = abi.encode(update);
    //     _lzSend(
    //         bridgeConfig.remoteChainId,
    //         payload,
    //         bytes(""), // No options
    //         MessagingFee(0, 0),
    //         payable(address(this))
    //     );

    //     emit BalanceUpdateSent(submitter, bondToken, newBalance);
    // }

    // Configuration functions
    function setBridgeConfig(BridgeConfig calldata newConfig) external onlyOwner {
        bridgeConfig = newConfig;
        emit BridgeConfigUpdated(newConfig);
    }

    // View functions
    function getBridgeConfig() external view returns (BridgeConfig memory) {
        return bridgeConfig;
    }
}