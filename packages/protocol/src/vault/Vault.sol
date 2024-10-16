// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../market/interfaces/IFoil.sol";
import "./interfaces/IVault.sol";

contract Vault is IVault, ERC20 {
    using SafeERC20 for IERC20;

    IFoil public market;
<<<<<<< HEAD
    IERC20 public collateralAsset;
    uint256 public positionId;
    uint256 public epochId;
=======
    uint256 public duration;

    uint256 public currentEpochId;
    uint256 public nextEpochId;
>>>>>>> ccd828bb563a12960004ed6e4dd9079f2a6f8ed8

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
        IFoil(market).createEpoch(
            startTime,
            startTime + duration,
            startingSqrtPriceX96,
            4
        );
    }

    function _createNextEpoch(uint160 startingSqrtPriceX96) private {
        // Get current epoch data
        (, uint256 newEpochStartTime, , , , , , , , , ) = market
            .getLatestEpoch();
        newEpochStartTime++; // start time of next epoch is the end time of current epoch + 1

        market.settlePosition(positionId);

        // Process Withdraw queue
        _processWithdrawQueue();

        // Initialize next epoch
        _initializeEpoch(newEpochStartTime, startingSqrtPriceX96);

        // Process Deposit queue
        _processDepositQueue();
    }

    function _processWithdrawQueue() private {
        // TODO
    }

    function _processDepositQueue() private {

        (uint256 amount0, uint256 amount1,) = market.getTokenAmounts(
            epochId,
            totalPendingDeposits,
            0, // todo
            0, // todo
            0  // todo
        );

        IFoilStructs.LiquidityMintParams memory params = IFoilStructs.LiquidityMintParams({
            epochId: epochId,
            amountTokenA: amount0,
            amountTokenB: amount1,
            collateralAmount: totalPendingDeposits,
            lowerTick: 0, // todo
            upperTick: 0, // todo
            minAmountTokenA: 0,
            minAmountTokenB: 0,
            deadline: block.timestamp
        });
        (positionId, , , , , ) = market.createLiquidityPosition(params);

        totalPendingDeposits = 0;
    }

    modifier onlyMarket() {
        require(
            msg.sender == address(market),
            "Only market can call this function"
        );
        _;
    }

    mapping(address => uint256) public pendingDeposits;
    uint256 public totalPendingDeposits;

    function deposit(uint256 amount) external {
        collateralAsset.safeTransferFrom(msg.sender, address(this), amount);
        pendingDeposits[msg.sender] += amount;
        withdrawalRequested[msg.sender] = false;
        totalPendingDeposits += amount;
    }

    function withdrawPendingDeposit(uint256 amount) external {
        require(pendingDeposits[msg.sender] >= amount, "Insufficient balance");
        collateralAsset.safeTransfer(msg.sender, amount);
        pendingDeposits[msg.sender] -= amount;
        totalPendingDeposits -= amount;
    }

    mapping(address => bool) public withdrawalRequested;

    function requestWithdrawal() external {
        withdrawalRequested[msg.sender] = true;
    }

    function cancelWithdrawal() external {
        withdrawalRequested[msg.sender] = false;
    }

    mapping(address => uint256) public pendingWithdrawals;
    uint256 public totalPendingWithdrawals;

    function withdraw(uint256 amount) external {
        require(
            pendingWithdrawals[msg.sender] >= amount,
            "Insufficient balance"
        );
        collateralAsset.safeTransfer(msg.sender, amount);
        pendingWithdrawals[msg.sender] -= amount;
        totalPendingWithdrawals -= amount;
    }
}
