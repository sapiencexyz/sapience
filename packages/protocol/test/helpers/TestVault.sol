// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {TestTrade} from "./TestTrade.sol";
import {IFoil} from "../../src/market/interfaces/IFoil.sol";
import {IVault} from "../../src/vault/interfaces/IVault.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {IFoilStructs} from "../../src/market/interfaces/IFoilStructs.sol";

contract TestVault is TestTrade {
    using Cannon for Vm;

    address public constant vaultOwner =
        0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    function initializeVault(
        address[] memory feeCollectors,
        uint256 bondAmount,
        uint256 minTradeSize,
        uint256 minCollateral
    )
        internal
        returns (
            IFoil foilContract,
            IVault vaultContract,
            IMintableToken collateralAssetContract
        )
    {
        foilContract = IFoil(vm.getAddress("Foil"));
        vaultContract = IVault(vm.getAddress("Vault"));

        collateralAssetContract = initializeMarketWithVault(
            foilContract,
            address(vaultContract),
            feeCollectors,
            minTradeSize,
            minCollateral,
            bondAmount
        );
    }

    function initializeMarketWithVault(
        IFoil foil,
        address vault,
        address[] memory feeCollectors,
        uint256 minTradeSize,
        uint256 minCollateral,
        uint256 bondAmount
    ) internal returns (IMintableToken collateralAssetContract) {
        collateralAssetContract = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );
        vm.startPrank(vaultOwner);
        // Initialize Market (by owner, links fail market with vault)
        foil.initializeMarket(
            vault,
            address(collateralAssetContract),
            feeCollectors,
            vault,
            minTradeSize,
            minCollateral,
            IFoilStructs.MarketParams({
                feeRate: 10000,
                assertionLiveness: 21600,
                bondCurrency: vm.getAddress("BondCurrency.Token"),
                bondAmount: bondAmount,
                claimStatement: "wstGwei/gas",
                uniswapPositionManager: vm.getAddress(
                    "Uniswap.NonfungiblePositionManager"
                ),
                uniswapSwapRouter: vm.getAddress("Uniswap.SwapRouter"),
                uniswapQuoter: vm.getAddress("Uniswap.QuoterV2"),
                optimisticOracleV3: vm.getAddress("UMA.OptimisticOracleV3")
            })
        );
        vm.stopPrank();
    }

    function initializeFirstEpoch(uint160 _initialSqrtPriceX96) internal {
        vm.startPrank(vaultOwner);

        // Initialize Epoch (by owner, kicks the ball with the first epoch)
        IVault(vm.getAddress("Vault")).initializeFirstEpoch(
            _initialSqrtPriceX96
        );

        vm.stopPrank();
    }

    function settleEpochFromVault(
        uint256 epochId,
        uint160 price,
        address submitter
    ) internal {
        IFoil foil = IFoil(vm.getAddress("Foil"));
        IVault vault = IVault(vm.getAddress("Vault"));

        (, , , , IFoilStructs.MarketParams memory marketParams) = foil
            .getMarket();

        IMintableToken bondCurrency = IMintableToken(
            vm.getAddress("BondCurrency.Token")
        );
        bondCurrency.mint(marketParams.bondAmount * 2, submitter);
        vm.startPrank(submitter);

        bondCurrency.approve(address(vault), marketParams.bondAmount);
        bytes32 assertionId = vault.submitMarketSettlementPrice(epochId, price);
        vm.stopPrank();

        address optimisticOracleV3 = vm.getAddress("UMA.OptimisticOracleV3");
        vm.startPrank(optimisticOracleV3);
        foil.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();
    }
}
