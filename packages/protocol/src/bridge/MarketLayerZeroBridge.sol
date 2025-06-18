// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import { OApp, Origin, MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { ILayerZeroBridge } from "./interfaces/ILayerZeroBridge.sol";
import { IUMASettlementModule } from "../market/interfaces/IUMASettlementModule.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
/**
 * @title MarketLayerZeroBridge
 * @notice Bridge contract deployed on Converge network
 * @dev This contract:
 * 1. Implements UMA's interface for settlements
 * 2. Manages local bond tokens
 * 3. Sends settlements to UMA side
 * 4. Receives and processes verifications
 */
contract MarketLayerZeroBridge is OApp, ReentrancyGuard, ILayerZeroBridge {
    // State variables
    BridgeConfig public bridgeConfig;
    mapping(address => mapping(uint256 => bool)) public processedMarketEpochs;        // marketAddress => epochId => processed
    mapping(address => mapping(uint256 => bytes32)) public marketEpochToLocalId;      // marketAddress => epochId => localId
    mapping(address => mapping(address => uint256)) public remoteSubmitterBalances;   // submitter => bondToken => balance
    mapping(address => MarketBondConfig) public marketBondConfigs;                   // marketAddress => config
    
    // Constants for gas monitoring
    uint256 public constant WARNING_GAS_THRESHOLD = 0.1 ether;
    uint256 public constant CRITICAL_GAS_THRESHOLD = 0.05 ether;
    
    // Constructor and initialization
    constructor(address _endpoint, address _owner) OApp(_endpoint, _owner) Ownable(_owner) {}

    // Settlement Functions
    function submitSettlement(
        address market,
        uint256 epochId,
        uint256 settlementPrice,
        address bondToken,
        uint256 bondAmount
    ) external payable nonReentrant returns (bytes32) { 
        require(!processedMarketEpochs[market][epochId], "Epoch already processed");
        require(marketBondConfigs[market].bondToken == bondToken, "Invalid bond token");
        require(marketBondConfigs[market].bondAmount == bondAmount, "Invalid bond amount");
        require(remoteSubmitterBalances[market][bondToken] >= bondAmount, "Insufficient remote balance");

        // Generate local ID
        bytes32 localId = keccak256(abi.encodePacked(market, epochId, settlementPrice, block.timestamp));
        marketEpochToLocalId[market][epochId] = localId;
        processedMarketEpochs[market][epochId] = true;

        // Send settlement to UMA side
        bytes memory payload = abi.encode(market, epochId, settlementPrice, bondToken, bondAmount);
        _lzSend(
            bridgeConfig.remoteChainId,
            payload,
            bytes(""), // No options
            MessagingFee(msg.value, 0),
            payable(msg.sender)
        );

        emit SettlementSubmitted(market, epochId, localId);
        return localId;
    }

    function verifySettlement(
        address market,
        uint256 epochId,
        bytes32 assertionId,
        bool verified
    ) public payable nonReentrant {
        require(msg.sender == bridgeConfig.remoteBridge, "Only remote bridge can verify");
        require(processedMarketEpochs[market][epochId], "Epoch not processed");
        require(marketEpochToLocalId[market][epochId] != bytes32(0), "Invalid local ID");

        // Call market callback
        // Note: The bridge should use existing events or callbacks (e.g., EpochSettled) instead of calling settlementVerified.
        // IUMASettlementModule(market).settlementVerified(epochId, verified);

        emit SettlementVerified(market, epochId, verified);
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

        // Decode message type
        if (payload.length >= 32) {
            bytes32 messageType = bytes32(payload[:32]);
            
            if (messageType == keccak256("BALANCE_UPDATE")) {
                _handleBalanceUpdate(payload[32:]);
            } else if (messageType == keccak256("SETTLEMENT_VERIFIED")) {
                _handleSettlementVerified(payload[32:]);
            } else if (messageType == keccak256("SETTLEMENT_DISPUTED")) {
                _handleSettlementDisputed(payload[32:]);
            } else if (messageType == keccak256("DISPUTE_RESOLVED")) {
                _handleDisputeResolved(payload[32:]);
            }
        }
    }

    // Internal message handlers
    function _handleBalanceUpdate(bytes memory data) internal {
        BalanceUpdate memory update = abi.decode(data, (BalanceUpdate));
        remoteSubmitterBalances[update.submitter][update.bondToken] = update.newBalance;
        emit BalanceUpdateReceived(update.submitter, update.bondToken, update.newBalance);
    }

    function _handleSettlementVerified(bytes memory data) internal {
        (address market, uint256 epochId, bytes32 assertionId, bool verified) = abi.decode(data, (address, uint256, bytes32, bool));
        verifySettlement(market, epochId, assertionId, verified);
    }

    function _handleSettlementDisputed(bytes memory data) internal {
        (address market, uint256 epochId, bytes32 assertionId) = abi.decode(data, (address, uint256, bytes32));
        // Call market callback
        // Note: The bridge should use existing events or callbacks (e.g., EpochSettled) instead of calling settlementDisputed.
        // IUMASettlementModule(market).settlementDisputed(epochId);
        emit SettlementDisputed(market, epochId);
    }

    function _handleDisputeResolved(bytes memory data) internal {
        (address market, uint256 epochId, bytes32 assertionId, bool asserterWon) = abi.decode(data, (address, uint256, bytes32, bool));
        // Note: The bridge should use existing events or callbacks (e.g., EpochSettled) instead of calling disputeResolved.
        // IUMASettlementModule(market).disputeResolved(epochId, asserterWon);
        emit DisputeResolved(market, epochId, asserterWon);
    }

    // Configuration functions
    function setBridgeConfig(BridgeConfig calldata newConfig) external onlyOwner {
        bridgeConfig = newConfig;
        emit BridgeConfigUpdated(newConfig);
    }

    function setMarketBondConfig(address market, MarketBondConfig calldata newConfig) external onlyOwner {
        marketBondConfigs[market] = newConfig;
        emit MarketBondConfigUpdated(market, newConfig);
    }

    // View functions
    function getBridgeConfig() external view returns (BridgeConfig memory) {
        return bridgeConfig;
    }

    function getMarketBondConfig(address market) external view returns (MarketBondConfig memory) {
        return marketBondConfigs[market];
    }

    function getRemoteBondBalance(address submitter, address bondToken) external view returns (uint256) {
        return remoteSubmitterBalances[submitter][bondToken];
    }

    // Bond Management Functions (stubs)
    function depositBond(address, uint256) external pure override { revert("Not supported"); }
    function intentToWithdrawBond(address, uint256) external pure override { revert("Not supported"); }
    function executeWithdrawal(address) external pure override { revert("Not supported"); }
    function getBondBalance(address, address) external pure override returns (uint256) { return 0; }
    function getPendingWithdrawal(address, address) external pure override returns (uint256, uint256) { return (0, 0); }
}