// // contracts/FoilImplementation.sol
// // SPDX-License-Identifier: MIT
// pragma solidity >=0.8.25 <0.9.0;

// import "./VirtualToken.sol";
// import "./FoilNFT.sol";
// import "../storage/EpochFactory.sol";
// import "../storage/Epoch.sol";
// import "../storage/Position.sol";
// import "../storage/Account.sol";
// import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
// import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
// import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


// contract FoilImplementation is
//     IUniswapV3MintCallback,
//     IUniswapV3SwapCallback,
//     ReentrancyGuard
// {
//     using EpochFactory for EpochFactory.Data;
//     using Epoch for Epoch.Data;
//     using Position for Position.Data;
//     using Account for Account.Data;
//     // FoilNFT represents the account of an user. It is a NFT that can be transferred to other users.
//     FoilNFT public foilNFT;
//     IERC20 public collateralToken;

//     uint256 private constant WEI_TOKEN = 1;
//     uint256 private constant GAS_TOKEN = 2;

//     constructor(
//         address _foilNFT,
//         IUniswapV3Factory _uniswapFactoryAddress,
//         IERC20 _collateralToken
//     ) {
//         foilNFT = FoilNFT(_foilNFT);
//         collateralToken = _collateralToken;
//         EpochFactory.Data storage ef = EpochFactory.load();
//         ef.uniFactory = IUniswapV3Factory(_uniswapFactoryAddress);
//     }

//     // --- Margin deposit and withdraw ---
//     function deposit(uint256 accountId, uint256 amount) external {
//         Account.Data storage account = Account.loadValid(accountId);
//         account.isAuthorized(foilNFT, msg.sender);
//         collateralToken.transferFrom(msg.sender, address(this), amount);
//         account.deposit(amount);
//     }

//     function withdraw(uint256 accountId, uint256 amount) external nonReentrant {
//         Account.Data storage account = Account.loadValid(accountId);
//         account.isAuthorized(foilNFT, msg.sender);
//         account.withdraw(amount);
//         collateralToken.transfer(msg.sender, amount);
//     }

//     // --- Epochs ---
//     function findCurrentEpoch() external view returns (uint256) {
//         EpochFactory.Data storage ef = EpochFactory.load();
//         return ef.findCurrentEpoch();
//     }

//     function startEpoch(uint256 _startTime, uint256 _endTime) external {
//         uint24 fee = 3000;
//         EpochFactory.Data storage ef = EpochFactory.load();
//         ef.startEpoch(_startTime, _endTime, fee, address(this));
//         // Should we set the settlementPRice here?
//     }

//     function settleEpoch(uint256 epochId) external {
//         Epoch.Data storage epoch = Epoch.load(epochId);
//         epoch.settle();
//     }

//     // --- Debt ---
//     function payDebt(uint256 accountId, uint256 epochId) external {
//         Account.Data storage account = Account.loadValid(accountId);
//         account.isAuthorized(foilNFT, msg.sender);
//         // TODO check if can pay that amount
//         // notice: using the epoch rate, calculate the amount of gas tokens and wei tokens to burn, the user holding and swap them to pay. If needed it will mint more from the deposited collateral

//         // TODO adjust balances
//     }

//     function accountEpochDebt(
//         uint256 accountId,
//         uint256 epochId
//     ) external view returns (uint256) {
//         Account.Data storage account = Account.loadValid(accountId);
//         account.isAuthorized(foilNFT, msg.sender);

//         // TODO calculate current debt
//     }

//     function accountGlobalDebt(
//         uint256 accountId
//     ) external view returns (uint256) {
//         Account.Data storage account = Account.loadValid(accountId);
//         account.isAuthorized(foilNFT, msg.sender);
//         // TODO calculate current debt
//     }

//     // --- Liquidation ---
//     function accountLiquidatable(
//         uint256 accountId
//     ) external view returns (bool) {
//         Account.Data storage account = Account.loadValid(accountId);
//         account.isAuthorized(foilNFT, msg.sender);
//         // TODO check if account is liquidatable
//     }

//     function liquidateAccount(uint256 accountId) external {
//         Account.Data storage account = Account.loadValid(accountId);
//         // TODO check if account is liquidatable
//         // TODO liquidate account
//         // notice: liquidating an account involves burning all the gas tokens and wei tokens, adjust balances (remaining colalteral stay here to pay other LPs)
//         // TODO pay fee to liquidator
//         // TODO adjust balances
//     }

//     // --- Position operations ---
//     function supply(
//         uint256 accountId,
//         uint256 epochId,
//         uint256 amountGwei,
//         uint256 amountGGas,
//         uint256 priceMin,
//         uint256 priceMax
//     ) external {
//         Account.Data storage account = Account.loadValid(accountId);
//         account.isAuthorized(foilNFT, msg.sender);
//         // TODO check if can supply that amount
//         // notice: using the epoch rate, calculate the amount of gas tokens and wei tokens to mint,
//         uint rate = Epoch.loadValid(epochId).getCurrentPrice();

//         // calculate the user holding and swap them to supply to the pool
//         // TODO adjust balances
//     }

//     function closePosition(uint256 accountId, uint256 epochId) external {
//         Account.Data storage account = Account.loadValid(accountId);
//         account.isAuthorized(foilNFT, msg.sender);

//         // TODO check epoch is closed

//         Epoch.Data storage epoch = Epoch.loadValid(epochId);
//         Position.Data storage position = Position.loadValid(
//             account.epochPosition[epochId]
//         );

//         uint midRangePrice = (position.priceMin + position.priceMax) / 2;
//         if (epoch.settlementPrice >= position.priceMax) {
//             // Passing through range means user sold all GAS tokens for GWEI tokens (@GAS/GWEI = mid range price)
//             account.freeGweiAmount +=
//                 position.amountGwei +
//                 position.amountGas *
//                 midRangePrice;
//             account.freeGasAmount += 0;
//             position.amountGas = 0;
//             position.amountGwei = 0;
//         } else if (epoch.settlementPrice <= position.priceMin) {
//             account.freeGweiAmount += 0;
//             account.freeGasAmount +=
//                 position.amountGas +
//                 position.amountGwei /
//                 midRangePrice;
//             position.amountGas = 0;
//             position.amountGwei = 0;
//         } else {
//             // in range
//             // TODO do the maths
//         }
//         // TODO burn gas and wei tokens if needed
//         // Notice: don't need to do anything on the pool side since epoch is settled

//         // TODO adjust balances
//     }

//     // --- Token mint and burn ---
//     // function mintGasToken(
//     //     uint256 accountId,
//     //     uint256 amount,
//     //     uint256 epochId
//     // ) external {
//     //     _mintToken(accountId, amount, epochId, GAS_TOKEN);
//     // }

//     // function burnGasToken(
//     //     uint256 accountId,
//     //     uint256 amount,
//     //     uint256 epochId
//     // ) external {
//     //     _burnToken(accountId, amount, epochId, GAS_TOKEN);
//     // }

//     // function mintWeiToken(
//     //     uint256 accountId,
//     //     uint256 amount,
//     //     uint256 epochId
//     // ) external {
//     //     _mintToken(accountId, amount, epochId, WEI_TOKEN);
//     // }

//     // function burnWeiToken(
//     //     uint256 accountId,
//     //     uint256 amount,
//     //     uint256 epochId
//     // ) external {
//     //     _burnToken(accountId, amount, epochId, WEI_TOKEN);
//     // }

//     // function _mintToken(
//     //     uint256 accountId,
//     //     uint256 amount,
//     //     uint256 epochId,
//     //     uint256 tokenType
//     // ) internal {
//     //     Account.Data storage account = Account.loadValid(accountId);
//     //     account.isAuthorized(foilNFT, msg.sender);
//     //     // TODO check if epoch is valid
//     //     // TODO check if epoch is not over and can mint
//     //     // TODO check if can mint that amount
//     //     // TODO mint amount of gas token
//     //     // TODO transfer amount of gas token to msg.sender
//     //     // TODO adjust balances
//     // }

//     // function _burnToken(
//     //     uint256 accountId,
//     //     uint256 amount,
//     //     uint256 epochId,
//     //     uint256 tokenType
//     // ) internal {
//     //     Account.Data storage account = Account.loadValid(accountId);
//     //     account.isAuthorized(foilNFT, msg.sender);
//     //     // TODO check if epoch is valid
//     //     // TODO check if can burn that amount
//     //     // TODO transfer amount of gas token from msg.sender
//     //     // TODO burn amount of gas token
//     //     // TODO adjust balances
//     // }

    
// }
