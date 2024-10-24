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
import "./interfaces/IERC7540.sol";

import "forge-std/console2.sol";

contract Vault is IVault, ERC20, ERC165, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;
    using SetUtil for SetUtil.UintSet;
    using Math for uint256;

    IFoil public immutable market;
    IERC20 public immutable collateralAsset;
    uint256 public immutable duration;

    /**
     * holds the vault position id on the active (running or future) epoch
     */
    uint256 public positionId;

    event EpochProcessed(
        uint256 indexed epochId,
        uint256 newSharePrice
        // uint256 newShares,
        // uint256 sharesToBurn
    );

    // tentative storage change
    // struct EpochData {
    //     uint256 marketEpochId;
    //     uint256 totalPendingDeposit;
    //     uint256 totalPendingWithdrawal;
    //     uint256 totalClaimableDeposit;
    //     uint256 totalClaimableWithdrawal;
    //     uint256 sharePrice;
    //     mapping(address => uint256) userNonExecutedDeposits; // uses same id as epochs
    //     mapping(address => uint256) userNonExecutedWithdrawals; // uses same id as epochs
    // }

    // uint256 currentFutureEpochIdx; // helper, it must be epochs.lenght -1
    // mapping(uint256 => EpochData) public epochs; // holds the epoch data currentFutureEpochIdx points to current "not-closed" epoch

    // uint256 globalTotalPendingDeposit; // total pending deposits expressed in collateral asset
    // uint256 globalTotalPendingWithdrawal; // total pending withdrawal expressed in shares
    // uint256 globalTotalClaimableDeposit; // total claimable deposits expressed in collateral asset
    // uint256 globalTotalClaimableWithdrawal; // total claimable withdrawal expressed in shares

    // mapping(address => uint256) userShares;
    // mapping(address => SetUtil.UintSet) userDirtyEpochs; // epochs with pending deposits or withdrawals for users
    // mapping(address => uint256) userClaimableDeposits; // notice userPending is currentFutureEpoch's userNonExecuted
    // mapping(address => uint256) userClaimableWithrwawals; // notice userPending is currentFutureEpoch's userNonExecuted

    address immutable vaultInitializer;
    bool initialized;

    enum TransactionType {
        NULL,
        DEPOSIT,
        WITHDRAW
    }

    /* new storage */
    struct UserPendingTransaction {
        uint256 amount; // collateral amount or shares amount
        TransactionType transactionType;
        uint256 requestInitiatedEpoch;
    }

    mapping(address => UserPendingTransaction) userPendingTransactions;

    mapping(uint256 => uint256) epochSharePrices;
    uint256 totalPendingDeposits;
    uint256 totalPendingWithdrawals;

    uint256 pendingSharesToBurn;

    uint256 currentEpochId;
    ///

    constructor(
        string memory _name,
        string memory _symbol,
        address _marketAddress,
        address _collateralAssetAddress,
        uint256 _duration
    ) ERC20(_name, _symbol) {
        market = IFoil(_marketAddress);
        collateralAsset = IERC20(_collateralAssetAddress);

        duration = _duration;
        vaultInitializer = msg.sender;
    }

    function initializeFirstEpoch(
        uint256 _initialStartTime,
        uint160 _initialSqrtPriceX96
    ) external onlyInitializer {
        require(!initialized, "Already Initialized");

        _initializeEpoch(_initialStartTime, _initialSqrtPriceX96);
        initialized = true;
    }

    function submitMarketSettlementPrice(
        uint256 epochId,
        uint160 price
    ) external returns (bytes32 assertionId) {
        (, , , , IFoilStructs.EpochParams memory epochParams) = market
            .getMarket();
        IERC20 bondCurrency = IERC20(epochParams.bondCurrency);

        bondCurrency.safeTransferFrom(
            msg.sender,
            address(this),
            epochParams.bondAmount
        );

        bondCurrency.approve(address(market), epochParams.bondAmount);
        assertionId = market.submitSettlementPrice(epochId, price);
    }

    function resolutionCallback(
        uint160 previousResolutionSqrtPriceX96
    ) external onlyMarket {
        _createNextEpoch(previousResolutionSqrtPriceX96);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override returns (bool) {
        return
            interfaceId == type(IVault).interfaceId ||
            interfaceId == type(IERC165).interfaceId ||
            interfaceId == type(IResolutionCallback).interfaceId ||
            interfaceId == type(IERC4626).interfaceId ||
            interfaceId == type(IERC7540).interfaceId ||
            super.supportsInterface(interfaceId);
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
            block.timestamp
        );
        currentEpochId = newEpochId;
    }

    function _createNextEpoch(uint160 previousResolutionSqrtPriceX96) private {
        // Set up the start time for the new epoch
        (, , uint256 resolvedEpochEndTime, , , , , , , , ) = market
            .getLatestEpoch();

        // Adjust the start time for the next epoch
        uint256 newEpochStartTime = resolvedEpochEndTime + duration;

        // Settle the position and get the collateral received
        uint256 collateralReceived;
        if (positionId != 0) {
            collateralReceived = market.settlePosition(positionId);
        }

        // Process the epoch transition and pass the collateral received
        uint256 totalCollateralAfterTransition = _processEpochTransition(
            collateralReceived
        );

        /*
            TODO: update market params with new min/max price bounds for the next epoch
        */

        // Move to the next epoch
        _initializeEpoch(newEpochStartTime, previousResolutionSqrtPriceX96);

        // Call _createNewLiquidityPosition with the correct totalCollateral
        if (totalCollateralAfterTransition > 0) {
            positionId = _createNewLiquidityPosition(
                totalCollateralAfterTransition
            );
        } else {
            positionId = 0;
        }
    }

    function _processEpochTransition(
        uint256 collateralFromPreviousEpoch
    ) internal returns (uint256 totalCollateralForNextEpoch) {
        // uint256 epochSharePriceAtClosure;
        // if (currentFutureEpochIdx > 0) {
        //     EpochData storage epochData = epochs[currentFutureEpochIdx - 1];
        //     uint256 netSupplyBeforeTransitioning = totalSupply();
        //     // Calculate the new share price
        //     uint256 totalAssetsBeforeTransitioning = totalAssets();
        //     epochSharePriceAtClosure = netSupplyBeforeTransitioning > 0
        //         ? _calculatePrice(
        //             totalAssetsBeforeTransitioning,
        //             netSupplyBeforeTransitioning
        //         )
        //         : 1e18;
        //     epochData.sharePrice = epochSharePriceAtClosure;
        //     // Adjust accounting
        //     // Move from pending to claimable
        //     epochData.totalClaimableDeposit = epochData.totalPendingDeposit;
        //     globalTotalClaimableDeposit += epochData.totalPendingDeposit;
        //     globalTotalPendingDeposit -= epochData.totalPendingDeposit; // is it possible to overflow? I don't think so, since it was updated at the same time on requests
        //     epochData.totalPendingDeposit = 0;
        //     epochData.totalClaimableWithdrawal = epochData
        //         .totalPendingWithdrawal;
        //     globalTotalClaimableWithdrawal += epochData.totalPendingWithdrawal;
        //     globalTotalPendingWithdrawal -= epochData.totalPendingWithdrawal; // is it possible to overflow? I don't think so, since it was updated at the same time on requests
        //     epochData.totalPendingWithdrawal = 0;
        //     // Do we need to do something with the shares?
        //     // with the PnL from the received collateral, the shares value is adjusted
        //     // re-distribute shares makes sense in a liquidation like action where shares needs to be distributed
        //     // // Process pending deposits
        //     // uint256 totalNewShares = (currentEpoch.totalPendingDeposits * 1e18) /
        //     //     newSharePrice;
        //     // _mintShares(address(this), totalNewShares);
        //     emit EpochProcessed(
        //         epochData.marketEpochId,
        //         epochSharePriceAtClosure
        //     );
        // }
        // uint256 totalWithdrawalAmount = _calculateAssets(
        //     globalTotalClaimableWithdrawal,
        //     epochSharePriceAtClosure,
        //     Math.Rounding.Floor
        // );
        // // Calculate the total collateral available for the new liquidity position
        // // Balance includes the collateral received plus any uninvested collateral for the next epoch (claimable deposits) and pending withdrawals
        // // then we need to remove the total withdrawable value at current price
        // uint256 totalCollateral = collateralAsset.balanceOf(address(this)) -
        //     totalWithdrawalAmount;
        // return totalCollateral;

        // Get the share price for the closing epoch
        uint256 totalShares = totalSupply() - pendingSharesToBurn;
        uint256 sharePrice;
        if (totalShares > 0 && collateralFromPreviousEpoch > 0) {
            sharePrice = collateralFromPreviousEpoch.mulDiv(1e18, totalShares); // any rounding?
        } else {
            sharePrice = 1e18;
        }

        epochSharePrices[currentEpochId] = sharePrice;

        totalCollateralForNextEpoch =
            collateralFromPreviousEpoch +
            totalPendingDeposits -
            totalPendingWithdrawals.mulDiv(sharePrice, 1e18); // any rounding?
        // TODO check if it overflows

        uint256 newShares = totalCollateralForNextEpoch.mulDiv(
            1e18,
            sharePrice
        ); // any rounding?

        uint256 currentShares = totalSupply();

        if (newShares > currentShares) {
            // need to mint more shares
            _mint(address(this), newShares - currentShares);
        } else {
            pendingSharesToBurn =
                (pendingSharesToBurn + currentShares) -
                newShares;
        }

        totalPendingWithdrawals = 0;
        totalPendingDeposits = 0;
    }

    function _createNewLiquidityPosition(
        uint256 totalCollateral
    ) private returns (uint256 newPositionId) {
        // Retrieve the latest epoch parameters
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
            ,
            IFoilStructs.EpochParams memory epochParams
        ) = market.getLatestEpoch();

        // Get the current sqrtPriceX96 from the pool
        (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(pool).slot0();

        // Calculate token amounts for the liquidity position
        (uint256 amount0, uint256 amount1, ) = market
            .quoteLiquidityPositionTokens(
                currentEpochId,
                totalCollateral,
                sqrtPriceX96,
                TickMath.getSqrtRatioAtTick(epochParams.baseAssetMinPriceTick),
                TickMath.getSqrtRatioAtTick(epochParams.baseAssetMaxPriceTick)
            );

        // Prepare liquidity mint parameters
        IFoilStructs.LiquidityMintParams memory params = IFoilStructs
            .LiquidityMintParams({
                epochId: currentEpochId,
                amountTokenA: amount0,
                amountTokenB: amount1,
                collateralAmount: totalCollateral,
                lowerTick: epochParams.baseAssetMinPriceTick,
                upperTick: epochParams.baseAssetMaxPriceTick,
                minAmountTokenA: 0,
                minAmountTokenB: 0,
                deadline: block.timestamp
            });

        // Approve collateral transfer to the market
        collateralAsset.approve(address(market), totalCollateral);

        // Create the liquidity position
        (newPositionId, , , , , ) = market.createLiquidityPosition(params);
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
    // Sends actor's collateral to the vault, gets shares (gets assets amount of asset, mints sharesAmount = convertToShares(assets))
    // notice: this is the first part of the Async requestDeposit -> deposit/mint
    function requestDeposit(
        uint256 assets,
        address,
        address owner
    ) external override nonReentrant returns (uint256 requestId) {
        require(owner != address(0), "Invalid receiver");
        collateralAsset.safeTransferFrom(owner, address(this), assets);

        UserPendingTransaction storage pendingTxn = userPendingTransactions[
            owner
        ];

        // only allow deposit if no withdrawal is pending
        if (pendingTxn.transactionType == TransactionType.WITHDRAW) {
            revert("Cannot deposit while withdrawal is pending");
        }

        // only allow deposit if previous deposit request is in the same epoch
        if (
            pendingTxn.requestInitiatedEpoch == currentEpochId ||
            pendingTxn.requestInitiatedEpoch == 0
        ) {
            pendingTxn.requestInitiatedEpoch = currentEpochId;
            pendingTxn.amount += assets;
            pendingTxn.transactionType = TransactionType.DEPOSIT;

            totalPendingDeposits += assets;
        } else {
            revert("Previous deposit request is not in the same epoch");
        }

        return currentEpochId;
    }

    // Reduce requestDeposit Sends back collateral pending to deposit to actor
    // notice: this adjusts the first part of the Async requestDeposit -> deposit/mint
    function withdrawRequestDeposit(uint256 assets) external {
        UserPendingTransaction storage pendingTxn = userPendingTransactions[
            msg.sender
        ];

        if (pendingTxn.transactionType != TransactionType.DEPOSIT) {
            revert("No deposit request to withdraw");
        }

        if (assets > pendingTxn.amount) {
            revert("Insufficient deposit request to withdraw");
        }

        pendingTxn.amount -= assets;
        totalPendingDeposits -= assets;

        collateralAsset.safeTransfer(msg.sender, assets);

        if (pendingTxn.amount == 0) {
            resetTransaction(msg.sender);
        }
    }

    // amount pending to deposit (not claimable, it means, not yet ready to deposit/mint)
    function pendingDepositRequest(
        uint256, // requestId is ignored
        address owner
    ) external view override returns (uint256 assets) {
        UserPendingTransaction storage pendingTxn = userPendingTransactions[
            owner
        ];

        if (pendingTxn.requestInitiatedEpoch != currentEpochId) {
            return 0;
        }

        return
            pendingTxn.transactionType == TransactionType.DEPOSIT
                ? pendingTxn.amount
                : 0;
    }

    // amount claimable to deposit (not pending, it means, ready to deposit/mint)
    function claimableDepositRequest(
        uint256, // requestId is ignored
        address owner
    ) external view override returns (uint256 assets) {
        UserPendingTransaction storage pendingTxn = userPendingTransactions[
            owner
        ];

        if (pendingTxn.requestInitiatedEpoch == currentEpochId) {
            return 0;
        }

        return
            pendingTxn.transactionType == TransactionType.DEPOSIT
                ? pendingTxn.amount
                : 0;
    }

    // Sends actor's collateral to the vault, gets shares (gets assets amount of asset, mints sharesAmount = convertToShares(assets))
    // notice: this is the second part of the Async requestDeposit -> deposit/mint
    // notice: the max amount or effective amount is same as claimable
    // @dev notice the amount is being ignored and all the claimable is going to be deposited
    function deposit(
        uint256, // ignoring the amount. All or nothing
        address,
        address owner
    ) public override returns (uint256 sharesAmount) {
        (, sharesAmount) = _mintShares(owner);
    }

    function deposit(
        uint256, // ignoring the amount. All or nothing
        address owner
    ) external override returns (uint256 sharesAmount) {
        return deposit(0, owner, owner);
    }

    // Sends actor's collateral to the vault, gets shares (gets convertToAsset(sharesAmount), mints sharesAmount)
    // notice: this is the second part of the Async requestDeposit -> deposit/mint
    // notice: the max amount or effective amount is same as claimable
    // @dev notice the amount is being ignored and all the claimable is going to be minted
    function mint(
        uint256, // ignoring the amount
        address,
        address owner
    ) public override returns (uint256 assets) {
        (assets, ) = _mintShares(owner);
    }

    function mint(
        uint256,
        address owner
    ) external override returns (uint256 assets) {
        return mint(0, owner, owner);
    }
    //////////////////////////////
    /// DEPOSIT WORKFLOW  ENDS ///
    //////////////////////////////

    ////////////////////////
    /// REDEEM WORKFLOW  ///
    ////////////////////////
    // Sends back collateral to the actor, burns shares (burns sharesAmount = convertToShares(assets); send to actor assets of asset)
    // notice: this is the first part of the Async requestRedeem -> redeem/withdraw
    function requestRedeem(
        uint256 sharesAmount,
        address,
        address owner
    ) external override returns (uint256 requestId) {
        UserPendingTransaction storage pendingTxn = userPendingTransactions[
            owner
        ];

        // only allow deposit if no withdrawal is pending
        if (pendingTxn.transactionType == TransactionType.DEPOSIT) {
            revert("Cannot redeem while deposit is pending");
        }

        // only allow deposit if previous deposit request is in the same epoch
        if (
            pendingTxn.requestInitiatedEpoch == currentEpochId ||
            pendingTxn.requestInitiatedEpoch == 0 // empty txn
        ) {
            pendingTxn.requestInitiatedEpoch = currentEpochId;
            pendingTxn.amount += sharesAmount;
            pendingTxn.transactionType = TransactionType.WITHDRAW;

            totalPendingWithdrawals += sharesAmount;
        } else {
            revert("Previous deposit request is not in the same epoch");
        }

        return currentEpochId;
    }

    function withdrawRequestRedeem(uint256 shares) external {
        UserPendingTransaction storage pendingTxn = userPendingTransactions[
            msg.sender
        ];

        if (pendingTxn.transactionType != TransactionType.WITHDRAW) {
            revert("No withdraw request to redeem");
        }

        if (shares > pendingTxn.amount) {
            revert("Insufficient deposit request to withdraw");
        }

        pendingTxn.amount -= shares;
        totalPendingWithdrawals -= shares;

        if (pendingTxn.amount == 0) {
            resetTransaction(msg.sender);
        }
    }
    // amount pending to redeem (not claimable, it means, not yet ready to redeem/withdraw)
    function pendingRedeemRequest(
        uint256, // ignored requestId
        address owner
    ) external view override returns (uint256 sharesAmount) {
        UserPendingTransaction storage pendingTxn = userPendingTransactions[
            owner
        ];

        if (pendingTxn.requestInitiatedEpoch != currentEpochId) {
            return 0;
        }

        return
            pendingTxn.transactionType == TransactionType.WITHDRAW
                ? pendingTxn.amount
                : 0;
    }

    // amount claimable to redeem (not pending, it means, ready to redeem/withdraw)
    function claimableRedeemRequest(
        uint256, // ignored requestId
        address owner
    ) external view override returns (uint256 sharesAmount) {
        UserPendingTransaction storage pendingTxn = userPendingTransactions[
            owner
        ];

        if (pendingTxn.requestInitiatedEpoch == currentEpochId) {
            return 0;
        }

        return
            pendingTxn.transactionType == TransactionType.WITHDRAW
                ? pendingTxn.amount
                : 0;
    }

    // Sends back collateral to the actor, burns shares (burns sharesAmount ; send to actor assets = convertToAsset(sharesAmount) of asset)
    // notice: this is the second part of the Async requestToWithdraw / redeem
    // @dev notice the amount is being ignored and all the claimable is going to be redeemed
    function redeem(
        uint256, // ignore the shares amount
        address,
        address owner
    ) public override returns (uint256 assets) {
        (assets, ) = _redeemShares(owner);
    }

    function redeem(address receiver) external returns (uint256 assets) {
        return redeem(0, receiver, receiver);
    }

    // Sends back collateral to the actor, burns shares (burns sharesAmount = convertToShares(assets); send to actor assets of asset)
    // notice: this is the second part of the Async requestToWithdraw / withdraw
    // @dev notice the amount is being ignored and all the claimable is going to be withdrawn
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
    function _getSharesValue(
        uint256 assetsInVault,
        uint256 supplyInVault,
        uint256 shares
    ) internal pure returns (uint256 sharesValue) {
        if (assetsInVault == 0 || supplyInVault == 0) {
            sharesValue = 0;
        } else {
            sharesValue = assetsInVault.mulDiv(shares, supplyInVault);
        }
    }

    /**
     * Gets the shares based on assets and a price. Takes a rounding direction
     * shares = assets / price
     * @dev it assumes collateral and shares (asset and shares) buth uses 18 digits
     */
    function _calculateShares(
        uint256 assets,
        uint256 price,
        Math.Rounding rounding
    ) internal pure returns (uint256 shares) {
        if (price == 0 || assets == 0) {
            shares = 0;
        } else {
            shares = assets.mulDiv(10 ** 18, price, rounding);
        }
    }

    /**
     * Calculates asset amount based on share amount and share price. Takes a rounding direction
     * assets = shares * price
     * @dev it assumes collateral and shares (asset and shares) buth uses 18 digits
     */
    function _calculateAssets(
        uint256 shares,
        uint256 price,
        Math.Rounding rounding
    ) internal pure returns (uint256 assets) {
        if (price == 0 || shares == 0) {
            assets = 0;
        } else {
            assets = shares.mulDiv(price, 10 ** 18, rounding);
        }
    }

    /**
     * Calculates share price and returns the value in price decimals.
     * price = assets / shares
     * @dev it assumes collateral and shares (asset and shares) buth uses 18 digits
     */
    function _calculatePrice(
        uint256 assets,
        uint256 shares
    ) internal pure returns (uint256) {
        if (assets == 0 || shares == 0) {
            return 0;
        }
        return assets.mulDiv(10 ** 18, shares, Math.Rounding.Floor);
    }

    function resetTransaction(address receiver) internal {
        userPendingTransactions[receiver] = UserPendingTransaction({
            amount: 0,
            transactionType: TransactionType.NULL,
            requestInitiatedEpoch: 0
        });
    }

    function _mintShares(
        address owner
    ) internal returns (uint256 assets, uint256 sharesAmount) {
        UserPendingTransaction storage pendingTxn = userPendingTransactions[
            owner
        ];

        if (
            pendingTxn.requestInitiatedEpoch != currentEpochId ||
            pendingTxn.requestInitiatedEpoch == 0
        ) {
            revert("Previous deposit request is not in the same epoch");
        }

        if (pendingTxn.transactionType != TransactionType.DEPOSIT) {
            revert("No deposit request to mint");
        }

        uint256 sharePrice = epochSharePrices[pendingTxn.requestInitiatedEpoch];
        sharesAmount = pendingTxn.amount.mulDiv(
            10 ** 18,
            sharePrice,
            Math.Rounding.Floor
        );

        assets = pendingTxn.amount;

        // transfer shares to owner
        transfer(owner, sharesAmount);

        resetTransaction(owner);

        emit Deposit(msg.sender, owner, assets, sharesAmount);
    }

    function _redeemShares(
        address owner
    ) internal returns (uint256 assets, uint256 sharesAmount) {
        UserPendingTransaction storage pendingTxn = userPendingTransactions[
            owner
        ];

        if (
            pendingTxn.requestInitiatedEpoch != currentEpochId ||
            pendingTxn.requestInitiatedEpoch == 0
        ) {
            revert("Previous withdraw request is not in the same epoch");
        }

        if (pendingTxn.transactionType != TransactionType.WITHDRAW) {
            revert("No withdraw request to redeem");
        }

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
}
