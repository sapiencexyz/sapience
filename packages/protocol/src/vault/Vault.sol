// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {SetUtil} from "@synthetixio/core-contracts/contracts/utils/SetUtil.sol";
import "../market/external/univ3/TickMath.sol";
import "../market/interfaces/IFoil.sol";
import "../market/interfaces/IFoilStructs.sol";
import "./interfaces/IVault.sol";

contract Vault is IVault, ERC20, ERC165, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;
    using SetUtil for SetUtil.UintSet;
    using Math for uint256;

    /// @notice immutable variables (initially set)
    IFoil public immutable market;
    IERC20 public immutable collateralAsset;
    uint256 public immutable lowerBoundMultiplier;
    uint256 public immutable upperBoundMultiplier;
    address immutable vaultInitializer;
    bool initialized; // flag indicating if vaultInitializer already called initializeFirstEpoch

    uint256 public immutable duration;
    uint256 public immutable vaultIndex;
    uint256 public immutable totalVaults;

    /**
     * current epoch id in market contract
     */
    uint256 public currentEpochId;

    /**
     * holds the vault position id on the active (running or future) epoch
     */
    uint256 public positionId;

    /**
     * holds the pending transactions for each user
     * @dev each user can have at most one pending transaction at a time
     * @dev user has to complete the request before making a new one
     * @dev user can also cancel the request by withdrawing shares or collateral
     */
    mapping(address => UserPendingTransaction) userPendingTransactions;

    /**
     * holds the share price for each epoch
     * @dev this allows us to historically track share price to honor requests made in previous epochs
     */
    mapping(uint256 => uint256) epochSharePrices;

    /**
     * total pending deposits
     * @dev tracks all pending deposits requested in current epoch
     * @dev when epoch settles, once reconciled, this value is reset to 0
     */
    uint256 totalPendingDeposits;

    /**
     * total pending withdrawals
     * @dev tracks all pending withdrawals requested in current epoch
     * @dev when epoch settles, once reconciled, this value is reset to 0
     */
    uint256 totalPendingWithdrawals;

    /**
     * pending shares to burn
     * @dev these shares are taken into account when calculating totalSupply
     * @dev pending withdrawals are added to this amount, and when redeemed, this value is reduced
     */
    uint256 pendingSharesToBurn;

    /**
     *  minimum collateral required to create liquidity position and to request deposit
     */
    uint256 constant minimumCollateral = 1e3;

    constructor(
        string memory _name,
        string memory _symbol,
        address _marketAddress,
        address _collateralAssetAddress,
        uint256 _lowerBoundMultiplier,
        uint256 _upperBoundMultiplier,
        uint256 _duration,
        uint256 _vaultIndex,
        uint256 _totalVaults
    ) ERC20(_name, _symbol) {
        market = IFoil(_marketAddress);
        collateralAsset = IERC20(_collateralAssetAddress);

        duration = _duration;
        vaultIndex = _vaultIndex;
        totalVaults = _totalVaults;
        lowerBoundMultiplier = _lowerBoundMultiplier;
        upperBoundMultiplier = _upperBoundMultiplier;
        vaultInitializer = msg.sender;
    }

    /// @notice initializes the first epoch
    /// @dev can only be called by the vault initializer
    /// @dev price is set to 1e18
    /// @dev any pending deposits prior to the first epoch are used to create the initial liquidity position
    function initializeFirstEpoch(
        uint160 initialSqrtPriceX96
    ) external onlyInitializer {
        require(!initialized, "Already Initialized");

        uint256 initialStartTime = block.timestamp + (vaultIndex * duration);

        uint256 startingSharePrice = 1e18;
        epochSharePrices[0] = startingSharePrice;

        uint256 collateralAmount = _reconcilePendingTransactions(
            0,
            startingSharePrice
        );

        _createEpochAndPosition(
            initialStartTime,
            initialSqrtPriceX96,
            collateralAmount
        );
        initialized = true;
    }

    function submitMarketSettlementPrice(
        uint256 epochId,
        uint160 price
    ) external returns (bytes32 assertionId) {
        (, , , , IFoilStructs.MarketParams memory marketParams) = market
            .getMarket();
        IERC20 bondCurrency = IERC20(marketParams.bondCurrency);

        bondCurrency.safeTransferFrom(
            msg.sender,
            address(this),
            marketParams.bondAmount
        );

        bondCurrency.approve(address(market), marketParams.bondAmount);
        assertionId = market.submitSettlementPrice(epochId, msg.sender, price);
    }

    /// @notice callback function called by market when an epoch is settled
    /// @dev collateral received is reconciled with pending txns to determine collateral for next liquidity position
    /// @dev share price is updated based on the collateral received
    function resolutionCallback(
        uint160 previousResolutionSqrtPriceX96
    ) external onlyMarket {
        uint256 collateralReceived;
        if (positionId != 0) {
            collateralReceived = market.settlePosition(positionId);
        }
        uint256 sharePrice = _updateSharePrice(collateralReceived);

        uint256 totalCollateralAfterTransition = _reconcilePendingTransactions(
            collateralReceived,
            sharePrice
        );

        // Set up the start time for the new epoch
        (IFoilStructs.EpochData memory epochData, ) = market.getLatestEpoch();
        _createEpochAndPosition(
            _calculateNextStartTime(epochData.startTime),
            previousResolutionSqrtPriceX96,
            totalCollateralAfterTransition
        );

        emit EpochProcessed(epochData.epochId, sharePrice);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override returns (bool) {
        return
            interfaceId == type(IVault).interfaceId ||
            interfaceId == type(IERC165).interfaceId ||
            interfaceId == type(IResolutionCallback).interfaceId ||
            interfaceId == type(IERC4626).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function _createEpochAndPosition(
        uint256 startTime,
        uint160 startingSqrtPriceX96,
        uint256 collateralAmount
    ) private {
        require(address(market) != address(0), "Market address not set");

        // get lower and upper bounds for the price tick for the new epoch
        (
            int24 baseAssetMinPriceTick,
            int24 baseAssetMaxPriceTick
        ) = _calculateTickBounds(startingSqrtPriceX96);

        uint256 newEpochId = IFoil(market).createEpoch(
            startTime,
            startTime + duration,
            startingSqrtPriceX96,
            baseAssetMinPriceTick,
            baseAssetMaxPriceTick,
            block.timestamp
        );
        currentEpochId = newEpochId;

        if (collateralAmount > minimumCollateral) {
            positionId = _createNewLiquidityPosition(collateralAmount);
        } else {
            positionId = 0;
        }
    }

    function _calculateNextStartTime(
        uint256 previousStartTime
    ) private view returns (uint256) {
        uint256 vaultCycleDuration = duration * totalVaults;
        uint256 iterationsToSkip = (block.timestamp - previousStartTime) /
            (duration * totalVaults);

        return
            previousStartTime + (vaultCycleDuration * (iterationsToSkip + 1));
    }

    function _calculateTickBounds(
        uint160 startingSqrtPriceX96
    )
        private
        view
        returns (int24 baseAssetMinPriceTick, int24 baseAssetMaxPriceTick)
    {
        uint256 lowerBoundSqrtPriceX96 = uint256(startingSqrtPriceX96).mulDiv(
            lowerBoundMultiplier,
            1e18
        );
        uint256 upperBoundSqrtPriceX96 = uint256(startingSqrtPriceX96).mulDiv(
            upperBoundMultiplier,
            1e18
        );

        if (
            lowerBoundSqrtPriceX96 > type(uint160).max ||
            upperBoundSqrtPriceX96 > type(uint160).max
        ) {
            revert("Price bounds are too large");
        }

        baseAssetMinPriceTick = TickMath.getTickAtSqrtRatio(
            uint160(lowerBoundSqrtPriceX96)
        );
        baseAssetMaxPriceTick = TickMath.getTickAtSqrtRatio(
            uint160(upperBoundSqrtPriceX96)
        );

        // adjust to floor based on tick spacing
        baseAssetMinPriceTick =
            baseAssetMinPriceTick -
            (baseAssetMinPriceTick % 200);
        baseAssetMaxPriceTick =
            baseAssetMaxPriceTick -
            (baseAssetMaxPriceTick % 200);
    }

    function _updateSharePrice(
        uint256 collateralReceived
    ) private returns (uint256 sharePrice) {
        // Get the total shares in circulation
        uint256 totalShares = totalSupply();

        // Calculate share price based on collateral and total shares
        sharePrice = totalShares > 0 && collateralReceived > 0
            ? collateralReceived.mulDiv(1e18, totalShares)
            : 1e18;

        // Store the share price for the current epoch
        epochSharePrices[currentEpochId] = sharePrice;

        return sharePrice;
    }

    function _reconcilePendingTransactions(
        uint256 collateralFromPreviousEpoch,
        uint256 sharePrice
    ) internal returns (uint256 totalCollateralForNextEpoch) {
        totalCollateralForNextEpoch =
            collateralFromPreviousEpoch +
            totalPendingDeposits -
            totalPendingWithdrawals.mulDiv(
                sharePrice,
                1e18,
                Math.Rounding.Ceil
            );

        uint256 newShares = totalPendingDeposits.mulDiv(
            1e18,
            sharePrice,
            Math.Rounding.Floor
        );

        if (newShares > 0) {
            _mint(address(this), newShares);
        }

        pendingSharesToBurn += totalPendingWithdrawals;

        totalPendingWithdrawals = 0;
        totalPendingDeposits = 0;
    }

    function _createNewLiquidityPosition(
        uint256 totalCollateral
    ) private returns (uint256 newPositionId) {
        // Retrieve the latest epoch parameters
        (IFoilStructs.EpochData memory epochData, ) = market.getLatestEpoch();

        // Get the current sqrtPriceX96 from the pool
        (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(epochData.pool)
            .slot0();

        // get quote for collateral amount - some dust to account for rounding
        uint256 dust = 1e4;
        // Calculate token amounts for the liquidity position
        (uint256 amount0, uint256 amount1, ) = market
            .quoteLiquidityPositionTokens(
                currentEpochId,
                totalCollateral - dust,
                sqrtPriceX96,
                TickMath.getSqrtRatioAtTick(epochData.baseAssetMinPriceTick),
                TickMath.getSqrtRatioAtTick(epochData.baseAssetMaxPriceTick)
            );

        // Prepare liquidity mint parameters
        IFoilStructs.LiquidityMintParams memory params = IFoilStructs
            .LiquidityMintParams({
                epochId: currentEpochId,
                amountTokenA: amount0,
                amountTokenB: amount1,
                collateralAmount: totalCollateral,
                lowerTick: epochData.baseAssetMinPriceTick,
                upperTick: epochData.baseAssetMaxPriceTick,
                minAmountTokenA: 0,
                minAmountTokenB: 0,
                deadline: block.timestamp
            });

        // Approve collateral transfer to the market
        collateralAsset.approve(address(market), totalCollateral);
        // Create the liquidity position
        (newPositionId, , , , , , ) = market.createLiquidityPosition(params);
    }

    function asset()
        external
        view
        override
        returns (address assetTokenAddress)
    {
        return address(collateralAsset);
    }

    function totalAssets() public view override returns (uint256) {
        return market.getPositionCollateralValue(positionId);
    }

    function totalSupply()
        public
        view
        override(IERC20, ERC20)
        returns (uint256)
    {
        return ERC20.totalSupply() - pendingSharesToBurn;
    }

    function convertToShares(
        uint256 assets
    ) public view override returns (uint256 sharesAmount) {
        // Converts assets to shares based on current exchange rate
        uint256 supply = totalSupply();
        return
            supply == 0
                ? assets
                : assets.mulDiv(supply, totalAssets(), Math.Rounding.Floor);
    }

    function convertToAssets(
        uint256 sharesAmount
    ) public view override returns (uint256 assets) {
        // Converts shares to assets based on current exchange rate
        uint256 supply = totalSupply();
        return
            supply == 0
                ? sharesAmount
                : sharesAmount.mulDiv(
                    totalAssets(),
                    supply,
                    Math.Rounding.Floor
                );
    }

    function maxDeposit(
        address
    ) external pure override returns (uint256 maxAssets) {
        // Maximum assets that can be deposited
        return type(uint256).max;
    }

    function maxMint(
        address
    ) external pure override returns (uint256 maxShares) {
        // Maximum shares that can be minted
        return type(uint256).max;
    }

    function maxWithdraw(
        address owner
    ) external view override returns (uint256 maxAssets) {
        // Maximum assets that can be withdrawn
        return convertToAssets(balanceOf(owner));
    }

    function maxRedeem(
        address owner
    ) external view override returns (uint256 maxShares) {
        // Maximum shares that can be redeemed
        return balanceOf(owner);
    }

    function previewRedeem(
        uint256 /*shares*/
    ) public pure override returns (uint256) {
        revert("previewRedeem is not supported");
    }

    function previewWithdraw(
        uint256 /*assets*/
    ) public pure override returns (uint256) {
        revert("previewWithdraw is not supported");
    }

    function previewDeposit(
        uint256 /*assets*/
    ) public pure override returns (uint256) {
        revert("previewDeposit is not supported");
    }

    function previewMint(
        uint256 /*shares*/
    ) public pure override returns (uint256) {
        revert("previewMint is not supported");
    }

    ////////////////////////
    /// DEPOSIT WORKFLOW ///
    ////////////////////////
    function requestDeposit(
        uint256 assets
    ) external returns (IVault.UserPendingTransaction memory) {
        require(assets > minimumCollateral, "Deposit amount is too low");
        collateralAsset.safeTransferFrom(msg.sender, address(this), assets);

        UserPendingTransaction storage pendingTxn = userPendingTransactions[
            msg.sender
        ];

        require(
            pendingTxn.requestInitiatedEpoch == currentEpochId ||
                pendingTxn.amount == 0,
            "Previous deposit request is not completed"
        );

        require(
            pendingTxn.transactionType != TransactionType.WITHDRAW,
            "Cannot deposit while withdrawal is pending"
        );

        pendingTxn.requestInitiatedEpoch = currentEpochId;
        pendingTxn.amount += assets;
        pendingTxn.transactionType = TransactionType.DEPOSIT;

        totalPendingDeposits += assets;

        emit DepositRequest(msg.sender, currentEpochId, pendingTxn.amount);

        return pendingTxn;
    }

    function withdrawRequestDeposit(
        uint256 assets
    ) external override returns (IVault.UserPendingTransaction memory) {
        UserPendingTransaction storage pendingTxn = userPendingTransactions[
            msg.sender
        ];

        require(
            pendingTxn.transactionType == TransactionType.DEPOSIT,
            "No deposit request to withdraw from"
        );

        require(
            assets <= pendingTxn.amount,
            "Insufficient deposit request to withdraw"
        );

        require(
            pendingTxn.requestInitiatedEpoch == currentEpochId,
            "Previous deposit request is not in the same epoch"
        );

        pendingTxn.amount -= assets;
        totalPendingDeposits -= assets;

        collateralAsset.safeTransfer(msg.sender, assets);

        if (pendingTxn.amount <= minimumCollateral) {
            resetTransaction(msg.sender);
        }

        emit DepositRequestWithdrawn(
            msg.sender,
            currentEpochId,
            pendingTxn.amount,
            assets
        );

        return pendingTxn;
    }

    function pendingDepositRequest(
        address owner
    ) external view override returns (IVault.UserPendingTransaction memory) {
        return userPendingTransactions[owner];
    }

    function claimableDepositRequest(
        address owner
    ) external view override returns (uint256 sharesAmount) {
        UserPendingTransaction storage pendingTxn = userPendingTransactions[
            owner
        ];

        if (
            pendingTxn.requestInitiatedEpoch == currentEpochId ||
            pendingTxn.transactionType != TransactionType.DEPOSIT
        ) {
            return 0;
        }

        uint256 sharePrice = epochSharePrices[pendingTxn.requestInitiatedEpoch];
        sharesAmount = pendingTxn.amount.mulDiv(
            10 ** 18,
            sharePrice,
            Math.Rounding.Floor
        );
    }

    function deposit(
        uint256, // ignore the amount, all shares will be claimed
        address receiver
    ) public override returns (uint256 sharesAmount) {
        (, sharesAmount) = _mintShares(receiver);
    }

    function mint(
        uint256,
        address receiver
    ) external override returns (uint256 assets) {
        (assets, ) = _mintShares(receiver);
    }
    //////////////////////////////
    /// DEPOSIT WORKFLOW  ENDS ///
    //////////////////////////////

    ////////////////////////
    /// REDEEM WORKFLOW  ///
    ////////////////////////
    function requestRedeem(
        uint256 shares
    ) external override returns (IVault.UserPendingTransaction memory) {
        require(shares > minimumCollateral, "Shares amount is too low");
        UserPendingTransaction storage pendingTxn = userPendingTransactions[
            msg.sender
        ];

        require(
            pendingTxn.transactionType != TransactionType.DEPOSIT,
            "Cannot redeem while deposit is pending"
        );

        require(
            pendingTxn.amount + shares <= balanceOf(msg.sender),
            "Insufficient shares to redeem"
        );

        require(
            pendingTxn.requestInitiatedEpoch == currentEpochId ||
                pendingTxn.amount == 0,
            "Previous redeem request is not in the same epoch"
        );

        pendingTxn.requestInitiatedEpoch = currentEpochId;
        pendingTxn.amount += shares;
        pendingTxn.transactionType = TransactionType.WITHDRAW;

        totalPendingWithdrawals += shares;

        emit RedeemRequest(msg.sender, currentEpochId, shares);

        return pendingTxn;
    }

    function withdrawRequestRedeem(
        uint256 shares
    ) external returns (IVault.UserPendingTransaction memory) {
        UserPendingTransaction storage pendingTxn = userPendingTransactions[
            msg.sender
        ];
        require(
            pendingTxn.transactionType == TransactionType.WITHDRAW,
            "No withdraw request to redeem"
        );
        require(
            shares <= pendingTxn.amount,
            "Insufficient shares to withdraw from request"
        );
        require(
            pendingTxn.requestInitiatedEpoch == currentEpochId,
            "Previous deposit request is not in the same epoch"
        );

        pendingTxn.amount -= shares;
        totalPendingWithdrawals -= shares;

        if (pendingTxn.amount <= minimumCollateral) {
            resetTransaction(msg.sender);
        }

        emit RedeemRequestWithdrawn(
            msg.sender,
            currentEpochId,
            pendingTxn.amount,
            shares
        );

        return pendingTxn;
    }

    function pendingRedeemRequest(
        address owner
    ) external view override returns (IVault.UserPendingTransaction memory) {
        return userPendingTransactions[owner];
    }

    function claimableRedeemRequest(
        address owner
    ) external view override returns (uint256 collateralAmount) {
        UserPendingTransaction storage pendingTxn = userPendingTransactions[
            owner
        ];

        if (
            pendingTxn.requestInitiatedEpoch == currentEpochId ||
            pendingTxn.transactionType != TransactionType.WITHDRAW
        ) {
            return 0;
        }

        uint256 sharePrice = epochSharePrices[pendingTxn.requestInitiatedEpoch];
        collateralAmount = sharePrice.mulDiv(
            pendingTxn.amount,
            10 ** 18,
            Math.Rounding.Floor
        );
    }

    function redeem(
        uint256, // ignore the shares amount
        address,
        address owner
    ) public override returns (uint256 assets) {
        (assets, ) = _redeemShares(owner);
    }

    function redeem(address owner) external returns (uint256 assets) {
        return redeem(0, owner, owner);
    }

    function withdraw(
        uint256, // ignore the assets amount
        address,
        address owner
    ) public override returns (uint256 sharesAmount) {
        (, sharesAmount) = _redeemShares(owner);
    }

    function withdraw(address owner) external returns (uint256 sharesAmount) {
        return withdraw(0, owner, owner);
    }
    ///////////////////////////////
    /// WITHDRAW WORKFLOW  ENDS ///
    ///////////////////////////////

    modifier onlyInitializer() {
        require(
            msg.sender == vaultInitializer,
            "Only vaultInitializer can call this function"
        );
        _;
    }

    modifier onlyMarket() {
        require(
            msg.sender == address(market),
            "Only market can call this function"
        );
        _;
    }

    // Helpers

    function resetTransaction(address receiver) internal {
        userPendingTransactions[receiver] = UserPendingTransaction({
            amount: 0,
            transactionType: TransactionType.NULL,
            requestInitiatedEpoch: 0
        });
    }

    function _mintShares(
        address receiver
    ) internal returns (uint256 assets, uint256 sharesAmount) {
        UserPendingTransaction storage pendingTxn = userPendingTransactions[
            receiver
        ];

        require(
            pendingTxn.transactionType == TransactionType.DEPOSIT,
            "No deposit request to mint"
        );

        require(
            pendingTxn.requestInitiatedEpoch != currentEpochId,
            "Deposit/Mint requires current epoch to settle"
        );

        uint256 sharePrice = epochSharePrices[pendingTxn.requestInitiatedEpoch];
        sharesAmount = pendingTxn.amount.mulDiv(
            10 ** 18,
            sharePrice,
            Math.Rounding.Floor
        );

        assets = pendingTxn.amount;

        // transfer shares to receiver
        _transfer(address(this), receiver, sharesAmount);

        resetTransaction(receiver);

        emit Deposit(msg.sender, receiver, assets, sharesAmount);
    }

    function _redeemShares(
        address owner
    ) internal returns (uint256 assets, uint256 sharesAmount) {
        UserPendingTransaction storage pendingTxn = userPendingTransactions[
            owner
        ];

        require(
            pendingTxn.transactionType == TransactionType.WITHDRAW,
            "No withdraw request to redeem"
        );

        require(
            pendingTxn.requestInitiatedEpoch != currentEpochId &&
                pendingTxn.requestInitiatedEpoch != 0,
            "Previous withdraw request is in the current epoch"
        );

        sharesAmount = pendingTxn.amount;
        uint256 sharePrice = epochSharePrices[pendingTxn.requestInitiatedEpoch];
        assets = sharePrice.mulDiv(sharesAmount, 10 ** 18, Math.Rounding.Floor);

        // Burn the shares
        _burn(owner, sharesAmount);
        collateralAsset.safeTransfer(owner, assets);
        pendingSharesToBurn -= sharesAmount;

        resetTransaction(owner);

        emit Withdraw(msg.sender, owner, owner, assets, sharesAmount);
    }

    /*//////////////////////////////////////////////////////////////
                               VIEWS
    //////////////////////////////////////////////////////////////*/

    function pendingValues()
        external
        view
        override
        returns (uint256, uint256, uint256)
    {
        return (
            totalPendingDeposits,
            totalPendingWithdrawals,
            pendingSharesToBurn
        );
    }

    function epochSharePrice(
        uint256 epochId
    ) external view override returns (uint256) {
        return epochSharePrices[epochId];
    }

    function getPositionId() external view returns (uint256) {
        return positionId;
    }

    function getCurrentEpoch()
        external
        view
        returns (IFoilStructs.EpochData memory epochData)
    {
        (epochData, ) = market.getLatestEpoch();
    }
}
