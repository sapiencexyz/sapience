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
    struct EpochData {
        uint256 marketEpochId;
        uint256 totalPendingDeposit;
        uint256 totalPendingWithdrawal;
        uint256 totalClaimableDeposit;
        uint256 totalClaimableWithdrawal;
        uint256 sharePrice;
    }

    uint256 currentFutureEpochIdx; // helper, it must be epochs.lenght -1
    EpochData[] public epochs; // holds the epoch data currentFutureEpochIdx points to current "not-closed" epoch
    mapping(address => uint256)[] userNonExecutedDeposits; // uses same id as epochs
    mapping(address => uint256)[] userNonExecutedWithdrawals; // uses same id as epochs

    uint256 globalTotalPendingDeposit; // total pending deposits expressed in collateral asset
    uint256 globalTotalPendingWithdrawal; // total pending withdrawal expressed in shares
    uint256 globalTotalClaimableDeposit; // total claimable deposits expressed in collateral asset
    uint256 globalTotalClaimableWithdrawal; // total claimable withdrawal expressed in shares
    mapping(address => uint256) userShares;
    mapping(address => SetUtil.UintSet) userDirtyEpochs; // epochs with pending deposits or withdrawals for users
    mapping(address => uint256) userClaimableDeposits; // notice userPending is currentFutureEpoch's userNonExecuted
    mapping(address => uint256) userClaimableWithrwawals; // notice userPending is currentFutureEpoch's userNonExecuted

    uint160 initialSqrtPriceX96;
    uint256 initialStartTime;
    address immutable vaultInitializer;
    bool initialized;

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

        initialSqrtPriceX96 = _initialSqrtPriceX96;
        initialStartTime = _initialStartTime;
        vaultInitializer = msg.sender;
    }

    function initializeEpoch() external onlyOwner {
        require(!initialized, "Already Initialized");

        _initializeEpoch(initialStartTime, initialSqrtPriceX96);
        initialized = true;
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
            4
        );

        epochs.push(
            EpochData({
                marketEpochId: newEpochId,
                totalPendingDeposit: 0,
                totalPendingWithdrawal: 0,
                totalClaimableDeposit: 0,
                totalClaimableWithdrawal: 0,
                sharePrice: 0
            })
        );
        currentFutureEpochIdx++;
    }

    function _createNextEpoch(uint160 previousResolutionSqrtPriceX96) private {
        // Set up the start time for the new epoch
        (, uint256 resolvedEpochEndTime, , , , , , , , , ) = market
            .getLatestEpoch();

        // Adjust the start time for the next epoch
        uint256 newEpochStartTime = resolvedEpochEndTime + duration + 1;

        // Settle the position and get the collateral received
        uint256 collateralReceived = market.settlePosition(positionId);
        collateralReceived; // do we need to use if for anything? at least an event reporting it

        // Process the epoch transition and pass the collateral received
        uint256 totalCollateralAfterTransition = _processEpochTransition();

        // Move to the next epoch
        _initializeEpoch(newEpochStartTime, previousResolutionSqrtPriceX96);

        // Call _createNewLiquidityPosition with the correct totalCollateral
        positionId = _createNewLiquidityPosition(
            totalCollateralAfterTransition
        );
    }

    function _processEpochTransition() internal returns (uint256) {
        EpochData storage epochData = epochs[currentFutureEpochIdx];

        uint256 netSupplyBeforeTransitioning = totalSupply();

        // Calculate the new share price
        uint256 totalAssetsBeforeTransitioning = totalAssets();
        uint256 epochSharePriceAtClosure = netSupplyBeforeTransitioning > 0
            ? _calculatePrice(
                totalAssetsBeforeTransitioning,
                netSupplyBeforeTransitioning
            )
            : 1e18;

        epochData.sharePrice = epochSharePriceAtClosure;

        // Adjust accounting
        // Move from pending to claimable
        epochData.totalClaimableDeposit = epochData.totalPendingDeposit;
        globalTotalClaimableDeposit += epochData.totalPendingDeposit;
        globalTotalPendingDeposit -= epochData.totalPendingDeposit; // is it possible to overflow? I don't think so, since it was updated at the same time on requests
        epochData.totalPendingDeposit = 0;
        epochData.totalClaimableWithdrawal = epochData.totalPendingWithdrawal;
        globalTotalClaimableWithdrawal += epochData.totalPendingWithdrawal;
        globalTotalPendingWithdrawal -= epochData.totalPendingWithdrawal; // is it possible to overflow? I don't think so, since it was updated at the same time on requests
        epochData.totalPendingWithdrawal = 0;

        // Do we need to do something with the shares?
        // with the PnL from the received collateral, the shares value is adjusted
        // re-distribute shares makes sense in a liquidation like action where shares needs to be distributed

        // // Process pending deposits
        // uint256 totalNewShares = (currentEpoch.totalPendingDeposits * 1e18) /
        //     newSharePrice;
        // _mintShares(address(this), totalNewShares);

        emit EpochProcessed(epochData.marketEpochId, epochSharePriceAtClosure);

        uint256 totalWithdrawalAmount = _calculateAssets(
            globalTotalClaimableWithdrawal,
            epochSharePriceAtClosure,
            Math.Rounding.Floor
        );

        // Calculate the total collateral available for the new liquidity position
        // Balance includes the collateral received plus any uninvested collateral for the next epoch (claimable deposits) and pending withdrawals
        // then we need to remove the total withdrawable value at current price
        uint256 totalCollateral = collateralAsset.balanceOf(address(this)) -
            totalWithdrawalAmount;

        return totalCollateral;
    }

    function _createNewLiquidityPosition(
        uint256 totalCollateral
    ) private returns (uint256 newPositionId) {
        uint256 epochId = epochs[currentFutureEpochIdx].marketEpochId;

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
        (uint256 amount0, uint256 amount1, ) = market.getTokenAmounts(
            epochId,
            totalCollateral,
            sqrtPriceX96,
            TickMath.getSqrtRatioAtTick(epochParams.baseAssetMinPriceTick),
            TickMath.getSqrtRatioAtTick(epochParams.baseAssetMaxPriceTick)
        );

        // Prepare liquidity mint parameters
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
        uint256 investedAssets = market.getPositionCollateralValue(positionId);
        uint256 pendingWithdrawalsValue = _getSharesValue(
            investedAssets,
            totalSupply(),
            globalTotalClaimableWithdrawal
        );
        uint256 pendingDeposits = globalTotalClaimableDeposit;

        uint256 totalManagedAssets = investedAssets -
            pendingWithdrawalsValue +
            pendingDeposits;
        return totalManagedAssets;
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

    // Sends actor's collateral to the vault, gets shares (gets assets amount of asset, mints sharesAmount = convertToShares(assets))
    // notice: this is the first part of the Async requestDeposit -> deposit/mint
    function requestDeposit(
        uint256 assets,
        address receiver,
        address owner
    ) external override nonReentrant returns (uint256 requestId) {
        require(receiver != address(0), "Invalid receiver");
        collateralAsset.safeTransferFrom(msg.sender, address(this), assets);

        // Do all the accounting (that should go to __requestDeposit)
        EpochData storage epochData = epochs[currentFutureEpochIdx];
        epochData.totalPendingDeposit += assets;
        userNonExecutedDeposits[currentFutureEpochIdx][owner] += assets;
        globalTotalPendingDeposit += assets;
        if (!userDirtyEpochs[owner].contains(currentFutureEpochIdx)) {
            userDirtyEpochs[owner].add(currentFutureEpochIdx);
        }

        requestId = currentFutureEpochIdx;
    }

    // Reduce requestDeposit Sends back collateral pending to deposit to actor
    // notice: this adjusts the first part of the Async requestDeposit -> deposit/mint
    function withdrawRequestDeposit(uint256 assets) external {
        EpochData storage epochData = epochs[currentFutureEpochIdx];
        address owner = msg.sender;
        require(
            userNonExecutedDeposits[currentFutureEpochIdx][owner] >= assets,
            "Insufficient pending deposit"
        );

        epochData.totalPendingDeposit -= assets;
        userNonExecutedDeposits[currentFutureEpochIdx][owner] -= assets;
        globalTotalPendingDeposit -= assets;

        collateralAsset.safeTransfer(msg.sender, assets);
    }

    // amount pending to deposit (not claimable, it means, not yet ready to deposit/mint)
    function pendingDepositRequest(
        uint256, // requestId is ignored
        address owner
    ) external view override returns (uint256 assets) {
        assets = userNonExecutedDeposits[currentFutureEpochIdx][owner];
    }

    // amount claimable to deposit (not pending, it means, ready to deposit/mint)
    function claimableDepositRequest(
        uint256, // requestId is ignored
        address owner
    ) external view override returns (uint256 assets) {
        return userClaimableDeposits[owner];
    }

    // Sends actor's collateral to the vault, gets shares (gets assets amount of asset, mints sharesAmount = convertToShares(assets))
    // notice: this is the second part of the Async requestDeposit -> deposit/mint
    // notice: the max amount or effective amount is same as claimable
    // @dev notice the amount is being ignored and all the claimable is going to be deposited
    function deposit(
        uint256, // ignoring the amount. All or nothing
        address receiver
    ) external override returns (uint256 sharesAmount) {
        uint256 mintedAssetValue = mint(0, receiver);

        sharesAmount = convertToShares(mintedAssetValue);
    }

    // Sends actor's collateral to the vault, gets shares (gets convertToAsset(sharesAmount), mints sharesAmount)
    // notice: this is the second part of the Async requestDeposit -> deposit/mint
    // notice: the max amount or effective amount is same as claimable
    // @dev notice the amount is being ignored and all the claimable is going to be minted
    function mint(
        uint256, // ignoring the amount
        address receiver
    ) public override returns (uint256 assets) {
        require(currentFutureEpochIdx > 0, "no previous epoch yet");

        // Simplification here - only previous epoch contains unclaimed deposits. TODO make it right
        EpochData storage previousEpochData = epochs[currentFutureEpochIdx - 1];

        // Notice, ignoring shares, getting all, if partials are allowed, use decrement here by assets
        uint256 userClaimable = userNonExecutedDeposits[
            currentFutureEpochIdx - 1
        ][receiver];
        require(assets != 0, "Cannot mint zero shares");
        assets = userClaimable;
        uint256 sharesToMint = convertToShares(assets);

        userNonExecutedDeposits[currentFutureEpochIdx - 1][receiver] = 0;
        previousEpochData.totalClaimableDeposit -= userClaimable;
        globalTotalClaimableDeposit -= userClaimable;

        // mint the shares
        _mintShares(receiver, sharesToMint);

        emit Deposit(msg.sender, receiver, assets, sharesToMint);
    }

    // Sends back collateral to the actor, burns shares (burns sharesAmount = convertToShares(assets); send to actor assets of asset)
    // notice: this is the first part of the Async requestRedeem -> redeem/withdraw
    function requestRedeem(
        uint256 sharesAmount,
        address,
        address owner
    ) external override returns (uint256 requestId) {
        require(owner != address(0), "Invalid owner");
        require(userShares[owner] >= sharesAmount, "Insufficient shares");

        if (msg.sender != owner) {
            uint256 allowed = allowance(owner, msg.sender);
            require(allowed >= sharesAmount, "Redeem exceeds allowance");
            _approve(owner, msg.sender, allowed - sharesAmount);
        }

        // Do all the accounting (that should go to _requestRedeem)
        EpochData storage epochData = epochs[currentFutureEpochIdx];
        epochData.totalPendingWithdrawal += sharesAmount;
        userNonExecutedWithdrawals[currentFutureEpochIdx][
            owner
        ] += sharesAmount;
        globalTotalPendingWithdrawal += sharesAmount;
        if (!userDirtyEpochs[owner].contains(currentFutureEpochIdx)) {
            userDirtyEpochs[owner].add(currentFutureEpochIdx);
        }

        requestId = currentFutureEpochIdx;
    }

    function withdrawRequestRedeem(uint256 shares) external {
        EpochData storage epochData = epochs[currentFutureEpochIdx];
        address owner = msg.sender;
        require(
            userNonExecutedWithdrawals[currentFutureEpochIdx][owner] >= shares,
            "Insufficient pending withdrawal"
        );

        epochData.totalPendingWithdrawal -= shares;
        userNonExecutedWithdrawals[currentFutureEpochIdx][owner] -= shares;
        globalTotalPendingWithdrawal -= shares;
    }
    // amount pending to redeem (not claimable, it means, not yet ready to redeem/withdraw)
    function pendingRedeemRequest(
        uint256, // ignored requestId
        address owner
    ) external view override returns (uint256 sharesAmount) {
        sharesAmount = userNonExecutedWithdrawals[currentFutureEpochIdx][owner];
    }

    // amount claimable to redeem (not pending, it means, ready to redeem/withdraw)
    function claimableRedeemRequest(
        uint256, // ignored requestId
        address owner
    ) external view override returns (uint256 sharesAmount) {
        return userClaimableWithrwawals[owner];
    }

    // Sends back collateral to the actor, burns shares (burns sharesAmount ; send to actor assets = convertToAsset(sharesAmount) of asset)
    // notice: this is the second part of the Async requestToWithdraw / redeem
    // @dev notice the amount is being ignored and all the claimable is going to be redeemed
    function redeem(
        uint256, // ignore the shares amount
        address receiver,
        address owner
    ) external override returns (uint256 assets) {
        uint256 withdrawnShares = withdraw(0, receiver, owner);

        assets = convertToAssets(withdrawnShares);
    }

    // Sends back collateral to the actor, burns shares (burns sharesAmount = convertToShares(assets); send to actor assets of asset)
    // notice: this is the second part of the Async requestToWithdraw / withdraw
    // @dev notice the amount is being ignored and all the claimable is going to be withdrawn
    function withdraw(
        uint256, // ignore the assets amount
        address receiver,
        address owner
    ) public override returns (uint256 sharesAmount) {
        require(currentFutureEpochIdx > 0, "no previous epoch yet");

        if (msg.sender != owner) {
            uint256 allowed = allowance(owner, msg.sender);
            require(allowed >= sharesAmount, "Withdraw exceeds allowance");
            _approve(owner, msg.sender, allowed - sharesAmount);
        }

        // Simplification here - only previous epoch contains unclaimed withdrawals. TODO make it right
        EpochData storage previousEpochData = epochs[currentFutureEpochIdx - 1];

        uint256 userClaimable = userNonExecutedWithdrawals[
            currentFutureEpochIdx - 1
        ][receiver];
        sharesAmount = userClaimable;
        require(sharesAmount != 0, "Cannot withdraw zero assets");
        uint256 sharesAssetValue = convertToAssets(sharesAmount);

        // Notice, ignoring assets, getting all, if partials are allowed, use decrement here by assets
        userNonExecutedWithdrawals[currentFutureEpochIdx - 1][receiver] = 0;
        previousEpochData.totalClaimableWithdrawal -= userClaimable;
        globalTotalClaimableWithdrawal -= userClaimable;

        // Burn the shares
        _burnShares(receiver, userClaimable);

        emit Withdraw(
            msg.sender,
            receiver,
            owner,
            sharesAssetValue,
            sharesAmount
        );
    }

    modifier onlyMarket() {
        require(
            msg.sender == address(market),
            "Only market can call this function"
        );
        _;
    }

    modifier onlyOwner() {
        console2.log("aaaaa");
        console2.log(msg.sender);
        console2.log(vaultInitializer);
        require(
            msg.sender == vaultInitializer,
            "Only vaultInitializer can call this function"
        );
        _;
    }

    // function _update(
    //     address from,
    //     address to,
    //     uint256 amount
    // ) internal override {
    //     super._update(from, to, amount);

    //     // Update userShares mapping accordingly
    //     if (from != address(0) && from != address(this)) {
    //         userShares[from] -= amount;
    //     }
    //     if (to != address(0) && to != address(this)) {
    //         userShares[to] += amount;
    //     }
    // }

    function availableShares(address owner) public view returns (uint256) {
        // The shares currently available to the user (not locked)
        return userShares[owner];
    }

    function _mintShares(address account, uint256 amount) internal {
        _mint(account, amount);
        if (account != address(this)) {
            userShares[account] += amount;
        }
    }

    function _burnShares(address account, uint256 amount) internal {
        _burn(account, amount);
        if (account != address(this)) {
            userShares[account] -= amount;
        }
    }

    // Helpers
    function _getSharesValue(
        uint256 assetsInVault,
        uint256 supplyInVault,
        uint256 shares
    ) internal pure returns (uint256 sharesValue) {
        return assetsInVault.mulDiv(shares, supplyInVault);
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
}
