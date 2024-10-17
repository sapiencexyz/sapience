pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "../market/interfaces/IFoil.sol";
import "./interfaces/IVault.sol";

contract Vault is IVault, ERC20 {
    using SafeERC20 for IERC20;

    IFoil public market;
    IERC20 public collateralAsset;
    uint256 public duration;

    uint256 public positionId;

    mapping(address => uint256) public shares;
    uint256 public totalShares;

    struct EpochData {
        uint256 epochId;
        uint256 totalPendingDeposits;
        uint256 totalPendingWithdrawals;
        uint256 sharePrice;
        bool processed;
    }

    EpochData[] public epochs;
    mapping(uint256 => uint256) public epochIdToIndex;

    mapping(address => uint256) public userShares;
    mapping(address => mapping(uint256 => uint256)) public userPendingDeposits;
    mapping(address => mapping(uint256 => uint256)) public userPendingWithdrawals;

    constructor(
        string memory _name,
        string memory _symbol,
        address _marketAddress,
        address _collateralAssetAddress,
        uint256 _duration,
        uint160 _initialSqrtPriceX96,
        uint256 _initialStartTime
    ) ERC20(_name, _symbol) {
        market = IFoil(_marketAddress);
        collateralAsset = IERC20(_collateralAssetAddress);
        duration = _duration;

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
    ) external pure returns (bool) {
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
            epochId: newEpochId,
            totalPendingDeposits: 0,
            totalPendingWithdrawals: 0,
            sharePrice: 0,
            processed: false
        }));
        epochIdToIndex[newEpochId] = epochs.length - 1;
    }

    function _createNextEpoch() private {
        (, uint256 newEpochStartTime, , , , , , , , , ) = market
            .getLatestEpoch();
        newEpochStartTime += duration + 1; // start time of next epoch is the end time of current epoch + duration +1 (Ying and Yang vaults)

        uint256 collateralReceived = market.settlePosition(positionId);
        _processEpochTransition(collateralReceived);
    }

    function _processEpochTransition(uint256 collateralReceived) private {
        EpochData storage currentEpoch = epochs[epochs.length - 1];
        uint256 totalCollateral = collateralReceived + currentEpoch.totalPendingDeposits;
        
        uint256 newSharePrice;
        if (totalSupply() > 0) {
            newSharePrice = totalCollateral * 1e18 / (totalSupply() - currentEpoch.totalPendingWithdrawals);
        } else {
            newSharePrice = 1e18;
        }
        
        // Mark current epoch as processed
        currentEpoch.processed = true;
        currentEpoch.sharePrice = newSharePrice;
        
        // Create new epoch
        uint256 newEpochId = epochs.length;
        epochs.push(EpochData({
            epochId: newEpochId,
            totalPendingDeposits: 0,
            totalPendingWithdrawals: 0,
            sharePrice: newSharePrice,
            processed: false
        }));
        epochIdToIndex[newEpochId] = newEpochId;

        // Create new liquidity position
        _createNewLiquidityPosition(totalCollateral);
    }

    function _createNewLiquidityPosition(uint256 totalCollateral) private {
        uint256 epochId = epochs.length - 1;

        (
            ,
            ,
            ,
            address pool,
            ,
            ,
            ,
            ,
            ,
            IFoilStructs.EpochParams memory epochParams
        ) = market.getLatestEpoch();

        (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(pool).slot0();

        (uint256 amount0, uint256 amount1, ) = market.getTokenAmounts(
            epochId,
            totalCollateral,
            sqrtPriceX96,
            TickMath.getSqrtRatioAtTick(epochParams.baseAssetMinPriceTick),
            TickMath.getSqrtRatioAtTick(epochParams.baseAssetMaxPriceTick)
        );

        IFoilStructs.LiquidityMintParams memory params = IFoilStructs
            .LiquidityMintParams({
                epochId: epochId,
                amountTokenA: amount0,
                amountTokenB: amount1,
                collateralAmount: totalCollateral,
                lowerTick: epochParams.baseAssetMinPriceTick,
                upperTick: epochParams.baseAssetMaxPriceTick,
                minAmountTokenA: 0,
                minAmountTokenB: 0,
                deadline: block.timestamp
            });
        (positionId, , , , , ) = market.createLiquidityPosition(params);
    }

    function deposit(uint256 amount) external {
        collateralAsset.safeTransferFrom(msg.sender, address(this), amount);
        uint256 currentEpochId = epochs[epochs.length - 1].epochId;
        userPendingDeposits[msg.sender][currentEpochId] += amount;
        epochs[epochs.length - 1].totalPendingDeposits += amount;
    }

    function requestWithdrawal(uint256 shareAmount) external {
        require(userShares[msg.sender] >= shareAmount, "Insufficient shares");
        
        uint256 currentEpochId = epochs[epochs.length - 1].epochId;
        userPendingWithdrawals[msg.sender][currentEpochId] += shareAmount;
        epochs[epochs.length - 1].totalPendingWithdrawals += shareAmount;
        
        // Lock the shares to prevent double spending
        userShares[msg.sender] -= shareAmount;
    }

    function claim() external {
        uint256 totalNewShares = 0;
        for (uint256 i = 0; i < epochs.length - 1; i++) {
            EpochData storage epoch = epochs[i];
            if (epoch.processed && userPendingDeposits[msg.sender][epoch.epochId] > 0) {
                uint256 newShares = (userPendingDeposits[msg.sender][epoch.epochId] * 1e18) / epoch.sharePrice;
                totalNewShares += newShares;
                delete userPendingDeposits[msg.sender][epoch.epochId];
            }
        }
        if (totalNewShares > 0) {
            userShares[msg.sender] += totalNewShares;
            _mint(msg.sender, totalNewShares);
        }
    }

    function withdraw() external {
        uint256 totalWithdrawalAmount = 0;
        uint256 totalSharesToBurn = 0;
        for (uint256 i = 0; i < epochs.length - 1; i++) {
            EpochData storage epoch = epochs[i];
            if (epoch.processed && userPendingWithdrawals[msg.sender][epoch.epochId] > 0) {
                uint256 withdrawalAmount = (userPendingWithdrawals[msg.sender][epoch.epochId] * epoch.sharePrice) / 1e18;
                totalWithdrawalAmount += withdrawalAmount;
                totalSharesToBurn += userPendingWithdrawals[msg.sender][epoch.epochId];
                delete userPendingWithdrawals[msg.sender][epoch.epochId];
            }
        }
        if (totalWithdrawalAmount > 0) {
            userShares[msg.sender] -= totalSharesToBurn;
            _burn(msg.sender, totalSharesToBurn);
            collateralAsset.safeTransfer(msg.sender, totalWithdrawalAmount);
        }
    }

    modifier onlyMarket() {
        require(
            msg.sender == address(market),
            "Only market can call this function"
        );
        _;
    }

    function withdrawPendingDeposit(uint256 amount) external {
        uint256 currentEpochId = epochs[epochs.length - 1].epochId;
        require(userPendingDeposits[msg.sender][currentEpochId] >= amount, "Insufficient pending deposit");
        
        userPendingDeposits[msg.sender][currentEpochId] -= amount;
        epochs[epochs.length - 1].totalPendingDeposits -= amount;
        
        collateralAsset.safeTransfer(msg.sender, amount);
    }

    function cancelWithdrawalRequest(uint256 shareAmount) external {
        uint256 currentEpochId = epochs[epochs.length - 1].epochId;
        require(userPendingWithdrawals[msg.sender][currentEpochId] >= shareAmount, "Insufficient pending withdrawal");
        
        userPendingWithdrawals[msg.sender][currentEpochId] -= shareAmount;
        epochs[epochs.length - 1].totalPendingWithdrawals -= shareAmount;
        
        // Unlock the shares
        userShares[msg.sender] += shareAmount;
    }
}
