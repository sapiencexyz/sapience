// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC4626.sol";
import "./interfaces/IERC7540.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../market/external/univ3/TickMath.sol";
import "../market/interfaces/IFoil.sol";
import "../market/interfaces/IFoilStructs.sol";
import "./interfaces/IVault.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {SetUtil} from "@synthetixio/core-contracts/contracts/utils/SetUtil.sol";

contract Vault is IVault, ERC20, ERC165, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;
    using SetUtil for SetUtil.UintSet;

    IFoil public immutable market;
    IERC20 public immutable collateralAsset;
    uint256 public immutable duration;

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
    mapping(address => mapping(uint256 => uint256))
        public userPendingWithdrawalShares;

    // Add mappings to keep track of users with pending deposits and withdrawals
    mapping(uint256 => address[]) private depositors;
    mapping(uint256 => address[]) private withdrawers;

    event EpochProcessed(
        uint256 indexed epochId,
        uint256 newSharePrice,
        uint256 newShares,
        uint256 sharesToBurn
    );

    // tentative storage change
    struct Epoch7540Data {
        uint256 marketEpochId;
        uint256 totalPendingDeposit;
        uint256 totalPendingWithdrawal;
        uint256 totalClaimableDeposit;
        uint256 totalClaimableWithdrawal;
        uint256 sharePrice;
        mapping(address => uint256) userNonExecutedDeposits;
        mapping(address => uint256) userNonExecutedWithrwawals;
    }

    Epoch7540Data[] internal epochs7540;
    uint256 currentFutureEpochIdx; // helper, it must be epochs7540.lenght -1
    uint256 globalTotalPendingDeposit;
    uint256 globalTotalPendingWithdrawal;
    uint256 globalTotalClaimableDeposit;
    uint256 globalTotalClaimableWithdrawal;
    mapping(address => uint256) user7540Shares;
    uint256 totalShares7540;
    mapping(address => SetUtil.UintSet) user7540DirtyEpochs;
    mapping(address => uint256) userClaimableDeposits; // notice userPending is currentFutureEpoch's userNonExecuted
    mapping(address => uint256) userClaimableWithrwawals; // notice userPending is currentFutureEpoch's userNonExecuted

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
                epochId: newEpochId,
                totalPendingDeposits: 0,
                totalPendingWithdrawals: 0,
                sharePrice: 0,
                processed: false
            })
        );
        epochIdToIndex[newEpochId] = epochs.length - 1;
    }

    function _createNextEpoch(uint160 previousResolutionSqrtPriceX96) private {
        // Set up the start time for the new epoch
        (, uint256 newEpochStartTime, , , , , , , , , ) = market
            .getLatestEpoch();

        // Adjust the start time for the next epoch
        newEpochStartTime += duration + 1;

        _initializeEpoch(newEpochStartTime, previousResolutionSqrtPriceX96);

        // Settle the position and get the collateral received
        uint256 collateralReceived = market.settlePosition(positionId);

        // Process the epoch transition and pass the collateral received
        _processEpochTransition(collateralReceived);
    }

    function _processEpochTransition(uint256 collateralReceived) internal {
        EpochData storage currentEpoch = epochs[epochs.length - 1];

        uint256 netSupply = totalSupply();

        // Calculate the new share price
        uint256 newSharePrice = netSupply > 0
            ? (totalAssets() * 1e18) / netSupply
            : 1e18;

        currentEpoch.sharePrice = newSharePrice;
        currentEpoch.processed = true;

        // Process pending deposits
        uint256 totalNewShares = (currentEpoch.totalPendingDeposits * 1e18) /
            newSharePrice;
        _mintShares(address(this), totalNewShares);

        // Distribute new shares to depositors
        address[] memory epochDepositors = depositors[currentEpoch.epochId];
        for (uint256 i = 0; i < epochDepositors.length; i++) {
            address user = epochDepositors[i];
            uint256 userDeposit = userPendingDeposits[user][
                currentEpoch.epochId
            ];
            uint256 userNewShares = (userDeposit * 1e18) / newSharePrice;

            // Transfer shares from the vault to the user
            _update(address(this), user, userNewShares);
            // Update user shares
            userShares[user] += userNewShares;

            // Clean up pending deposits
            delete userPendingDeposits[user][currentEpoch.epochId];
        }

        // Process pending withdrawals
        uint256 totalSharesToBurn = currentEpoch.totalPendingWithdrawals;
        // Shares were transferred to the vault in _requestRedeem
        // Burn the shares from the vault's balance
        _burnShares(address(this), totalSharesToBurn);

        address[] memory epochWithdrawers = withdrawers[currentEpoch.epochId];
        uint256 totalWithdrawalAmount = 0;
        for (uint256 i = 0; i < epochWithdrawers.length; i++) {
            address user = epochWithdrawers[i];
            uint256 userWithdrawalShares = userPendingWithdrawalShares[user][
                currentEpoch.epochId
            ];
            uint256 withdrawalAmount = (userWithdrawalShares * newSharePrice) /
                1e18;

            totalWithdrawalAmount += withdrawalAmount;

            // Transfer collateral to the user
            collateralAsset.safeTransfer(user, withdrawalAmount);

            // Clean up pending withdrawals
            delete userPendingWithdrawalShares[user][currentEpoch.epochId];
        }

        emit EpochProcessed(
            currentEpoch.epochId,
            newSharePrice,
            totalNewShares,
            totalSharesToBurn
        );

        // Clean up depositor and withdrawer lists for the epoch
        delete depositors[currentEpoch.epochId];
        delete withdrawers[currentEpoch.epochId];

        // Calculate the total collateral available for the new liquidity position
        // This includes the collateral received plus any uninvested collateral after withdrawals
        uint256 totalCollateral = collateralReceived +
            collateralAsset.balanceOf(address(this)) -
            totalWithdrawalAmount;

        // Call _createNewLiquidityPosition with the correct totalCollateral
        _createNewLiquidityPosition(totalCollateral);
    }

    function _createNewLiquidityPosition(uint256 totalCollateral) private {
        uint256 epochId = epochs.length - 1;

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
        (positionId, , , , , ) = market.createLiquidityPosition(params);
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
        uint256 pendingWithdrawals = _getPendingWithdrawals();
        uint256 pendingDeposits = _getPendingDeposits();

        uint256 totalManagedAssets = investedAssets -
            pendingWithdrawals +
            pendingDeposits;
        return totalManagedAssets;
    }

    function convertToShares(
        uint256 assets
    ) public view override returns (uint256 sharesAmount) {
        // Converts assets to shares based on current exchange rate
        uint256 supply = totalSupply();
        return supply == 0 ? assets : (assets * supply) / totalAssets();
    }

    function convertToAssets(
        uint256 sharesAmount
    ) public view override returns (uint256 assets) {
        // Converts shares to assets based on current exchange rate
        uint256 supply = totalSupply();
        return
            supply == 0
                ? sharesAmount
                : (sharesAmount * totalAssets()) / supply;
    }

    function maxDeposit(
        address receiver
    ) external pure override returns (uint256 maxAssets) {
        // Maximum assets that can be deposited
        return type(uint256).max;
    }

    function maxMint(
        address receiver
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
        Epoch7540Data storage epochData = epochs7540[currentFutureEpochIdx];
        epochData.totalPendingDeposit += assets;
        epochData.userNonExecutedDeposits[owner] += assets;
        globalTotalPendingDeposit += assets;
        if (!user7540DirtyEpochs[owner].contains(currentFutureEpochIdx)) {
            user7540DirtyEpochs[owner].add(currentFutureEpochIdx);
        }
    }

    // amount pending to deposit (not claimable, it means, not yet ready to deposit/mint)
    function pendingDepositRequest(
        uint256, // requestId is ignored
        address owner
    ) external view override returns (uint256 assets) {
        uint256 currentEpochId = epochs[epochs.length - 1].epochId;
        assets = userPendingDeposits[owner][currentEpochId];
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
    function deposit(
        uint256 assets,
        address receiver
    ) external override returns (uint256 sharesAmount) {
        uint256 mintedAssetValue = mint(convertToShares(assets), receiver);
        // NOTE Use convertToShares with Round.Down

        sharesAmount = convertToShares(mintedAssetValue);
    }

    // Sends actor's collateral to the vault, gets shares (gets convertToAsset(sharesAmount), mints sharesAmount)
    // notice: this is the second part of the Async requestDeposit -> deposit/mint
    // notice: the max amount or effective amount is same as claimable
    function mint(
        uint256 sharesAmount,
        address receiver
    ) public override returns (uint256 assets) {
        assets = convertToAssets(sharesAmount);
        require(assets != 0, "Cannot mint zero shares");
        require(currentFutureEpochIdx > 0, "no previous epoch yet");
        // Simplification here - only previous epoch contains unclaimed deposits. TODO make it right
        // Use convertToShares with Rounding.Down
        Epoch7540Data storage previousEpochData = epochs7540[
            currentFutureEpochIdx - 1
        ];

        uint256 userClaimable = previousEpochData.userNonExecutedDeposits[
            receiver
        ];
        // Notice, ignoring assets, getting all, if partials are allowed, use decrement here by assets
        previousEpochData.userNonExecutedDeposits[receiver] = 0;
        previousEpochData.totalClaimableDeposit -= userClaimable;
        globalTotalClaimableDeposit -= userClaimable;

        assets = mint(convertToShares(userClaimable), receiver);

        emit Deposit(msg.sender, receiver, assets, userClaimable);
    }

    // Sends back collateral to the actor, burns shares (burns sharesAmount = convertToShares(assets); send to actor assets of asset)
    // notice: this is the first part of the Async requestRedeem -> redeem/withdraw
    function requestRedeem(
        uint256 sharesAmount,
        address operator,
        address owner
    ) external override returns (uint256 requestId) {
        require(owner != address(0), "Invalid owner");
        require(userShares[owner] >= sharesAmount, "Insufficient shares");

        if (msg.sender != owner) {
            uint256 allowed = allowance(owner, msg.sender);
            require(allowed >= sharesAmount, "Redeem exceeds allowance");
            _approve(owner, msg.sender, allowed - sharesAmount);
        }

        // _requestRedeem(sharesAmount, operator, owner);
    }

    // amount pending to redeem (not claimable, it means, not yet ready to redeem/withdraw)
    function pendingRedeemRequest(
        uint256, // ignored requestId
        address owner
    ) external view override returns (uint256 sharesAmount) {
        uint256 currentEpochId = epochs[epochs.length - 1].epochId;
        sharesAmount = userPendingWithdrawalShares[owner][currentEpochId];
    }

    // amount claimable to redeem (not pending, it means, ready to redeem/withdraw)
    function claimableRedeemRequest(
        uint256, // ignored requestId
        address owner
    ) external view override returns (uint256 sharesAmount) {
        uint256 currentEpochId = epochs[epochs.length - 1].epochId;
        sharesAmount = userPendingWithdrawalShares[owner][currentEpochId];
    }

    // Sends back collateral to the actor, burns shares (burns sharesAmount = convertToShares(assets); send to actor assets of asset)
    // notice: this is the second part of the Async requestToWithdraw / withdraw
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) external override returns (uint256 sharesAmount) {
        sharesAmount = convertToShares(assets);
        require(sharesAmount != 0, "Cannot withdraw zero assets");

        if (msg.sender != owner) {
            uint256 allowed = allowance(owner, msg.sender);
            require(allowed >= sharesAmount, "Withdraw exceeds allowance");
            _approve(owner, msg.sender, allowed - sharesAmount);
        }

        _requestRedeem(sharesAmount, receiver, owner, "");
        emit Withdraw(msg.sender, receiver, owner, assets, sharesAmount);
    }

    // Sends back collateral to the actor, burns shares (burns sharesAmount ; send to actor assets = convertToAsset(sharesAmount) of asset)
    // notice: this is the second part of the Async requestToWithdraw / redeem
    function redeem(
        uint256 sharesAmount,
        address receiver,
        address owner
    ) external override returns (uint256 assets) {
        assets = convertToAssets(sharesAmount);
        require(assets != 0, "Cannot redeem zero shares");

        if (msg.sender != owner) {
            uint256 allowed = allowance(owner, msg.sender);
            require(allowed >= sharesAmount, "Redeem exceeds allowance");
            _approve(owner, msg.sender, allowed - sharesAmount);
        }

        _requestRedeem(sharesAmount, receiver, owner, "");
        emit Withdraw(msg.sender, receiver, owner, assets, sharesAmount);
    }

    function _requestDeposit(
        uint256 assets,
        address receiver,
        address owner,
        bytes memory data
    ) internal {
        uint256 currentEpochId = epochs[epochs.length - 1].epochId;
        userPendingDeposits[receiver][currentEpochId] += assets;
        epochs[epochs.length - 1].totalPendingDeposits += assets;

        // TODO add to set of epochs requested by receiver

        // Keep track of depositors
        depositors[currentEpochId].push(receiver);

        emit DepositRequest(
            receiver,
            owner,
            currentEpochId,
            msg.sender,
            assets
        );
    }

    function _requestRedeem(
        uint256 sharesAmount,
        address receiver,
        address owner,
        bytes memory data
    ) internal {
        uint256 currentEpochId = epochs[epochs.length - 1].epochId;

        // Transfer the tokens from the user to the contract
        _update(owner, address(this), sharesAmount);

        // Record pending withdrawal shares
        userPendingWithdrawalShares[owner][currentEpochId] += sharesAmount;
        epochs[epochs.length - 1].totalPendingWithdrawals += sharesAmount;

        // Keep track of withdrawers
        withdrawers[currentEpochId].push(owner);

        emit RedeemRequest(
            receiver,
            owner,
            currentEpochId,
            msg.sender,
            sharesAmount
        );
    }

    function withdrawPendingDeposit(uint256 assets) external {
        uint256 currentEpochId = epochs[epochs.length - 1].epochId;
        require(
            userPendingDeposits[msg.sender][currentEpochId] >= assets,
            "Insufficient pending deposit"
        );

        userPendingDeposits[msg.sender][currentEpochId] -= assets;
        epochs[epochs.length - 1].totalPendingDeposits -= assets;

        collateralAsset.safeTransfer(msg.sender, assets);
    }

    function cancelWithdrawalRequest(uint256 sharesAmount) external {
        uint256 currentEpochId = epochs[epochs.length - 1].epochId;
        require(
            userPendingWithdrawalShares[msg.sender][currentEpochId] >=
                sharesAmount,
            "Insufficient pending withdrawal"
        );

        userPendingWithdrawalShares[msg.sender][currentEpochId] -= sharesAmount;
        epochs[epochs.length - 1].totalPendingWithdrawals -= sharesAmount;

        // Transfer the tokens back to the user
        _update(address(this), msg.sender, sharesAmount);
    }

    modifier onlyMarket() {
        require(
            msg.sender == address(market),
            "Only market can call this function"
        );
        _;
    }

    function _getPendingWithdrawals() internal view returns (uint256) {
        uint256 totalPendingWithdrawals = 0;
        for (uint256 i = 0; i < epochs.length; i++) {
            totalPendingWithdrawals += epochs[i].totalPendingWithdrawals;
        }
        return totalPendingWithdrawals;
    }

    function _getPendingDeposits() internal view returns (uint256) {
        uint256 totalPendingDeposits = 0;
        for (uint256 i = 0; i < epochs.length; i++) {
            totalPendingDeposits += epochs[i].totalPendingDeposits;
        }
        return totalPendingDeposits;
    }

    event WithdrawPendingDeposit(
        address indexed user,
        uint256 assets,
        uint256 epochId
    );

    function _update(
        address from,
        address to,
        uint256 amount
    ) internal override {
        super._update(from, to, amount);

        // Update userShares mapping accordingly
        if (from != address(0) && from != address(this)) {
            userShares[from] -= amount;
        }
        if (to != address(0) && to != address(this)) {
            userShares[to] += amount;
        }
    }

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
}
