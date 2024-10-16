// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../market/interfaces/IFoil.sol";
import "./interfaces/IVault.sol";

contract Vault is IVault, ERC20 {
    using SafeERC20 for IERC20;

    /*
        == Constructor Params ==
        uniswapPositionManager =  "<%= imports.Uniswap.contracts.NonfungiblePositionManager.address %>", 
        uniswapSwapRouter = "<%= imports.Uniswap.contracts.SwapRouter.address %>", 
        uniswapQuoter = "<%= imports.Uniswap.contracts.QuoterV2.address %>", 
        optimisticOracleV3 = "<%= imports.UMA.contracts.OptimisticOracleV3.address %>" }
        priceUnit = "<%= formatBytes32String('wstGwei/gas') %>"

        == Initializer Params ==

        collateralAsset
        startTime = "<%= parseInt(timestamp) %>"
        duration
        startingSqrtPriceX96 = "146497135921788803112962621440" # 3.419
        feeRate = "10000" # 1%
        assertionLiveness = "21600" # 6 hours
        bondCurrency = address
        bondAmount = "5000000000"
    */

    IFoil public market;

    uint256 public currentEpochId;
    uint256 public nextEpochId;


    constructor(
        uint256 initialPrice,
        address collateralAddress,
        uint128 startTime
    ) ERC20("Vault", "VAULT") {
        // Deploy market

        // Call initializer
        _initializeEpoch(initialPrice);
    }

    // @inheritdoc IVault
    function resolutionCallback(
        uint256 previousSettlementPriceD18
    ) external onlyMarket {
        _createNextEpoch(previousSettlementPriceD18);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) external view returns (bool) {
        return
            interfaceId == type(IVault).interfaceId ||
            interfaceId == type(IERC165).interfaceId ||
            interfaceId == type(IResolutionCallback).interfaceId;
    }

    function _initializeEpoch(uint256 previousSettlementPriceD18) private {
        require(address(market) != address(0), "Market address not set");
        IFoil(market).createEpoch(previousSettlementPriceD18, 0, 0, 0);
    }

    function _createNextEpoch(uint256 previousSettlementPriceD18) private {
        _initializeEpoch(previousSettlementPriceD18);
        // Process Withdraw queue
        // Initialize next epoch
        // Process Deposit queue
    }

    modifier onlyMarket() {
        require(
            msg.sender == address(market),
            "Only market can call this function"
        );
        _;
    }

    mapping(address => uint256) public pendingDeposits;

    function deposit(uint256 amount) external {
        collateralAsset.safeTransferFrom(msg.sender, address(this), amount);
        pendingDeposits[msg.sender] += amount;
        withdrawalRequested[msg.sender] = false;
    }

    function withdrawPendingDeposit(uint256 amount) external {
        require(pendingDeposits[msg.sender] >= amount, "Insufficient balance");
        collateralAsset.safeTransfer(msg.sender, amount);
        pendingDeposits[msg.sender] -= amount;
    }

    mapping(address => bool) public withdrawalRequested;

    function requestWithdrawal() external {
        withdrawalRequested[msg.sender] = true;
    }

    function cancelWithdrawal() external {
        withdrawalRequested[msg.sender] = false;
    }

    mapping(address => uint256) public pendingWithdrawals;

    function withdraw(uint256 amount) external {
        require(pendingWithdrawals[msg.sender] >= amount, "Insufficient balance");
        collateralAsset.safeTransfer(msg.sender, amount);
        pendingWithdrawals[msg.sender] -= amount;
    }
}
