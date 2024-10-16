// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../market/interfaces/IFoil.sol";
import "./interfaces/IVault.sol";

contract Vault is IVault, ERC20 {
    using SafeERC20 for IERC20;

    IFoil public market;
    IERC20 public collateralAsset;
    uint256 public positionId;
    uint256 public duration;

    mapping(address => uint256) public shares;
    uint256 public totalShares;

    struct EpochData {
        uint256 epochId;
        mapping(address => uint256) pendingDeposits;
        uint256 totalPendingDeposits;
        mapping(address => bool) withdrawalRequested;
        mapping(address => uint256) pendingWithdrawals;
        uint256 totalPendingWithdrawals;
    }

    EpochData[] public epochs;
    mapping(uint256 => uint256) public epochIdToIndex;


    constructor(
        string memory _name,
        string memory _symbol,
        address _marketAddress,
        uint256 _duration,
        uint160 _initialSqrtPriceX96,
        uint256 _initialStartTime
    ) ERC20(_name, _symbol) {
        // create new market by cloning nextEpochFoilImplementation
        market = IFoil(_marketAddress);
        duration = _duration;

        // Initialize the first epoch with the initial price that is set in the constructor's call
        _initializeEpoch(_initialStartTime, _initialSqrtPriceX96);

        _processQueue(0);
    }

    // @inheritdoc IVault
    function resolutionCallback(
        uint160 previousResolutionSqrtPriceX96
    ) external onlyMarket {
        _createNextEpoch(previousResolutionSqrtPriceX96);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) external view returns (bool) {
        return
            interfaceId == type(IVault).interfaceId ||
            interfaceId == type(IERC165).interfaceId ||
            interfaceId == type(IResolutionCallback).interfaceId;
    }

    function _initializeEpoch(
        uint256 startTime,
        uint160 startingSqrtPriceX96
    ) private {
        require(address(market) != address(0), "Market address not set");
        uint256 newEpochId = IFoil(market).createEpoch(
            startTime,
            startTime + duration,
            startingSqrtPriceX96,
            4
        );
        epochs.push(EpochData({
            pendingDeposits: 0,
            totalPendingDeposits: 0,
            withdrawalRequested: false,
            pendingWithdrawals: 0,
            totalPendingWithdrawals: 0,
            epochId: newEpochId
        }));
        epochIdToIndex[newEpochId] = epochs.length - 1;
    }

    function _createNextEpoch(uint160 startingSqrtPriceX96) private {
        // Get current epoch data
        (, uint256 newEpochStartTime, , , , , , , , , ) = market
            .getLatestEpoch();
        newEpochStartTime += duration + 1; // start time of next epoch is the end time of current epoch + duration +1 (Ying and Yang vaults)

        _initializeEpoch(newEpochStartTime, startingSqrtPriceX96);

        uint collateralReceived = market.settlePosition(positionId);

        _processQueue(collateralReceived);
    }

    function _processQueue(uint256 collateralReceived) private {
        EpochData previousEpoch = epochs[epochs.length - 1];
        uint256 collateralToDeposit = collateralReceived + previousEpoch.totalPendingDeposits - previousEpoch.totalPendingWithdrawals;

        (uint256 amount0, uint256 amount1, ) = market.getTokenAmounts(
            epochId,
            collateralToDeposit,
            0, // todo
            0, // todo
            0 // todo
        );

        IFoilStructs.LiquidityMintParams memory params = IFoilStructs
            .LiquidityMintParams({
                epochId: epochId,
                amountTokenA: amount0,
                amountTokenB: amount1,
                collateralAmount: collateralToDeposit,
                lowerTick: 0, // todo
                upperTick: 0, // todo
                minAmountTokenA: 0,
                minAmountTokenB: 0,
                deadline: block.timestamp
            });
        (positionId, , , , , ) = market.createLiquidityPosition(params);
    }

    modifier onlyMarket() {
        require(
            msg.sender == address(market),
            "Only market can call this function"
        );
        _;
    }

    function deposit(uint256 amount) external {
        collateralAsset.safeTransferFrom(msg.sender, address(this), amount);
        epochs[epochIdToIndex[epochId]].pendingDeposits[msg.sender] += amount;
        epochs[epochIdToIndex[epochId]].withdrawalRequested[msg.sender] = false;
        epochs[epochIdToIndex[epochId]].totalPendingDeposits += amount;

        // do accounting to indicate shares will change in the future
    }

    function withdrawPendingDeposit(uint256 amount) external {
        require(epochs[epochIdToIndex[epochId]].pendingDeposits[msg.sender] >= amount, "Insufficient balance");
        collateralAsset.safeTransfer(msg.sender, amount);
        epochs[epochIdToIndex[epochId]].pendingDeposits[msg.sender] -= amount;
        epochs[epochIdToIndex[epochId]].totalPendingDeposits -= amount;
    }

    // my collateral went into the vault, so i can claim my tokens
    function claim() external {
    } {
        _mint(msg.sender, claimable[msg.sender]);
    }

    // this would need to be shares if we want to allow partial withdrawals
    function requestWithdrawal() external {
        epochs[epochIdToIndex[epochId]].withdrawalRequested[msg.sender] = true;
    }

    function cancelWithdrawalRequest() external {
        epochs[epochIdToIndex[epochId]].withdrawalRequested[msg.sender] = false;
    }

    function withdraw() external {
        require(
            epochs[epochIdToIndex[epochId]].pendingWithdrawals[msg.sender] >= amount,
            "Insufficient balance"
        );
        collateralAsset.safeTransfer(msg.sender, amount);
        epochs[epochIdToIndex[epochId]].pendingWithdrawals[msg.sender] -= amount;
        epochs[epochIdToIndex[epochId]].totalPendingWithdrawals -= amount;
    }
}
